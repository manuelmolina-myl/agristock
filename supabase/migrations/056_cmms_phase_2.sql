-- ============================================================================
-- 056_cmms_phase_2.sql
--
-- Fase 2 del CMMS:
--
-- 1. Firma de cierre de OT (analogía con OC):
--    - work_orders.signed_off_url, signed_off_by, signed_off_at
--    - RPC sign_off_wo(wo_id, signature_url) — admin/mantenimiento sólo
--      cuando status = 'completed'; pasa a 'closed'
--    - RPC revert_wo_signoff(wo_id) — desbloquea para correcciones
--
-- 2. Auto-trigger requisición desde partes consumidas en una OT:
--    - RPC create_requisition_from_wo_parts(wo_id, justification)
--      crea una requisición draft con los items que tenga la OT con
--      consumo > stock_disponible (o todos los items consumidos si no
--      se pasa filtro)
--
-- 3. Vista pm_schedule_calendar — PMs programados con info para render
--    de calendario.
-- ============================================================================

-- ─── 1. WO sign-off ────────────────────────────────────────────────────────
alter table public.work_orders
  add column if not exists signed_off_by   uuid references auth.users(id),
  add column if not exists signed_off_at   timestamptz,
  add column if not exists signature_url   text;

comment on column public.work_orders.signature_url is
  'Storage path (bucket cotizaciones) del PNG con la firma manuscrita del técnico/admin que cerró la OT.';

create or replace function public.sign_off_wo(
  p_wo_id          uuid,
  p_signature_url  text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status public.wo_status;
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso para cerrar la OT' using errcode = '42501';
  end if;

  select status into v_status
    from public.work_orders
   where id = p_wo_id
     and organization_id = public.auth_org_id()
     and deleted_at is null;

  if v_status is null then
    raise exception 'OT no encontrada' using errcode = 'P0002';
  end if;
  if v_status <> 'completed' then
    raise exception 'Sólo se puede firmar el cierre desde estado completada (actual: %)', v_status
      using errcode = 'P0001';
  end if;

  update public.work_orders
     set status         = 'closed',
         signed_off_by  = v_user,
         signed_off_at  = now(),
         signature_url  = p_signature_url,
         updated_at     = now()
   where id = p_wo_id;

  return p_wo_id;
end;
$$;

revoke all on function public.sign_off_wo(uuid, text) from public;
grant execute on function public.sign_off_wo(uuid, text) to authenticated;

-- Revertir el cierre — permite correcciones a partes/labor sin re-crear OT.
create or replace function public.revert_wo_signoff(p_wo_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status public.wo_status;
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  select status into v_status
    from public.work_orders
   where id = p_wo_id
     and organization_id = public.auth_org_id()
     and deleted_at is null;

  if v_status <> 'closed' then
    raise exception 'Sólo se puede revertir desde cerrada' using errcode = 'P0001';
  end if;

  update public.work_orders
     set status         = 'completed',
         signed_off_by  = null,
         signed_off_at  = null,
         signature_url  = null,
         updated_at     = now()
   where id = p_wo_id;

  return p_wo_id;
end;
$$;

revoke all on function public.revert_wo_signoff(uuid) from public;
grant execute on function public.revert_wo_signoff(uuid) to authenticated;

-- ─── 2. Auto-trigger requisición desde partes consumidas ─────────────────
-- Crea una requisición en status 'submitted' con líneas correspondientes a
-- los items de wo_parts.  Cantidad = qty_consumed * factor (default 1, para
-- restock).  Marca la requisición con notas que indican el origen (OT folio).
create or replace function public.create_requisition_from_wo_parts(
  p_wo_id          uuid,
  p_factor         numeric default 1.0,
  p_priority       text default 'medium'
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_wo   public.work_orders%rowtype;
  v_folio  text;
  v_req_id uuid;
  v_lines_count int;
begin
  if not public.can_write_purchase(v_user) and not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso para crear requisición' using errcode = '42501';
  end if;

  select * into v_wo
    from public.work_orders
   where id = p_wo_id
     and organization_id = v_org
     and deleted_at is null;

  if v_wo.id is null then
    raise exception 'OT no encontrada' using errcode = 'P0002';
  end if;

  select count(*) into v_lines_count
    from public.wo_parts
   where wo_id = p_wo_id
     and delivered_quantity > 0
     and item_id is not null;

  if v_lines_count = 0 then
    raise exception 'La OT no tiene partes consumidas para restock' using errcode = 'P0001';
  end if;

  v_folio := public.next_folio(v_org, 'requisition');

  insert into public.purchase_requisitions (
    organization_id, folio, requester_id, priority, justification,
    equipment_id, notes, status
  ) values (
    v_org,
    v_folio,
    v_user,
    coalesce(nullif(p_priority, '')::requisition_priority, 'medium'::requisition_priority),
    'Restock de partes consumidas en OT ' || v_wo.folio,
    v_wo.equipment_id,
    'Generada automáticamente desde OT ' || v_wo.folio
      || coalesce(' — ' || v_wo.failure_description, ''),
    'submitted'
  )
  returning id into v_req_id;

  -- Líneas: una por wo_parts con delivered_quantity > 0.
  insert into public.requisition_lines (
    requisition_id, item_id, quantity, currency, notes
  )
  select
    v_req_id,
    wp.item_id,
    wp.delivered_quantity * p_factor,
    coalesce(i.native_currency, 'MXN'::currency_code),
    'Reposición OT ' || v_wo.folio
  from public.wo_parts wp
  join public.items i on i.id = wp.item_id
  where wp.wo_id = p_wo_id
    and wp.delivered_quantity > 0
    and wp.item_id is not null;

  return v_req_id;
end;
$$;

revoke all on function public.create_requisition_from_wo_parts(uuid, numeric, text) from public;
grant execute on function public.create_requisition_from_wo_parts(uuid, numeric, text) to authenticated;

-- ─── 3. Vista pm_schedule_calendar ────────────────────────────────────────
-- Devuelve PMs programados (work_orders con wo_type='preventive' y
-- scheduled_date) para render de calendario.  Incluye los próximos 90 días
-- + los últimos 30 días (para que se vean los recién vencidos).
create or replace view public.pm_schedule_calendar as
  select
    wo.id,
    wo.organization_id,
    wo.folio,
    wo.scheduled_date,
    wo.status,
    wo.priority,
    wo.equipment_id,
    e.name              as equipment_name,
    e.code              as equipment_code,
    e.criticality       as equipment_criticality,
    wo.estimated_hours,
    wo.primary_technician_id,
    emp.full_name       as technician_name,
    wo.failure_description as task_description,
    case
      when wo.status in ('completed', 'closed') then 'done'
      when wo.scheduled_date < current_date then 'overdue'
      when wo.scheduled_date <= current_date + interval '7 days' then 'this_week'
      else 'upcoming'
    end as schedule_bucket
  from public.work_orders wo
  join public.equipment e on e.id = wo.equipment_id
  left join public.employees emp on emp.id = wo.primary_technician_id
  where wo.deleted_at is null
    and wo.wo_type = 'preventive'
    and wo.scheduled_date is not null
    and wo.scheduled_date between (current_date - interval '30 days')
                              and (current_date + interval '90 days');

grant select on public.pm_schedule_calendar to authenticated;

comment on view public.pm_schedule_calendar is
  'PMs en ventana [-30d, +90d] para render de calendario.  Bucket: done/overdue/this_week/upcoming.';
