-- ============================================================================
-- 057_cmms_phase_3.sql
--
-- Fase 3 del CMMS:
--
-- 1. Auto-generación de PMs desde maintenance_plans cuando se cumple el
--    trigger (hours / kilometers / calendar).
--    - RPC generate_due_pms(p_dry_run boolean) — escanea planes activos,
--      compara contra equipment.current_hours / current_km / current_date,
--      crea WOs preventivas en status='scheduled' para los que estén due
--      o dentro del advance_warning.  Idempotente: evita duplicados
--      buscando una WO abierta del mismo plan en ventana.
--    - RPC list_due_pms() — dry-run, regresa lo que generate_due_pms()
--      crearía sin insertar nada.
--
-- 2. Skills matrix de empleados (técnicos):
--    - employees.skills text[] (default array vacío)
--    - employees.is_technician boolean
--    - employees.hourly_rate_mxn numeric
--    - Vista technician_workload con # OTs asignadas activas por
--      técnico para soporte de "asignar al menos cargado".
-- ============================================================================

-- ─── 1. Skills + tech metadata ────────────────────────────────────────────
alter table public.employees
  add column if not exists skills           text[] default '{}'::text[],
  add column if not exists is_technician    boolean not null default false,
  add column if not exists hourly_rate_mxn  numeric(12,2);

create index if not exists idx_employees_skills_gin on public.employees using gin (skills);

-- Vista: técnicos con carga actual.  RLS heredado de employees.
create or replace view public.technician_workload as
  select
    e.id                                       as employee_id,
    e.organization_id,
    e.full_name,
    e.employee_code,
    e.skills,
    e.is_technician,
    e.hourly_rate_mxn,
    count(wo.id) filter (
      where wo.status in ('assigned', 'in_progress', 'waiting_parts', 'scheduled')
    )                                          as active_wo_count,
    count(wo.id) filter (
      where wo.status in ('completed', 'closed')
        and wo.completed_at >= now() - interval '30 days'
    )                                          as completed_30d,
    avg(extract(epoch from (wo.completed_at - wo.started_at)) / 3600)
      filter (where wo.completed_at is not null and wo.started_at is not null)
                                               as avg_mttr_hours
  from public.employees e
  left join public.work_orders wo
    on wo.primary_technician_id = e.id
   and wo.organization_id = e.organization_id
   and wo.deleted_at is null
  where e.is_active
    and e.deleted_at is null
  group by e.id;

grant select on public.technician_workload to authenticated;

-- ─── 2. Auto-generación de PMs ────────────────────────────────────────────
-- Una WO preventiva ya abierta del mismo plan bloquea la generación de
-- otra (idempotencia).  Las que estén "due" se crean en status='scheduled'.

-- Helper: determina si un plan está due o en ventana de advance_warning.
create or replace function public.pm_plan_is_due(
  p_plan_id   uuid,
  p_now_value numeric default null  -- current_hours / current_km / null=ignore
) returns boolean
language sql security definer
set search_path = public, pg_temp
as $$
  select case
    when mp.trigger_type = 'calendar' then
      -- next_execution_value se interpreta como días desde epoch (o como
      -- fecha en formato julian).  Para simplicidad asumimos
      -- next_execution_value <= extract(epoch from current_date) / 86400
      mp.next_execution_value <= extract(epoch from current_date) / 86400
        + coalesce(mp.advance_warning, 0)
    when mp.trigger_type in ('hours', 'usage_hours', 'kilometers') then
      coalesce(p_now_value, 0) >= mp.next_execution_value
        - coalesce(mp.advance_warning, 0)
    else false
  end
  from public.maintenance_plans mp
  where mp.id = p_plan_id;
$$;

-- list_due_pms — dry-run.  Regresa los planes due con info para la UI.
create or replace function public.list_due_pms()
returns table (
  plan_id            uuid,
  plan_name          text,
  equipment_id       uuid,
  equipment_code     text,
  equipment_name     text,
  trigger_type       public.plan_trigger_type,
  current_value      numeric,
  next_execution     numeric,
  due_by             numeric,
  has_open_wo        boolean
)
language sql security definer
set search_path = public, pg_temp
as $$
  select
    mp.id,
    mp.name,
    e.id,
    e.code,
    e.name,
    mp.trigger_type,
    case
      when mp.trigger_type in ('hours', 'usage_hours') then coalesce(e.current_hours, 0)
      when mp.trigger_type = 'kilometers' then coalesce(e.current_km, 0)
      when mp.trigger_type = 'calendar' then extract(epoch from current_date) / 86400
      else 0
    end as current_value,
    mp.next_execution_value,
    mp.next_execution_value - coalesce(mp.advance_warning, 0) as due_by,
    exists (
      select 1 from public.work_orders wo
       where wo.maintenance_plan_id = mp.id
         and wo.status not in ('completed', 'closed', 'cancelled')
         and wo.deleted_at is null
    ) as has_open_wo
  from public.maintenance_plans mp
  join public.equipment e on e.id = mp.equipment_id
  where mp.is_active
    and mp.deleted_at is null
    and mp.organization_id = public.auth_org_id()
    and public.pm_plan_is_due(
      mp.id,
      case
        when mp.trigger_type in ('hours', 'usage_hours') then coalesce(e.current_hours, 0)
        when mp.trigger_type = 'kilometers' then coalesce(e.current_km, 0)
        else null
      end
    );
$$;

grant execute on function public.list_due_pms() to authenticated;

-- generate_due_pms — efectiva.  Crea WOs preventivas para los planes due
-- que no tengan ya una OT abierta.  Retorna conteo de generados.
create or replace function public.generate_due_pms(
  p_dry_run boolean default false
) returns table (
  generated_count int,
  plan_ids        uuid[]
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_plan record;
  v_wo_id uuid;
  v_folio  text;
  v_ids    uuid[] := '{}'::uuid[];
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso para generar PMs' using errcode = '42501';
  end if;

  for v_plan in
    select
      mp.id          as plan_id,
      mp.equipment_id,
      mp.name        as plan_name,
      mp.trigger_type,
      mp.interval_value,
      mp.next_execution_value,
      mp.default_checklist
    from public.maintenance_plans mp
    join public.equipment e on e.id = mp.equipment_id
   where mp.is_active
     and mp.deleted_at is null
     and mp.organization_id = v_org
     and public.pm_plan_is_due(
           mp.id,
           case
             when mp.trigger_type in ('hours', 'usage_hours') then coalesce(e.current_hours, 0)
             when mp.trigger_type = 'kilometers' then coalesce(e.current_km, 0)
             else null
           end
         )
     and not exists (
       select 1 from public.work_orders wo
        where wo.maintenance_plan_id = mp.id
          and wo.status not in ('completed', 'closed', 'cancelled')
          and wo.deleted_at is null
     )
  loop
    if p_dry_run then
      v_ids := array_append(v_ids, v_plan.plan_id);
      continue;
    end if;

    v_folio := public.next_folio(v_org, 'work_order');

    insert into public.work_orders (
      organization_id, folio, equipment_id, wo_type, priority,
      failure_description, maintenance_plan_id, reported_by,
      scheduled_date, status
    ) values (
      v_org,
      v_folio,
      v_plan.equipment_id,
      'preventive'::wo_type,
      'medium'::wo_priority,
      'PM programado: ' || v_plan.plan_name,
      v_plan.plan_id,
      v_user,
      current_date,
      'scheduled'
    )
    returning id into v_wo_id;

    -- Seed checklist desde plan.default_checklist (jsonb array of strings).
    if v_plan.default_checklist is not null
       and jsonb_typeof(v_plan.default_checklist) = 'array' then
      insert into public.wo_checklist (wo_id, task, display_order, is_completed)
      select v_wo_id, t::text, ord, false
      from jsonb_array_elements_text(v_plan.default_checklist) with ordinality as a(t, ord);
    end if;

    v_ids := array_append(v_ids, v_plan.plan_id);
  end loop;

  return query
    select coalesce(array_length(v_ids, 1), 0)::int, v_ids;
end;
$$;

revoke all on function public.generate_due_pms(boolean) from public;
grant execute on function public.generate_due_pms(boolean) to authenticated;

comment on function public.generate_due_pms(boolean) is
  'Escanea maintenance_plans activos.  Para cada uno que esté due (según horas/km/fecha del equipo) y no tenga OT abierta, crea una WO preventiva en status=scheduled con su checklist por defecto.  p_dry_run=true sólo regresa los plan_ids sin insertar.';
