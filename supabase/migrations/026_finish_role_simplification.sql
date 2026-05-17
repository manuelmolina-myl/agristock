-- ============================================================================
-- 026_finish_role_simplification.sql
-- Completes the partial application of 025 which failed at the
-- `update profiles.role` step before the legacy CHECK had been dropped.
-- This migration is the entire tail of 025, re-ordered to drop the CHECK
-- first.  Everything here is idempotent.
-- ============================================================================

-- ─── 1. profiles.role: drop legacy CHECK FIRST, then remap, then re-add ────
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
   set role = case
     when role in ('super_admin', 'admin', 'gerente') then 'admin'
     when role = 'supervisor'  then 'compras'
     when role = 'almacenista' then 'almacenista'
     when role = 'mantenimiento' then 'mantenimiento'
     when role = 'compras' then 'compras'
     else 'almacenista'
   end
 where role is not null;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'compras', 'mantenimiento', 'almacenista'));

-- ─── 2. Backfill user_roles from the now-normalised profiles.role ──────────
-- Some accounts may have lacked a user_roles entry entirely.
insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, role::user_role
  from public.profiles
 where role in ('admin', 'compras', 'mantenimiento', 'almacenista')
on conflict (organization_id, user_id, role) do nothing;

-- ─── 3. Sync trigger: rewrite to new mapping ───────────────────────────────
create or replace function public.sync_profile_role_to_user_roles_internal(p_profile public.profiles)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_profile.role is null then return; end if;

  case p_profile.role
    when 'admin' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'admin') on conflict do nothing;
    when 'compras' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'compras') on conflict do nothing;
    when 'mantenimiento' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'mantenimiento') on conflict do nothing;
    when 'almacenista' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'almacenista') on conflict do nothing;
    else
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'almacenista') on conflict do nothing;
  end case;
end;
$$;

create or replace function public.sync_profile_role_to_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_profile_role_to_user_roles_internal(new);
  return new;
end;
$$;

-- ─── 4. Update organization settings approval tiers to new role set ────────
update public.organizations
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{approval_thresholds}',
  jsonb_build_object(
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
);

-- ─── 5. Rewrite policies that referenced legacy enum names ─────────────────
drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert
  with check (organization_id = public.auth_org_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles for update
  using (organization_id = public.auth_org_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete
  using (organization_id = public.auth_org_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists failure_types_insert on public.failure_types;
create policy failure_types_insert on public.failure_types for insert
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'mantenimiento')
  ));
drop policy if exists failure_types_update on public.failure_types;
create policy failure_types_update on public.failure_types for update
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'mantenimiento')
  ));
drop policy if exists failure_types_delete on public.failure_types;
create policy failure_types_delete on public.failure_types for delete
  using (organization_id = public.auth_org_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists service_types_insert on public.service_types;
create policy service_types_insert on public.service_types for insert
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'compras')
  ));
drop policy if exists service_types_update on public.service_types;
create policy service_types_update on public.service_types for update
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'compras')
  ));
drop policy if exists service_types_delete on public.service_types;
create policy service_types_delete on public.service_types for delete
  using (organization_id = public.auth_org_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists rec_write on public.receptions;
create policy rec_write on public.receptions for all
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'almacenista') or public.has_role(auth.uid(),'admin')
  ))
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'almacenista') or public.has_role(auth.uid(),'admin')
  ));

drop policy if exists recl_write on public.reception_lines;
create policy recl_write on public.reception_lines for all
  using (exists (select 1 from public.receptions r
    where r.id = reception_id and r.organization_id = public.auth_org_id() and (
      public.has_role(auth.uid(),'almacenista') or public.has_role(auth.uid(),'admin')
    )))
  with check (exists (select 1 from public.receptions r
    where r.id = reception_id and r.organization_id = public.auth_org_id() and (
      public.has_role(auth.uid(),'almacenista') or public.has_role(auth.uid(),'admin')
    )));

drop policy if exists wo_insert on public.work_orders;
create policy wo_insert on public.work_orders for insert
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'mantenimiento') or public.has_role(auth.uid(),'admin')
  ));

drop policy if exists mp_write on public.maintenance_plans;
create policy mp_write on public.maintenance_plans for all
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'mantenimiento')
  ))
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'mantenimiento')
  ));

-- ─── 6. RPCs that name legacy roles ────────────────────────────────────────
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
   where id = p_requisition_id and deleted_at is null
   for update;

  if v_org is null then raise exception 'Requisition not found' using errcode = 'P0002'; end if;
  if v_status not in ('submitted', 'in_quotation') then
    raise exception 'Requisition not in approvable state: %', v_status;
  end if;

  v_required_role := public.required_approval_role(v_org, 'purchase', v_amount);
  if not public.has_role(v_user, v_required_role) and not public.has_role(v_user, 'admin') then
    raise exception 'Forbidden: this amount requires role %', v_required_role using errcode = '42501';
  end if;

  update public.purchase_requisitions
     set status = 'approved',
         approved_by = v_user,
         approved_at = now(),
         notes = coalesce(notes || E'\n', '') || coalesce('[APROBADO] ' || p_note, '[APROBADO]')
   where id = p_requisition_id;
end;
$$;

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
    raise exception 'PO not found or not in receivable status' using errcode = 'P0002';
  end if;

  if not (
    public.has_role(v_user, 'almacenista')
    or public.has_role(v_user, 'admin')
  ) then
    raise exception 'Forbidden: only almacenista/admin can receive POs' using errcode = '42501';
  end if;

  select id into v_season from public.seasons
   where organization_id = v_org and status = 'active' limit 1;
  if v_season is null then raise exception 'No active season'; end if;

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
        if v_fx is null then raise exception 'PO is in USD but has no fx_rate set'; end if;
        v_unit_cost_mxn := v_po_line.unit_cost * v_fx;
      else
        raise exception 'Unsupported currency: %', v_po_line.currency;
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
  if v_org is null then raise exception 'Equipment not found' using errcode = 'P0002'; end if;

  if not (
    public.has_role(v_user,'mantenimiento')
    or public.has_role(v_user,'admin')
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
