-- ============================================================================
-- 021_purchasing_rpcs.sql — Sprint 2: purchasing RPCs
--
-- Atomic operations that orchestrate procurement state transitions and touch
-- inventory invariants.  All run with SECURITY DEFINER + locked search_path.
--
-- Helpers in this file:
--   - process_reception(po_id, warehouse, lines, ...)
--     → Creates a `receptions` row + `reception_lines` + a `stock_movements`
--       header (movement_type='entry_reception', status='posted') + per-line
--       `stock_movement_lines` so the existing fn_recalc_stock_on_post trigger
--       updates item_stock with the weighted-average cost.
--     → Updates each po_line.received_quantity and the parent po.status.
--   - approve_requisition(req_id, note)
--     → Validates approver role against required_approval_role() tier.
--   - reject_requisition(req_id, reason)
--   - generate_po_from_requisition(req_id, supplier_id, quotation_id?)
--     → Creates the OC draft from approved requisition lines (or quotation).
-- ============================================================================

-- ─── process_reception ──────────────────────────────────────────────────────
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
  v_item_currency char(3);
  v_fx            numeric;
  v_total_native  numeric := 0;
  v_total_mxn     numeric := 0;
  v_total_usd     numeric := 0;
  v_unit_cost_mxn numeric;
  v_line_total_native numeric;
  v_line_total_mxn    numeric;
  v_accepted      numeric;
  v_remaining_count int;
begin
  -- 1. Validate PO + lock for status update
  select organization_id, fx_rate
    into v_org, v_fx
    from public.purchase_orders
   where id = p_po_id
     and deleted_at is null
     and status in ('sent', 'confirmed', 'partially_received')
   for update;

  if v_org is null then
    raise exception 'PO not found or not in receivable status'
      using errcode = 'P0002';
  end if;

  -- 2. Permissions: almacenista or director_sg or super_admin
  if not (
    public.has_role(v_user, 'almacenista')
    or public.has_role(v_user, 'director_sg')
    or public.has_role(v_user, 'super_admin')
  ) then
    raise exception 'Forbidden: only almacenista/director can receive POs'
      using errcode = '42501';
  end if;

  -- 3. Active season required
  select id into v_season
    from public.seasons
   where organization_id = v_org and status = 'active'
   limit 1;
  if v_season is null then
    raise exception 'No active season for this organization';
  end if;

  -- 4. Folio
  v_folio_rec := public.next_folio(v_org, 'reception');

  -- 5. Reception header
  insert into public.receptions (
    organization_id, folio, po_id, warehouse_id, received_by,
    supplier_delivery_note, quality_notes, status, photos
  ) values (
    v_org, v_folio_rec, p_po_id, p_warehouse_id, v_user,
    p_supplier_note, p_quality_notes, 'draft', coalesce(p_photos, '[]'::jsonb)
  ) returning id into v_reception_id;

  -- 6. Movement header (status=draft for now; we'll post at the end so all
  --    lines exist when the recalc trigger fires).
  insert into public.stock_movements (
    organization_id, season_id, movement_type, warehouse_id,
    document_number, status, source_type, source_id,
    fx_rate, fx_date, created_by
  ) values (
    v_org, v_season, 'entry_reception', p_warehouse_id,
    v_folio_rec, 'draft', 'purchase_order', p_po_id,
    v_fx, current_date, v_user
  ) returning id into v_movement_id;

  -- 7. Walk each line
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select pol.id, pol.item_id, pol.quantity, pol.unit_cost, pol.currency, pol.received_quantity,
           i.native_currency
      into v_po_line
      from public.po_lines pol
      join public.items i on i.id = pol.item_id
     where pol.id = (v_line->>'po_line_id')::uuid
       and pol.po_id = p_po_id;

    if v_po_line is null then continue; end if;

    v_accepted := coalesce((v_line->>'accepted_qty')::numeric, 0);

    -- Insert reception line (always, even if 0 accepted, for audit trail)
    insert into public.reception_lines (
      reception_id, po_line_id, item_id,
      received_quantity, accepted_quantity, rejection_reason, supplier_lot, expiry_date, notes
    ) values (
      v_reception_id, v_po_line.id, v_po_line.item_id,
      coalesce((v_line->>'received_qty')::numeric, 0),
      v_accepted,
      v_line->>'rejection_reason',
      v_line->>'supplier_lot',
      nullif(v_line->>'expiry_date','')::date,
      v_line->>'notes'
    );

    if v_accepted > 0 then
      -- Compute MXN cost based on item's native currency.
      if v_po_line.currency = 'MXN' then
        v_unit_cost_mxn := v_po_line.unit_cost;
      elsif v_po_line.currency = 'USD' then
        if v_fx is null then
          raise exception 'PO is in USD but has no fx_rate set';
        end if;
        v_unit_cost_mxn := v_po_line.unit_cost * v_fx;
      else
        raise exception 'Unsupported currency: %', v_po_line.currency;
      end if;

      v_line_total_native := v_accepted * v_po_line.unit_cost;
      v_line_total_mxn    := v_accepted * v_unit_cost_mxn;

      insert into public.stock_movement_lines (
        movement_id, item_id, quantity,
        unit_cost_native, native_currency, unit_cost_mxn,
        line_total_native, line_total_mxn
      ) values (
        v_movement_id, v_po_line.item_id, v_accepted,
        v_po_line.unit_cost, v_po_line.currency, v_unit_cost_mxn,
        v_line_total_native, v_line_total_mxn
      );

      v_total_native := v_total_native + v_line_total_native;
      v_total_mxn    := v_total_mxn    + v_line_total_mxn;
      if v_po_line.currency = 'USD' then
        v_total_usd := v_total_usd + v_line_total_native;
      end if;
    end if;

    -- Track received_quantity on the PO line
    update public.po_lines
       set received_quantity = received_quantity + coalesce((v_line->>'received_qty')::numeric, 0)
     where id = v_po_line.id;
  end loop;

  -- 8. Persist totals on the movement and post it (fires fn_recalc_stock_on_post).
  update public.stock_movements
     set total_native = v_total_native,
         total_mxn    = v_total_mxn,
         total_usd    = nullif(v_total_usd, 0),
         status       = 'posted',
         posted_at    = now(),
         posted_by    = v_user
   where id = v_movement_id;

  -- 9. PO status: full vs partial reception
  select count(*) into v_remaining_count
    from public.po_lines
   where po_id = p_po_id
     and received_quantity < quantity;

  update public.purchase_orders
     set status = case
       when v_remaining_count = 0 then 'received'::po_status
       else 'partially_received'::po_status
     end,
       updated_at = now()
   where id = p_po_id;

  -- 10. Reception status
  update public.receptions
     set status = 'accepted',
         stock_movement_id = v_movement_id
   where id = v_reception_id;

  return v_reception_id;
end;
$$;

revoke all on function public.process_reception(uuid, uuid, jsonb, text, text, jsonb) from public;
grant execute on function public.process_reception(uuid, uuid, jsonb, text, text, jsonb) to authenticated;

-- ─── approve_requisition ────────────────────────────────────────────────────
create or replace function public.approve_requisition(
  p_requisition_id uuid,
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user          uuid := auth.uid();
  v_org           uuid;
  v_status        requisition_status;
  v_amount        numeric;
  v_required_role user_role;
begin
  select organization_id, status, coalesce(estimated_total_mxn, 0)
    into v_org, v_status, v_amount
    from public.purchase_requisitions
   where id = p_requisition_id
     and deleted_at is null
   for update;

  if v_org is null then
    raise exception 'Requisition not found' using errcode = 'P0002';
  end if;
  if v_status not in ('submitted', 'in_quotation') then
    raise exception 'Requisition not in approvable state: %', v_status;
  end if;

  v_required_role := public.required_approval_role(v_org, 'purchase', v_amount);
  if not public.has_role(v_user, v_required_role) and not public.has_role(v_user, 'super_admin') then
    raise exception 'Forbidden: this amount requires role %', v_required_role
      using errcode = '42501';
  end if;

  update public.purchase_requisitions
     set status = 'approved',
         approved_by = v_user,
         approved_at = now(),
         notes = coalesce(notes || E'\n', '') || coalesce('[APROBADO] ' || p_note, '[APROBADO]')
   where id = p_requisition_id;
end;
$$;

revoke all on function public.approve_requisition(uuid, text) from public;
grant execute on function public.approve_requisition(uuid, text) to authenticated;

-- ─── reject_requisition ─────────────────────────────────────────────────────
create or replace function public.reject_requisition(
  p_requisition_id uuid,
  p_reason         text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;

  select organization_id into v_org
    from public.purchase_requisitions
   where id = p_requisition_id and deleted_at is null
   for update;
  if v_org is null then
    raise exception 'Requisition not found';
  end if;

  if not public.can_write_purchase(v_user) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.purchase_requisitions
     set status = 'rejected',
         rejection_reason = p_reason,
         approved_by = v_user,
         approved_at = now()
   where id = p_requisition_id;
end;
$$;

revoke all on function public.reject_requisition(uuid, text) from public;
grant execute on function public.reject_requisition(uuid, text) to authenticated;

-- ─── generate_po_from_requisition ──────────────────────────────────────────
-- Creates a draft PO from an approved requisition (optionally tied to a
-- selected quotation, in which case lines + costs come from quotation_lines).
create or replace function public.generate_po_from_requisition(
  p_requisition_id uuid,
  p_supplier_id    uuid,
  p_quotation_id   uuid default null,
  p_warehouse_id   uuid default null,
  p_expected_date  date default null,
  p_payment_terms  text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_org    uuid;
  v_folio  text;
  v_po_id  uuid;
  v_subtotal_mxn numeric := 0;
  v_tax_mxn      numeric := 0;
  v_fx     numeric;
begin
  -- Permission
  if not public.can_write_purchase(v_user) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Validate requisition
  select organization_id into v_org
    from public.purchase_requisitions
   where id = p_requisition_id
     and status = 'approved'
     and deleted_at is null;
  if v_org is null then
    raise exception 'Requisition not found or not approved';
  end if;

  v_folio := public.next_folio(v_org, 'purchase_order');

  -- Today's USD/MXN rate if we have any USD lines (best-effort; null is OK).
  select rate into v_fx
    from public.fx_rates
   where organization_id = v_org
     and date = current_date
     and currency_from = 'USD'
     and currency_to   = 'MXN'
   order by created_at desc
   limit 1;

  insert into public.purchase_orders (
    organization_id, folio, supplier_id, quotation_id, requisition_id,
    issue_date, expected_delivery_date, payment_terms,
    destination_warehouse_id, fx_rate, status, created_by
  ) values (
    v_org, v_folio, p_supplier_id, p_quotation_id, p_requisition_id,
    current_date, p_expected_date, p_payment_terms,
    p_warehouse_id, v_fx, 'draft', v_user
  ) returning id into v_po_id;

  -- Source lines: quotation if provided, else requisition (estimated costs).
  if p_quotation_id is not null then
    insert into public.po_lines (po_id, item_id, quantity, unit_cost, currency, tax_pct)
    select v_po_id, rl.item_id, rl.quantity, ql.unit_cost, ql.currency, ql.tax_pct
      from public.quotation_lines ql
      join public.requisition_lines rl on rl.id = ql.requisition_line_id
     where ql.quotation_id = p_quotation_id
       and rl.item_id is not null;
  else
    insert into public.po_lines (po_id, item_id, quantity, unit_cost, currency, tax_pct)
    select v_po_id, rl.item_id, rl.quantity,
           coalesce(rl.estimated_unit_cost, 0),
           coalesce(rl.currency, 'MXN'::currency_code),
           16
      from public.requisition_lines rl
     where rl.requisition_id = p_requisition_id
       and rl.item_id is not null;
  end if;

  -- Compute and store totals (rough MXN approximation; refined when PO confirms).
  select coalesce(sum(
           case when currency = 'MXN' then quantity * unit_cost
                when currency = 'USD' then quantity * unit_cost * coalesce(v_fx, 1)
                else 0 end
         ), 0)
    into v_subtotal_mxn
    from public.po_lines where po_id = v_po_id;

  v_tax_mxn := round(v_subtotal_mxn * 0.16, 4);

  update public.purchase_orders
     set subtotal_mxn = v_subtotal_mxn,
         tax_mxn      = v_tax_mxn,
         total_mxn    = v_subtotal_mxn + v_tax_mxn
   where id = v_po_id;

  -- Mark the requisition as having a generated PO
  update public.purchase_requisitions
     set status = 'po_generated'
   where id = p_requisition_id;

  return v_po_id;
end;
$$;

revoke all on function public.generate_po_from_requisition(uuid, uuid, uuid, uuid, date, text) from public;
grant execute on function public.generate_po_from_requisition(uuid, uuid, uuid, uuid, date, text) to authenticated;
