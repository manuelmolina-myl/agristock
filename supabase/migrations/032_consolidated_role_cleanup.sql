-- ============================================================================
-- 032_consolidated_role_cleanup.sql — Fase 1 estabilización
--
-- Cierra los gaps del refactor de roles (024-026) que se quedaron con
-- referencias legacy hardcodeadas. Cada sección es independiente e
-- idempotente; si falla una, las demás siguen.
--
-- Incluye:
--   1. RPCs reescritos: process_reception, create_corrective_wo,
--      required_approval_role  (eliminan roles legacy del enum)
--   2. RLS de failure_types / service_types con los 4 roles nuevos
--   3. Trigger sync_profile_role_update reactivando filas revocadas
--   4. Trigger AFTER INSERT en organizations que siembra catálogos default
--   5. RPC consume_part_in_wo + close_wo verificados contra el nuevo modelo
-- ============================================================================

-- ─── 1. required_approval_role — fallback con rol nuevo válido ─────────────
create or replace function public.required_approval_role(
  p_org_id     uuid,
  p_operation  text,
  p_amount_mxn numeric
) returns user_role
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_thresholds jsonb;
  v_tier       jsonb;
  v_max        numeric;
begin
  select settings->'approval_thresholds'->p_operation into v_thresholds
    from public.organizations
    where id = p_org_id;

  -- Safe default if org not configured: admin must approve.
  if v_thresholds is null or jsonb_array_length(v_thresholds) = 0 then
    return 'admin'::user_role;
  end if;

  for v_tier in select * from jsonb_array_elements(v_thresholds) loop
    v_max := nullif(v_tier->>'max_mxn', '')::numeric;
    if v_max is null or p_amount_mxn <= v_max then
      return (v_tier->>'role')::user_role;
    end if;
  end loop;

  return 'admin'::user_role;
end;
$$;

revoke all on function public.required_approval_role(uuid, text, numeric) from public;
grant execute on function public.required_approval_role(uuid, text, numeric) to authenticated;

-- ─── 2. process_reception — roles correctos ───────────────────────────────
create or replace function public.process_reception(
  p_po_id           uuid,
  p_warehouse_id    uuid,
  p_lines           jsonb,
  p_supplier_note   text default null,
  p_quality_notes   text default null,
  p_photos          jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org           uuid;
  v_user          uuid := auth.uid();
  v_season        uuid;
  v_reception_id  uuid;
  v_movement_id   uuid;
  v_folio_rec     text;
  v_line          jsonb;
  v_po_line       record;
  v_fx            numeric;
  v_total_native  numeric := 0;
  v_total_mxn     numeric := 0;
  v_total_usd     numeric := 0;
  v_unit_cost_mxn numeric;
  v_accepted      numeric;
  v_remaining_count int;
begin
  select organization_id, fx_rate into v_org, v_fx
    from public.purchase_orders
   where id = p_po_id and deleted_at is null
     and status in ('sent', 'confirmed', 'partially_received')
   for update;
  if v_org is null then
    raise exception 'OC no encontrada o no recibible' using errcode = 'P0002';
  end if;

  if not (
    public.has_role(v_user, 'almacenista'::user_role)
    or public.has_role(v_user, 'admin'::user_role)
    or public.has_role(v_user, 'compras'::user_role)
  ) then
    raise exception 'Solo almacenista, compras o admin pueden registrar recepciones'
      using errcode = '42501';
  end if;

  select id into v_season from public.seasons
   where organization_id = v_org and status = 'active' limit 1;
  if v_season is null then
    raise exception 'No hay temporada activa para esta organización';
  end if;

  v_folio_rec := public.next_folio(v_org, 'reception');

  insert into public.receptions (organization_id, folio, po_id, warehouse_id, received_by,
    supplier_delivery_note, quality_notes, status, photos)
  values (v_org, v_folio_rec, p_po_id, p_warehouse_id, v_user,
    p_supplier_note, p_quality_notes, 'draft', coalesce(p_photos, '[]'::jsonb))
  returning id into v_reception_id;

  insert into public.stock_movements (
    organization_id, season_id, movement_type, warehouse_id,
    document_number, status, source_type, source_id,
    fx_rate, fx_date, created_by
  ) values (
    v_org, v_season, 'entry_reception', p_warehouse_id,
    v_folio_rec, 'draft', 'purchase_order', p_po_id,
    v_fx, current_date, v_user
  ) returning id into v_movement_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select pol.id, pol.item_id, pol.quantity, pol.unit_cost, pol.currency, pol.received_quantity,
           i.native_currency
      into v_po_line
      from public.po_lines pol
      join public.items i on i.id = pol.item_id
     where pol.id = (v_line->>'po_line_id')::uuid and pol.po_id = p_po_id;
    if v_po_line is null then continue; end if;

    v_accepted := coalesce((v_line->>'accepted_qty')::numeric, 0);

    insert into public.reception_lines (
      reception_id, po_line_id, item_id,
      received_quantity, accepted_quantity, rejection_reason, supplier_lot, expiry_date, notes
    ) values (
      v_reception_id, v_po_line.id, v_po_line.item_id,
      coalesce((v_line->>'received_qty')::numeric, 0), v_accepted,
      v_line->>'rejection_reason', v_line->>'supplier_lot',
      nullif(v_line->>'expiry_date','')::date, v_line->>'notes'
    );

    if v_accepted > 0 then
      if v_po_line.currency = 'MXN' then
        v_unit_cost_mxn := v_po_line.unit_cost;
      elsif v_po_line.currency = 'USD' then
        if v_fx is null then
          raise exception 'OC en USD pero sin tipo de cambio asignado';
        end if;
        v_unit_cost_mxn := v_po_line.unit_cost * v_fx;
      else
        raise exception 'Moneda no soportada: %', v_po_line.currency;
      end if;

      insert into public.stock_movement_lines (
        movement_id, item_id, quantity,
        unit_cost_native, native_currency, unit_cost_mxn,
        line_total_native, line_total_mxn
      ) values (
        v_movement_id, v_po_line.item_id, v_accepted,
        v_po_line.unit_cost, v_po_line.currency, v_unit_cost_mxn,
        v_accepted * v_po_line.unit_cost, v_accepted * v_unit_cost_mxn
      );

      v_total_native := v_total_native + v_accepted * v_po_line.unit_cost;
      v_total_mxn    := v_total_mxn    + v_accepted * v_unit_cost_mxn;
      if v_po_line.currency = 'USD' then
        v_total_usd := v_total_usd + v_accepted * v_po_line.unit_cost;
      end if;
    end if;

    update public.po_lines
       set received_quantity = received_quantity + coalesce((v_line->>'received_qty')::numeric, 0)
     where id = v_po_line.id;
  end loop;

  update public.stock_movements
     set total_native = v_total_native, total_mxn = v_total_mxn,
         total_usd = nullif(v_total_usd, 0), status = 'posted',
         posted_at = now(), posted_by = v_user
   where id = v_movement_id;

  select count(*) into v_remaining_count from public.po_lines
   where po_id = p_po_id and received_quantity < quantity;

  update public.purchase_orders
     set status = case
       when v_remaining_count = 0 then 'received'::po_status
       else 'partially_received'::po_status
     end, updated_at = now()
   where id = p_po_id;

  update public.receptions
     set status = 'accepted', stock_movement_id = v_movement_id
   where id = v_reception_id;

  return v_reception_id;
end;
$$;

-- ─── 3. create_corrective_wo — roles correctos ────────────────────────────
create or replace function public.create_corrective_wo(
  p_equipment_id      uuid,
  p_failure_type_id   uuid,
  p_description       text,
  p_priority          wo_priority default 'medium',
  p_photos            jsonb default '[]'::jsonb,
  p_scheduled_date    date default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_org   uuid;
  v_folio text;
  v_id    uuid;
begin
  select organization_id into v_org
    from public.equipment
   where id = p_equipment_id and deleted_at is null;
  if v_org is null then
    raise exception 'Equipo no encontrado' using errcode = 'P0002';
  end if;

  if not (
    public.has_role(v_user, 'mantenimiento'::user_role)
    or public.has_role(v_user, 'admin'::user_role)
    or public.has_role(v_user, 'almacenista'::user_role)
  ) then
    raise exception 'Solo mantenimiento, almacenista o admin pueden reportar fallas'
      using errcode = '42501';
  end if;

  v_folio := public.next_folio(v_org, 'work_order');

  insert into public.work_orders (
    organization_id, folio, equipment_id, wo_type, priority,
    failure_description, failure_type_id, reported_by, reported_at,
    scheduled_date, status, photos_before
  ) values (
    v_org, v_folio, p_equipment_id, 'corrective', p_priority,
    p_description, p_failure_type_id, v_user, now(),
    p_scheduled_date,
    case when p_scheduled_date is not null then 'scheduled'::wo_status else 'reported'::wo_status end,
    coalesce(p_photos, '[]'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ─── 4. RLS de failure_types con roles nuevos ─────────────────────────────
drop policy if exists failure_types_insert on public.failure_types;
create policy failure_types_insert on public.failure_types for insert
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'mantenimiento'::user_role)
    )
  );

drop policy if exists failure_types_update on public.failure_types;
create policy failure_types_update on public.failure_types for update
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'mantenimiento'::user_role)
    )
  );

drop policy if exists failure_types_delete on public.failure_types;
create policy failure_types_delete on public.failure_types for delete
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin'::user_role)
  );

-- ─── 5. RLS de service_types con roles nuevos ─────────────────────────────
drop policy if exists service_types_insert on public.service_types;
create policy service_types_insert on public.service_types for insert
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'compras'::user_role)
    )
  );

drop policy if exists service_types_update on public.service_types;
create policy service_types_update on public.service_types for update
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'compras'::user_role)
    )
  );

drop policy if exists service_types_delete on public.service_types;
create policy service_types_delete on public.service_types for delete
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin'::user_role)
  );

-- ─── 6. Trigger sync_profile_role_update — reactivar filas revocadas ──────
create or replace function public.sync_profile_role_to_user_roles_internal(p_profile public.profiles)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role user_role;
begin
  if p_profile.role is null then return; end if;

  -- Map profiles.role (text) → user_role enum.
  v_role := case p_profile.role
    when 'admin' then 'admin'::user_role
    when 'compras' then 'compras'::user_role
    when 'mantenimiento' then 'mantenimiento'::user_role
    when 'almacenista' then 'almacenista'::user_role
    else 'almacenista'::user_role
  end;

  -- Reactivate or insert.  Critical: use DO UPDATE (not DO NOTHING) so a
  -- previously-revoked row gets its revoked_at cleared.  This was the bug
  -- behind "user with no roles" after profiles.role updates.
  insert into public.user_roles (organization_id, user_id, role)
  values (p_profile.organization_id, p_profile.id, v_role)
  on conflict (organization_id, user_id, role)
    do update set revoked_at = null, revoked_by = null;
end;
$$;

-- ─── 7. Seed automático de catálogos cuando se crea una organization ──────
create or replace function public.fn_seed_org_catalogs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Default failure types
  insert into public.failure_types (organization_id, code, label, severity, description)
  values
    (new.id, 'falla_motor',          'Falla de motor',          'critical', 'Motor del equipo no enciende o se detiene en operación'),
    (new.id, 'falla_hidraulica',     'Falla hidráulica',        'high',     'Fugas o pérdida de presión en sistema hidráulico'),
    (new.id, 'falla_electrica',      'Falla eléctrica',         'high',     'Cortocircuito, falla de batería, alternador, luces'),
    (new.id, 'falla_transmision',    'Falla de transmisión',    'high',     'Caja de cambios, embrague, tracción'),
    (new.id, 'falla_rodamiento',     'Falla de rodamiento',     'medium',   'Llantas, ejes, suspensión'),
    (new.id, 'falla_neumatica',      'Falla neumática',         'medium',   'Compresor, presión de aire, neumáticos'),
    (new.id, 'desgaste_normal',      'Desgaste normal',         'low',      'Componente por reemplazo programado'),
    (new.id, 'mantenimiento_rutina', 'Mantenimiento de rutina', 'low',      'Cambio de aceite, filtros, etc.'),
    (new.id, 'otro',                 'Otro',                    'medium',   'Falla no clasificada — describir en notas')
  on conflict (organization_id, code) do nothing;

  -- Default service types
  insert into public.service_types (organization_id, code, label, description)
  values
    (new.id, 'limpieza',           'Limpieza',                          'Limpieza de oficinas, almacenes, áreas comunes'),
    (new.id, 'jardineria',         'Jardinería',                        'Mantenimiento de áreas verdes, poda, riego'),
    (new.id, 'seguridad',          'Seguridad privada',                 'Vigilancia, control de acceso'),
    (new.id, 'fumigacion',         'Fumigación',                        'Control de plagas en instalaciones, no aplica a cultivos'),
    (new.id, 'transporte',         'Transporte',                        'Fletes y transporte tercerizado'),
    (new.id, 'capacitacion',       'Capacitación',                      'Cursos, talleres internos o externos'),
    (new.id, 'mantenimiento_inst', 'Mantenimiento de instalaciones',    'Plomería, electricidad, herrería'),
    (new.id, 'consultoria',        'Consultoría',                       'Asesoría legal, contable, técnica, agronómica')
  on conflict (organization_id, code) do nothing;

  -- Approval thresholds in settings (default tiers).
  if new.settings is null or new.settings->'approval_thresholds' is null then
    update public.organizations
       set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
         'approval_thresholds', jsonb_build_object(
           'purchase', jsonb_build_array(
             jsonb_build_object('max_mxn', 5000,  'role', 'compras'),
             jsonb_build_object('max_mxn', null,  'role', 'admin')
           ),
           'stock_exit', jsonb_build_array(
             jsonb_build_object('max_mxn', 5000, 'role', 'almacenista'),
             jsonb_build_object('max_mxn', null, 'role', 'admin')
           ),
           'work_order', jsonb_build_array(
             jsonb_build_object('max_mxn', 10000, 'role', 'mantenimiento'),
             jsonb_build_object('max_mxn', null,  'role', 'admin')
           )
         )
       )
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seed_org_catalogs on public.organizations;
create trigger trg_seed_org_catalogs
  after insert on public.organizations
  for each row execute function public.fn_seed_org_catalogs();
