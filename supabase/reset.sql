-- ============================================================================
-- AgriStock — FULL RESET (drop everything + recreate)
-- Run this in Supabase SQL Editor to start fresh
-- ============================================================================

-- ─── Drop triggers first ─────────────────────────────────────────────────────
drop trigger if exists trg_on_auth_user_created on auth.users;
drop trigger if exists trg_recalc_stock_insert on stock_movements;
drop trigger if exists trg_recalc_stock on stock_movements;
drop trigger if exists trg_audit_equipment on equipment;
drop trigger if exists trg_audit_crops_lots on crops_lots;
drop trigger if exists trg_audit_seasons on seasons;
drop trigger if exists trg_audit_warehouses on warehouses;
drop trigger if exists trg_audit_stock_movements on stock_movements;
drop trigger if exists trg_audit_items on items;

-- ─── Drop views ──────────────────────────────────────────────────────────────
drop view if exists v_movement_lines_no_cost;
drop view if exists v_movements_no_cost;

-- ─── Drop tables (reverse dependency order) ──────────────────────────────────
drop table if exists season_closures cascade;
drop table if exists audit_log cascade;
drop table if exists fx_rates cascade;
drop table if exists adjustment_reasons cascade;
drop table if exists stock_movement_lines cascade;
drop table if exists stock_movements cascade;
drop table if exists item_stock cascade;
drop table if exists items cascade;
drop table if exists employees cascade;
drop table if exists equipment cascade;
drop table if exists crops_lots cascade;
drop table if exists suppliers cascade;
drop table if exists units cascade;
drop table if exists categories cascade;
drop table if exists warehouses cascade;
drop table if exists profiles cascade;
drop table if exists seasons cascade;
drop table if exists organizations cascade;

-- ─── Drop functions ──────────────────────────────────────────────────────────
drop function if exists fn_handle_new_user();
drop function if exists fn_recalc_stock_on_post();
drop function if exists fn_audit_trigger();
drop function if exists auth_role();
drop function if exists auth_org_id();
drop function if exists fn_set_updated_at();

-- ─── Delete demo auth users ─────────────────────────────────────────────────
delete from auth.identities where user_id in (
  select id from auth.users where email like '%@agristock.mx'
);
delete from auth.users where email like '%@agristock.mx';

-- ============================================================================
-- RECREATE EVERYTHING
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ─── Helper function ─────────────────────────────────────────────────────────
create or replace function fn_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 1. TABLES
-- ============================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rfc text,
  address text,
  logo_url text,
  base_currency char(3) not null default 'MXN' check (base_currency in ('MXN','USD')),
  timezone text not null default 'America/Mazatlan',
  allow_negative_stock boolean not null default false,
  approval_threshold_mxn numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create trigger trg_organizations_updated_at before update on organizations for each row execute function fn_set_updated_at();

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  full_name text not null,
  role text not null check (role in ('super_admin','gerente','almacenista','supervisor')),
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index idx_profiles_org on profiles(organization_id);
create trigger trg_profiles_updated_at before update on profiles for each row execute function fn_set_updated_at();

create table seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning','active','closing','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index idx_seasons_org_status on seasons(organization_id, status);
create trigger trg_seasons_updated_at before update on seasons for each row execute function fn_set_updated_at();

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  code text not null,
  address text,
  responsible_user_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_warehouses_code unique (organization_id, code)
);
create index idx_warehouses_org on warehouses(organization_id);
create trigger trg_warehouses_updated_at before update on warehouses for each row execute function fn_set_updated_at();

create table categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  parent_id uuid references categories(id),
  icon text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_categories_org on categories(organization_id);
create trigger trg_categories_updated_at before update on categories for each row execute function fn_set_updated_at();

create table units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  type text not null check (type in ('mass','volume','count','length')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_units_code unique (organization_id, code)
);
create index idx_units_org on units(organization_id);
create trigger trg_units_updated_at before update on units for each row execute function fn_set_updated_at();

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  rfc text,
  contact_name text,
  phone text,
  email text,
  default_currency char(3) not null default 'MXN' check (default_currency in ('MXN','USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index idx_suppliers_org on suppliers(organization_id);
create trigger trg_suppliers_updated_at before update on suppliers for each row execute function fn_set_updated_at();

create table crops_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  season_id uuid not null references seasons(id),
  name text not null,
  code text not null,
  crop_type text not null,
  hectares numeric not null default 0,
  planting_date date,
  expected_harvest_date date,
  status text not null default 'active',
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_crops_lots_code unique (organization_id, season_id, code)
);
create index idx_crops_lots_org_season on crops_lots(organization_id, season_id);
create trigger trg_crops_lots_updated_at before update on crops_lots for each row execute function fn_set_updated_at();

create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  type text not null default 'tractor' check (type in ('tractor','implement','vehicle','pump','other')),
  brand text,
  model text,
  plate text,
  year integer,
  current_hours numeric,
  current_km numeric,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_equipment_code unique (organization_id, code)
);
create index idx_equipment_org on equipment(organization_id);
create trigger trg_equipment_updated_at before update on equipment for each row execute function fn_set_updated_at();

create table employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_code text not null,
  full_name text not null,
  role_field text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_employees_code unique (organization_id, employee_code)
);
create index idx_employees_org on employees(organization_id);
create trigger trg_employees_updated_at before update on employees for each row execute function fn_set_updated_at();

create table items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  sku text not null,
  name text not null,
  description text,
  category_id uuid references categories(id),
  unit_id uuid references units(id),
  native_currency char(3) not null default 'MXN' check (native_currency in ('MXN','USD')),
  barcode text,
  min_stock numeric,
  max_stock numeric,
  reorder_point numeric,
  is_diesel boolean not null default false,
  is_active boolean not null default true,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_items_sku unique (organization_id, sku)
);
create index idx_items_org on items(organization_id);
create index idx_items_category on items(category_id);
create trigger trg_items_updated_at before update on items for each row execute function fn_set_updated_at();

create table item_stock (
  item_id uuid not null references items(id),
  warehouse_id uuid not null references warehouses(id),
  season_id uuid not null references seasons(id),
  quantity numeric not null default 0,
  avg_cost_native numeric not null default 0,
  avg_cost_mxn numeric not null default 0,
  last_movement_at timestamptz,
  primary key (item_id, warehouse_id, season_id)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  season_id uuid not null references seasons(id),
  movement_type text not null check (movement_type in (
    'entry_purchase','entry_return','entry_transfer','entry_adjustment','entry_initial',
    'exit_consumption','exit_transfer','exit_adjustment','exit_waste','exit_sale'
  )),
  warehouse_id uuid not null references warehouses(id),
  counterpart_warehouse_id uuid references warehouses(id),
  document_number text,
  reference_external text,
  supplier_id uuid references suppliers(id),
  fx_rate numeric,
  fx_source text check (fx_source is null or fx_source in ('DOF_FIX','banxico','manual')),
  fx_date date,
  total_native numeric,
  total_mxn numeric,
  total_usd numeric,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  notes text,
  attachment_urls text[],
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz
);
create index idx_movements_org_season on stock_movements(organization_id, season_id);
create index idx_movements_warehouse on stock_movements(warehouse_id);
create index idx_movements_status on stock_movements(organization_id, status);
create index idx_movements_date on stock_movements(organization_id, created_at desc);
create trigger trg_movements_updated_at before update on stock_movements for each row execute function fn_set_updated_at();

create table stock_movement_lines (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references stock_movements(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric not null check (quantity > 0),
  unit_cost_native numeric not null default 0,
  native_currency char(3) not null check (native_currency in ('MXN','USD')),
  unit_cost_mxn numeric not null default 0,
  line_total_native numeric not null default 0,
  line_total_mxn numeric not null default 0,
  destination_type text check (destination_type is null or destination_type in ('crop_lot','equipment','employee','maintenance','waste','other')),
  crop_lot_id uuid references crops_lots(id),
  equipment_id uuid references equipment(id),
  employee_id uuid references employees(id),
  cost_center_notes text,
  diesel_liters numeric,
  equipment_hours_before numeric,
  equipment_hours_after numeric,
  equipment_km_before numeric,
  equipment_km_after numeric,
  operator_employee_id uuid references employees(id),
  created_at timestamptz not null default now()
);
create index idx_movement_lines_movement on stock_movement_lines(movement_id);
create index idx_movement_lines_item on stock_movement_lines(item_id);

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  date date not null,
  currency_from char(3) not null default 'USD',
  currency_to char(3) not null default 'MXN',
  rate numeric not null check (rate > 0),
  source text not null check (source in ('DOF_FIX','banxico','manual')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint uq_fx_rate unique (organization_id, date, currency_from, currency_to)
);

create table audit_log (
  id bigserial primary key,
  organization_id uuid not null references organizations(id),
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  user_email text,
  ip_address inet,
  user_agent text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  diff jsonb,
  context jsonb
);
create index idx_audit_log_org on audit_log(organization_id, occurred_at desc);

create table season_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  season_id uuid not null references seasons(id),
  closed_at timestamptz not null default now(),
  closed_by uuid not null references auth.users(id),
  snapshot_data jsonb not null,
  total_value_mxn numeric not null default 0,
  total_value_usd numeric not null default 0,
  report_pdf_url text,
  is_reversible boolean not null default false,
  constraint uq_season_closure unique (organization_id, season_id)
);

create table adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  label text not null,
  is_active boolean not null default true,
  constraint uq_adjustment_reason unique (organization_id, code)
);

-- ============================================================================
-- 2. VIEWS
-- ============================================================================

create or replace view v_movements_no_cost as
select id, organization_id, season_id, movement_type, warehouse_id,
  counterpart_warehouse_id, document_number, reference_external,
  supplier_id, status, posted_at, posted_by, cancelled_at,
  cancellation_reason, notes, attachment_urls, created_at, created_by, updated_at
from stock_movements;

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

create or replace function auth_org_id()
returns uuid as $$
  select organization_id from profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function auth_role()
returns text as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- ============================================================================
-- 4. STOCK RECALCULATION TRIGGER
-- ============================================================================

create or replace function fn_recalc_stock_on_post()
returns trigger as $$
declare
  v_line record;
  v_is_entry boolean;
  v_current_qty numeric;
  v_current_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
begin
  if new.status != 'posted' or (old is not null and old.status = 'posted') then
    return new;
  end if;
  v_is_entry := new.movement_type like 'entry_%';
  for v_line in select * from stock_movement_lines where movement_id = new.id loop
    select quantity, avg_cost_native into v_current_qty, v_current_cost
    from item_stock where item_id = v_line.item_id and warehouse_id = new.warehouse_id and season_id = new.season_id;
    if not found then v_current_qty := 0; v_current_cost := 0; end if;
    if v_is_entry then
      v_new_qty := v_current_qty + v_line.quantity;
      if v_new_qty > 0 then
        v_new_cost := ((v_current_qty * v_current_cost) + (v_line.quantity * v_line.unit_cost_native)) / v_new_qty;
      else v_new_cost := v_line.unit_cost_native; end if;
    else
      v_new_qty := v_current_qty - v_line.quantity;
      v_new_cost := v_current_cost;
    end if;
    insert into item_stock (item_id, warehouse_id, season_id, quantity, avg_cost_native, avg_cost_mxn, last_movement_at)
    values (v_line.item_id, new.warehouse_id, new.season_id, v_new_qty, v_new_cost, v_new_cost * coalesce(new.fx_rate, 1), now())
    on conflict (item_id, warehouse_id, season_id) do update set
      quantity = excluded.quantity, avg_cost_native = excluded.avg_cost_native,
      avg_cost_mxn = excluded.avg_cost_mxn, last_movement_at = excluded.last_movement_at;
  end loop;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_recalc_stock after update on stock_movements for each row execute function fn_recalc_stock_on_post();
create trigger trg_recalc_stock_insert after insert on stock_movements for each row when (new.status = 'posted') execute function fn_recalc_stock_on_post();

-- ============================================================================
-- 5. RLS POLICIES (simplified — no circular dependencies)
-- ============================================================================

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table seasons enable row level security;
alter table warehouses enable row level security;
alter table categories enable row level security;
alter table units enable row level security;
alter table suppliers enable row level security;
alter table crops_lots enable row level security;
alter table equipment enable row level security;
alter table employees enable row level security;
alter table items enable row level security;
alter table item_stock enable row level security;
alter table stock_movements enable row level security;
alter table stock_movement_lines enable row level security;
alter table fx_rates enable row level security;
alter table audit_log enable row level security;
alter table season_closures enable row level security;
alter table adjustment_reasons enable row level security;

-- Profiles: users can ALWAYS read their own profile (breaks circular dep)
create policy "profiles_select_own" on profiles for select using (id = auth.uid());
create policy "profiles_select_org" on profiles for select using (organization_id = auth_org_id());
create policy "profiles_update_own" on profiles for update using (id = auth.uid());
create policy "profiles_admin" on profiles for all using (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- Organizations
create policy "org_select" on organizations for select using (id = auth_org_id());
create policy "org_update" on organizations for update using (id = auth_org_id() and auth_role() = 'super_admin');

-- Seasons
create policy "seasons_select" on seasons for select using (organization_id = auth_org_id());
create policy "seasons_admin" on seasons for all using (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- All catalog tables: org-scoped read, admin write
create policy "warehouses_select" on warehouses for select using (organization_id = auth_org_id());
create policy "warehouses_admin" on warehouses for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "categories_select" on categories for select using (organization_id = auth_org_id());
create policy "categories_admin" on categories for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "units_select" on units for select using (organization_id = auth_org_id());
create policy "units_admin" on units for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "suppliers_select" on suppliers for select using (organization_id = auth_org_id());
create policy "suppliers_admin" on suppliers for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente','almacenista'));
create policy "crops_lots_select" on crops_lots for select using (organization_id = auth_org_id());
create policy "crops_lots_admin" on crops_lots for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "equipment_select" on equipment for select using (organization_id = auth_org_id());
create policy "equipment_admin" on equipment for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "employees_select" on employees for select using (organization_id = auth_org_id());
create policy "employees_admin" on employees for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));
create policy "items_select" on items for select using (organization_id = auth_org_id());
create policy "items_admin" on items for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente','almacenista'));
create policy "adjustment_reasons_select" on adjustment_reasons for select using (organization_id = auth_org_id());
create policy "adjustment_reasons_admin" on adjustment_reasons for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));

-- Item stock
create policy "item_stock_select" on item_stock for select using (
  exists (select 1 from items where items.id = item_stock.item_id and items.organization_id = auth_org_id())
);

-- Stock movements
create policy "movements_select" on stock_movements for select using (organization_id = auth_org_id());
create policy "movements_insert" on stock_movements for insert with check (organization_id = auth_org_id());
create policy "movements_update" on stock_movements for update using (organization_id = auth_org_id());

-- Movement lines
create policy "lines_select" on stock_movement_lines for select using (
  exists (select 1 from stock_movements where stock_movements.id = stock_movement_lines.movement_id and stock_movements.organization_id = auth_org_id())
);
create policy "lines_insert" on stock_movement_lines for insert with check (
  exists (select 1 from stock_movements where stock_movements.id = stock_movement_lines.movement_id and stock_movements.organization_id = auth_org_id())
);

-- FX rates
create policy "fx_select" on fx_rates for select using (organization_id = auth_org_id());
create policy "fx_admin" on fx_rates for all using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));

-- Audit log
create policy "audit_select" on audit_log for select using (organization_id = auth_org_id() and auth_role() in ('super_admin','gerente'));

-- Season closures
create policy "closures_select" on season_closures for select using (organization_id = auth_org_id());
create policy "closures_insert" on season_closures for insert with check (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- ============================================================================
-- 6. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================================

create or replace function fn_handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, organization_id, full_name, role)
  values (
    new.id,
    (new.raw_user_meta_data->>'organization_id')::uuid,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'almacenista')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_user();

-- ============================================================================
-- 7. SEED DATA
-- ============================================================================

insert into organizations (id, name, rfc, address) values
  ('a0000000-0000-0000-0000-000000000001', 'Agrícola del Valle S.A. de C.V.', 'AVA210301ABC', 'Carretera Internacional km 34, Los Mochis, Sinaloa');

insert into seasons (id, organization_id, name, start_date, end_date, status) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Temporada 2025-2026', '2025-09-01', '2026-08-31', 'active');

insert into warehouses (id, organization_id, name, code) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Almacén Central', 'ALM-01'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Almacén Campo Norte', 'ALM-02');

insert into categories (id, organization_id, name, icon, color) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Agroquímicos', 'Beaker', '#8B5CF6'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Fertilizantes', 'Leaf', '#22C55E'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Semillas', 'Sprout', '#EAB308'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Refacciones', 'Wrench', '#71717A'),
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Herramientas', 'Hammer', '#F97316'),
  ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Combustible', 'Fuel', '#F97316'),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Consumibles', 'Package', '#6B7280'),
  ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'EPP', 'HardHat', '#3B82F6');

insert into units (id, organization_id, code, name, type) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'kg', 'Kilogramo', 'mass'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'L', 'Litro', 'volume'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'pz', 'Pieza', 'count'),
  ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'ton', 'Tonelada', 'mass'),
  ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'm', 'Metro', 'length');

insert into suppliers (id, organization_id, name, rfc, contact_name, phone, default_currency) values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Agroquímica del Noroeste', 'ANO200115XYZ', 'Carlos Mendoza', '6681234567', 'MXN'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'FertiPro International', 'FPI190201ABC', 'John Smith', '5551234567', 'USD'),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Refacciones Agrícolas del Pacífico', 'RAP180501DEF', 'Laura Vega', '6687654321', 'MXN');

insert into crops_lots (id, organization_id, season_id, name, code, crop_type, hectares, status, color) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lote 1 — Tomate Saladette', 'L-01', 'Tomate', 15.0, 'active', '#EF4444'),
  ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lote 2 — Chile Serrano', 'L-02', 'Chile', 10.0, 'active', '#22C55E'),
  ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lote 3 — Pepino', 'L-03', 'Pepino', 8.0, 'active', '#3B82F6'),
  ('10000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lote 4 — Maíz Grano', 'L-04', 'Maíz', 25.0, 'active', '#EAB308'),
  ('10000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lote 5 — Frijol', 'L-05', 'Frijol', 12.0, 'active', '#A855F7');

insert into equipment (id, organization_id, code, name, type, brand, model, year, current_hours) values
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'JD-01', 'Tractor John Deere 6110M', 'tractor', 'John Deere', '6110M', 2021, 3200),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'JD-02', 'Tractor John Deere 6120M', 'tractor', 'John Deere', '6120M', 2022, 2100),
  ('20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'NH-01', 'Tractor New Holland T6.160', 'tractor', 'New Holland', 'T6.160', 2020, 4500);

insert into employees (id, organization_id, employee_code, full_name, role_field) values
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'EMP-001', 'Juan Pérez González', 'Operador de tractor'),
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'EMP-002', 'Miguel Ángel Rodríguez', 'Operador de tractor'),
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'EMP-003', 'Pedro Hernández López', 'Almacenista');

insert into adjustment_reasons (organization_id, code, label) values
  ('a0000000-0000-0000-0000-000000000001', 'conteo_fisico', 'Conteo físico'),
  ('a0000000-0000-0000-0000-000000000001', 'merma', 'Merma'),
  ('a0000000-0000-0000-0000-000000000001', 'dano', 'Daño'),
  ('a0000000-0000-0000-0000-000000000001', 'caducidad', 'Caducidad'),
  ('a0000000-0000-0000-0000-000000000001', 'error_captura', 'Error de captura'),
  ('a0000000-0000-0000-0000-000000000001', 'otro', 'Otro');

insert into fx_rates (organization_id, date, currency_from, currency_to, rate, source) values
  ('a0000000-0000-0000-0000-000000000001', '2026-04-12', 'USD', 'MXN', 17.45, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', '2026-04-11', 'USD', 'MXN', 17.52, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', '2026-04-10', 'USD', 'MXN', 17.38, 'DOF_FIX');

-- Sample items (10 representative items)
insert into items (organization_id, sku, name, category_id, unit_id, native_currency, min_stock, max_stock, reorder_point, is_diesel) values
  ('a0000000-0000-0000-0000-000000000001', 'AGR-001', 'Glifosato 480 SL', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'MXN', 50, 500, 100, false),
  ('a0000000-0000-0000-0000-000000000001', 'AGR-002', 'Imidacloprid 350 SC', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'USD', 10, 100, 20, false),
  ('a0000000-0000-0000-0000-000000000001', 'FER-001', 'Urea 46%', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'MXN', 5, 50, 10, false),
  ('a0000000-0000-0000-0000-000000000001', 'FER-002', 'DAP 18-46-00', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'USD', 3, 30, 5, false),
  ('a0000000-0000-0000-0000-000000000001', 'SEM-001', 'Semilla tomate Saladette', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'USD', 5, 50, 10, false),
  ('a0000000-0000-0000-0000-000000000001', 'REF-001', 'Filtro aceite JD RE504836', 'd0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000003', 'MXN', 5, 30, 8, false),
  ('a0000000-0000-0000-0000-000000000001', 'HER-001', 'Pala cuadrada con mango', 'd0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 'MXN', 5, 30, 8, false),
  ('a0000000-0000-0000-0000-000000000001', 'COM-001', 'Diésel', 'd0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', 'MXN', 500, 10000, 1000, true),
  ('a0000000-0000-0000-0000-000000000001', 'CON-001', 'Hilo para tutoreo (rollo 2kg)', 'd0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000003', 'MXN', 20, 200, 40, false),
  ('a0000000-0000-0000-0000-000000000001', 'EPP-001', 'Guantes de nitrilo (caja 100)', 'd0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000003', 'MXN', 5, 50, 10, false);

-- ============================================================================
-- 8. CREATE DEMO AUTH USERS
-- ============================================================================

-- Insert users into auth.users
insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at, confirmation_token, recovery_token)
values
  ('aa000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@agristock.mx', crypt('demo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Ing. Ricardo Valenzuela","role":"super_admin"}', 'authenticated', 'authenticated', now(), now(), '', ''),
  ('aa000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'gerente@agristock.mx', crypt('demo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Lic. Martha Coronel","role":"gerente"}', 'authenticated', 'authenticated', now(), now(), '', ''),
  ('aa000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'almacen@agristock.mx', crypt('demo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"José Luis Martínez","role":"almacenista"}', 'authenticated', 'authenticated', now(), now(), '', ''),
  ('aa000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'supervisor@agristock.mx', crypt('demo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Francisco Javier Soto","role":"supervisor"}', 'authenticated', 'authenticated', now(), now(), '', '');

-- Create identities (required for email login)
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select u.id, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', u.id::text, now(), now(), now()
from auth.users u where u.email in ('admin@agristock.mx','gerente@agristock.mx','almacen@agristock.mx','supervisor@agristock.mx');

-- Manually insert profiles (in case trigger didn't fire for direct inserts)
insert into profiles (id, organization_id, full_name, role) values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Ing. Ricardo Valenzuela', 'super_admin'),
  ('aa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Lic. Martha Coronel', 'gerente'),
  ('aa000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'José Luis Martínez', 'almacenista'),
  ('aa000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Francisco Javier Soto', 'supervisor')
on conflict (id) do nothing;
