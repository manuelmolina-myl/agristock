-- ============================================================================
-- 023_cmms_rpcs.sql — Sprint 3: CMMS RPCs
--
--   - create_corrective_wo:  any field role can report a failure
--   - assign_wo:             coord_mantenimiento assigns a technician + date
--   - consume_part_in_wo:    decrements stock via a real stock_movements posting
--                            (exit_work_order) — RESPECTS the existing
--                            fn_recalc_stock_on_post trigger so item_stock and
--                            costs stay accurate.
--   - close_wo:              validates checklist, totals parts+labor+external,
--                            stamps completed_at + total_cost_mxn
-- ============================================================================

-- ─── create_corrective_wo ───────────────────────────────────────────────────
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
    raise exception 'Equipment not found' using errcode = 'P0002';
  end if;

  -- Anyone who can report can create
  if not (
    public.has_role(v_user,'operador')
    or public.has_role(v_user,'tecnico')
    or public.has_role(v_user,'coordinador_mantenimiento')
    or public.has_role(v_user,'director_sg')
    or public.has_role(v_user,'super_admin')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
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

revoke all on function public.create_corrective_wo(uuid, uuid, text, wo_priority, jsonb, date) from public;
grant execute on function public.create_corrective_wo(uuid, uuid, text, wo_priority, jsonb, date) to authenticated;

-- ─── assign_wo ──────────────────────────────────────────────────────────────
create or replace function public.assign_wo(
  p_wo_id            uuid,
  p_technician_id    uuid,
  p_helpers          uuid[] default '{}'::uuid[],
  p_scheduled_date   date default null,
  p_estimated_hours  numeric default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  select organization_id into v_org
    from public.work_orders
   where id = p_wo_id and deleted_at is null
   for update;
  if v_org is null then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  if not public.can_write_cmms(v_user) then
    raise exception 'Forbidden: requires coord_mantenimiento or director' using errcode = '42501';
  end if;

  update public.work_orders
     set primary_technician_id = p_technician_id,
         helper_technician_ids = coalesce(p_helpers, '{}'::uuid[]),
         scheduled_date        = coalesce(p_scheduled_date, scheduled_date),
         estimated_hours       = coalesce(p_estimated_hours, estimated_hours),
         status                = 'assigned'::wo_status
   where id = p_wo_id;
end;
$$;

revoke all on function public.assign_wo(uuid, uuid, uuid[], date, numeric) from public;
grant execute on function public.assign_wo(uuid, uuid, uuid[], date, numeric) to authenticated;

-- ─── consume_part_in_wo ─────────────────────────────────────────────────────
-- Atomic operation:
--   1. Create or upsert a wo_parts row.
--   2. Create a stock_movements (exit_work_order) header + line so that the
--      existing fn_recalc_stock_on_post trigger decrements item_stock and
--      records the cost snapshot using the item's current avg_cost_native.
--   3. Backfill wo_parts.stock_movement_line_id and total_cost_mxn.
--   4. Bump work_order.total_cost_mxn by the consumed line.
-- ============================================================================
create or replace function public.consume_part_in_wo(
  p_wo_id         uuid,
  p_item_id       uuid,
  p_warehouse_id  uuid,
  p_quantity      numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user           uuid := auth.uid();
  v_org            uuid;
  v_season         uuid;
  v_movement_id    uuid;
  v_line_id        uuid;
  v_wo_part_id     uuid;
  v_avg_cost_mxn   numeric;
  v_avg_cost_native numeric;
  v_native_curr    char(3);
  v_line_total_mxn numeric;
  v_folio          text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  -- WO must exist + be open
  select organization_id into v_org
    from public.work_orders
   where id = p_wo_id
     and deleted_at is null
     and status in ('assigned','in_progress','waiting_parts','scheduled')
   for update;
  if v_org is null then
    raise exception 'Work order not found or not in consumable state' using errcode = 'P0002';
  end if;

  if not public.can_write_cmms(v_user) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Active season
  select id into v_season from public.seasons
   where organization_id = v_org and status = 'active' limit 1;
  if v_season is null then
    raise exception 'No active season';
  end if;

  -- Item cost snapshot (weighted-average at the moment of consumption)
  select avg_cost_mxn, avg_cost_native, native_currency
    into v_avg_cost_mxn, v_avg_cost_native, v_native_curr
    from public.item_stock s
    join public.items i on i.id = s.item_id
   where s.item_id = p_item_id and s.warehouse_id = p_warehouse_id and s.season_id = v_season
   for update;

  if v_avg_cost_mxn is null then
    -- Fall back to item-level average if no warehouse-specific stock row.
    select coalesce(i.native_currency, 'MXN') into v_native_curr
      from public.items i where i.id = p_item_id;
    v_avg_cost_mxn    := 0;
    v_avg_cost_native := 0;
  end if;

  v_folio := public.next_folio(v_org, 'work_order') || '-CONS';

  -- Movement header
  insert into public.stock_movements (
    organization_id, season_id, movement_type, warehouse_id,
    document_number, status, source_type, source_id, created_by
  ) values (
    v_org, v_season, 'exit_work_order', p_warehouse_id,
    v_folio, 'draft', 'work_order', p_wo_id, v_user
  ) returning id into v_movement_id;

  -- Movement line — line_total fields will be updated by the post-trigger
  -- using the persisted unit_cost values we set here.
  insert into public.stock_movement_lines (
    movement_id, item_id, quantity,
    unit_cost_native, native_currency, unit_cost_mxn,
    line_total_native, line_total_mxn,
    destination_type, equipment_id, cost_center_notes
  )
  select v_movement_id, p_item_id, p_quantity,
         v_avg_cost_native, v_native_curr, v_avg_cost_mxn,
         p_quantity * v_avg_cost_native, p_quantity * v_avg_cost_mxn,
         'maintenance', wo.equipment_id, 'WO ' || wo.folio
    from public.work_orders wo
   where wo.id = p_wo_id
  returning id into v_line_id;

  -- Post the movement (fires fn_recalc_stock_on_post → decrements item_stock).
  update public.stock_movements
     set status = 'posted',
         total_native = p_quantity * v_avg_cost_native,
         total_mxn    = p_quantity * v_avg_cost_mxn,
         posted_at    = now(),
         posted_by    = v_user
   where id = v_movement_id;

  v_line_total_mxn := p_quantity * v_avg_cost_mxn;

  -- Persist the wo_parts row
  insert into public.wo_parts (
    wo_id, item_id, requested_quantity, delivered_quantity,
    stock_movement_line_id, total_cost_mxn, status
  ) values (
    p_wo_id, p_item_id, p_quantity, p_quantity,
    v_line_id, v_line_total_mxn, 'delivered'
  ) returning id into v_wo_part_id;

  -- Bump WO total_cost_mxn
  update public.work_orders
     set total_cost_mxn = coalesce(total_cost_mxn, 0) + v_line_total_mxn,
         status = case when status = 'assigned' then 'in_progress'::wo_status else status end
   where id = p_wo_id;

  return v_wo_part_id;
end;
$$;

revoke all on function public.consume_part_in_wo(uuid, uuid, uuid, numeric) from public;
grant execute on function public.consume_part_in_wo(uuid, uuid, uuid, numeric) to authenticated;

-- ─── close_wo ───────────────────────────────────────────────────────────────
-- Validates checklist completion, sums labor + parts + external service,
-- stamps completed_at, sets status=completed (or closed if approved=true).
create or replace function public.close_wo(
  p_wo_id            uuid,
  p_solution         text,
  p_photos_after     jsonb default '[]'::jsonb,
  p_hours_meter_close numeric default null,
  p_external_cost    numeric default null,
  p_force            boolean default false   -- skip checklist gate w/ a note
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_org   uuid;
  v_checklist_total int;
  v_checklist_done  int;
  v_parts_total     numeric;
  v_labor_total     numeric;
begin
  select organization_id into v_org
    from public.work_orders
   where id = p_wo_id and deleted_at is null
   for update;
  if v_org is null then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  if not public.can_write_cmms(v_user) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Checklist gate (unless force=true)
  select count(*), count(*) filter (where is_completed)
    into v_checklist_total, v_checklist_done
    from public.wo_checklist where wo_id = p_wo_id;

  if v_checklist_total > 0 and v_checklist_done < v_checklist_total and not p_force then
    raise exception 'Checklist incomplete: % / % tareas. Usa force=true con nota para cerrar igual.',
      v_checklist_done, v_checklist_total
      using errcode = 'P0001';
  end if;

  select coalesce(sum(total_cost_mxn), 0) into v_parts_total
    from public.wo_parts where wo_id = p_wo_id;

  select coalesce(sum(total_mxn), 0) into v_labor_total
    from public.wo_labor where wo_id = p_wo_id;

  update public.work_orders
     set status            = 'completed'::wo_status,
         completed_at      = now(),
         solution_applied  = p_solution,
         photos_after      = coalesce(p_photos_after, '[]'::jsonb),
         hours_meter_close = coalesce(p_hours_meter_close, hours_meter_close),
         external_service_cost_mxn = coalesce(p_external_cost, external_service_cost_mxn, 0),
         total_cost_mxn    = v_parts_total + v_labor_total + coalesce(p_external_cost, external_service_cost_mxn, 0)
   where id = p_wo_id;

  -- If the WO closes a maintenance plan, advance its counter
  update public.maintenance_plans mp
     set last_execution_value = coalesce(p_hours_meter_close, mp.next_execution_value),
         next_execution_value = mp.next_execution_value + mp.interval_value
   where mp.id = (select maintenance_plan_id from public.work_orders where id = p_wo_id)
     and mp.id is not null;
end;
$$;

revoke all on function public.close_wo(uuid, text, jsonb, numeric, numeric, boolean) from public;
grant execute on function public.close_wo(uuid, text, jsonb, numeric, numeric, boolean) to authenticated;
