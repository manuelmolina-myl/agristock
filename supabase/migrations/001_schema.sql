-- ============================================================================
-- AgriStock — Full Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Helper: updated_at trigger function ─────────────────────────────────────
create or replace function fn_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 1. MASTER TABLES
-- ============================================================================

-- ─── Organizations ───────────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rfc text,
  address text,
  logo_url text,
  base_currency char(3) not null default 'MXN' check (base_currency in ('MXN', 'USD')),
  timezone text not null default 'America/Mazatlan',
  allow_negative_stock boolean not null default false,
  approval_threshold_mxn numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function fn_set_updated_at();

-- ─── Profiles (extends auth.users) ──────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  full_name text not null,
  role text not null check (role in ('super_admin', 'gerente', 'almacenista', 'supervisor')),
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index idx_profiles_org on profiles(organization_id);
create index idx_profiles_role on profiles(organization_id, role);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function fn_set_updated_at();

-- ─── Seasons ─────────────────────────────────────────────────────────────────
create table seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'closing', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Only one active season per organization
  constraint uq_seasons_active exclude (organization_id with =) where (status = 'active')
);

create index idx_seasons_org_status on seasons(organization_id, status);

create trigger trg_seasons_updated_at
  before update on seasons
  for each row execute function fn_set_updated_at();

-- ─── Warehouses ──────────────────────────────────────────────────────────────
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

create trigger trg_warehouses_updated_at
  before update on warehouses
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 2. CATALOG TABLES
-- ============================================================================

-- ─── Categories (hierarchical) ───────────────────────────────────────────────
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
create index idx_categories_parent on categories(parent_id);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function fn_set_updated_at();

-- ─── Units ───────────────────────────────────────────────────────────────────
create table units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  type text not null check (type in ('mass', 'volume', 'count', 'length')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint uq_units_code unique (organization_id, code)
);

create index idx_units_org on units(organization_id);

create trigger trg_units_updated_at
  before update on units
  for each row execute function fn_set_updated_at();

-- ─── Suppliers ───────────────────────────────────────────────────────────────
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  rfc text,
  contact_name text,
  phone text,
  email text,
  default_currency char(3) not null default 'MXN' check (default_currency in ('MXN', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index idx_suppliers_org on suppliers(organization_id);

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function fn_set_updated_at();

-- ─── Crop Lots (centros de costo) ────────────────────────────────────────────
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

create trigger trg_crops_lots_updated_at
  before update on crops_lots
  for each row execute function fn_set_updated_at();

-- ─── Equipment / Tractors ────────────────────────────────────────────────────
create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  type text not null default 'tractor' check (type in ('tractor', 'implement', 'vehicle', 'pump', 'other')),
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

create trigger trg_equipment_updated_at
  before update on equipment
  for each row execute function fn_set_updated_at();

-- ─── Employees ───────────────────────────────────────────────────────────────
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

create trigger trg_employees_updated_at
  before update on employees
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 3. INVENTORY TABLES
-- ============================================================================

-- ─── Items (SKU catalog) ─────────────────────────────────────────────────────
create table items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  sku text not null,
  name text not null,
  description text,
  category_id uuid references categories(id),
  unit_id uuid references units(id),
  native_currency char(3) not null default 'MXN' check (native_currency in ('MXN', 'USD')),
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
create index idx_items_barcode on items(organization_id, barcode) where barcode is not null;
create index idx_items_diesel on items(organization_id) where is_diesel = true;

create trigger trg_items_updated_at
  before update on items
  for each row execute function fn_set_updated_at();

-- ─── Item Stock (materialized per warehouse per season) ──────────────────────
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

create index idx_item_stock_warehouse on item_stock(warehouse_id, season_id);
create index idx_item_stock_low on item_stock(item_id, warehouse_id, season_id) where quantity > 0;

-- ============================================================================
-- 4. MOVEMENT TABLES
-- ============================================================================

-- ─── Stock Movements (header) ────────────────────────────────────────────────
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  season_id uuid not null references seasons(id),
  movement_type text not null check (movement_type in (
    'entry_purchase', 'entry_return', 'entry_transfer', 'entry_adjustment', 'entry_initial',
    'exit_consumption', 'exit_transfer', 'exit_adjustment', 'exit_waste', 'exit_sale'
  )),
  warehouse_id uuid not null references warehouses(id),
  counterpart_warehouse_id uuid references warehouses(id),
  document_number text,
  reference_external text,
  supplier_id uuid references suppliers(id),
  fx_rate numeric,
  fx_source text check (fx_source is null or fx_source in ('DOF_FIX', 'banxico', 'manual')),
  fx_date date,
  total_native numeric,
  total_mxn numeric,
  total_usd numeric,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  notes text,
  attachment_urls text[],
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  -- Cannot edit posted movements
  constraint chk_posted_immutable check (
    status != 'posted' or (cancelled_at is null and cancellation_reason is null)
  )
);

create index idx_movements_org_season on stock_movements(organization_id, season_id);
create index idx_movements_warehouse on stock_movements(warehouse_id);
create index idx_movements_type on stock_movements(organization_id, movement_type);
create index idx_movements_status on stock_movements(organization_id, status);
create index idx_movements_date on stock_movements(organization_id, created_at desc);
create index idx_movements_supplier on stock_movements(supplier_id) where supplier_id is not null;
create index idx_movements_doc_number on stock_movements(organization_id, document_number) where document_number is not null;

create trigger trg_movements_updated_at
  before update on stock_movements
  for each row execute function fn_set_updated_at();

-- ─── Stock Movement Lines (detail) ──────────────────────────────────────────
create table stock_movement_lines (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references stock_movements(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric not null check (quantity > 0),
  unit_cost_native numeric not null default 0,
  native_currency char(3) not null check (native_currency in ('MXN', 'USD')),
  unit_cost_mxn numeric not null default 0,
  line_total_native numeric not null default 0,
  line_total_mxn numeric not null default 0,
  -- Destination (exits only)
  destination_type text check (destination_type is null or destination_type in (
    'crop_lot', 'equipment', 'employee', 'maintenance', 'waste', 'other'
  )),
  crop_lot_id uuid references crops_lots(id),
  equipment_id uuid references equipment(id),
  employee_id uuid references employees(id),
  cost_center_notes text,
  -- Diesel-specific fields
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
create index idx_movement_lines_crop_lot on stock_movement_lines(crop_lot_id) where crop_lot_id is not null;
create index idx_movement_lines_equipment on stock_movement_lines(equipment_id) where equipment_id is not null;

-- ============================================================================
-- 5. SUPPORT TABLES
-- ============================================================================

-- ─── FX Rates ────────────────────────────────────────────────────────────────
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  date date not null,
  currency_from char(3) not null default 'USD',
  currency_to char(3) not null default 'MXN',
  rate numeric not null check (rate > 0),
  source text not null check (source in ('DOF_FIX', 'banxico', 'manual')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint uq_fx_rate unique (organization_id, date, currency_from, currency_to)
);

create index idx_fx_rates_org_date on fx_rates(organization_id, date desc);

-- ─── Audit Log ───────────────────────────────────────────────────────────────
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
create index idx_audit_log_entity on audit_log(entity_type, entity_id);
create index idx_audit_log_user on audit_log(user_id, occurred_at desc);

-- ─── Season Closures ─────────────────────────────────────────────────────────
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

-- ─── Adjustment Reasons (catalog) ────────────────────────────────────────────
create table adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  label text not null,
  is_active boolean not null default true,
  constraint uq_adjustment_reason unique (organization_id, code)
);

-- ============================================================================
-- 6. VIEWS
-- ============================================================================

-- View without costs for Almacenista role
create or replace view v_movements_no_cost as
select
  id, organization_id, season_id, movement_type, warehouse_id,
  counterpart_warehouse_id, document_number, reference_external,
  supplier_id, status, posted_at, posted_by, cancelled_at,
  cancellation_reason, notes, attachment_urls,
  created_at, created_by, updated_at
from stock_movements;

create or replace view v_movement_lines_no_cost as
select
  id, movement_id, item_id, quantity, native_currency,
  destination_type, crop_lot_id, equipment_id, employee_id,
  cost_center_notes, diesel_liters, equipment_hours_before,
  equipment_hours_after, equipment_km_before, equipment_km_after,
  operator_employee_id, created_at
from stock_movement_lines;

-- ============================================================================
-- 7. AUDIT TRIGGER (generic)
-- ============================================================================

create or replace function fn_audit_trigger()
returns trigger as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb;
  v_action text;
  v_org_id uuid;
begin
  v_action := TG_OP;

  if TG_OP = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_org_id := old.organization_id;
  elsif TG_OP = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
    v_org_id := new.organization_id;
  else -- UPDATE
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_org_id := new.organization_id;
    -- Compute diff: only changed keys
    select jsonb_object_agg(key, value)
    into v_diff
    from jsonb_each(v_new)
    where v_new -> key is distinct from v_old -> key;
  end if;

  insert into audit_log (
    organization_id, user_id, user_email, action,
    entity_type, entity_id, before_data, after_data, diff
  ) values (
    v_org_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    v_action,
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    v_old,
    v_new,
    v_diff
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Apply audit triggers to transactional tables
create trigger trg_audit_items
  after insert or update or delete on items
  for each row execute function fn_audit_trigger();

create trigger trg_audit_stock_movements
  after insert or update or delete on stock_movements
  for each row execute function fn_audit_trigger();

create trigger trg_audit_warehouses
  after insert or update or delete on warehouses
  for each row execute function fn_audit_trigger();

create trigger trg_audit_seasons
  after insert or update or delete on seasons
  for each row execute function fn_audit_trigger();

create trigger trg_audit_crops_lots
  after insert or update or delete on crops_lots
  for each row execute function fn_audit_trigger();

create trigger trg_audit_equipment
  after insert or update or delete on equipment
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 8. STOCK RECALCULATION TRIGGER
-- ============================================================================

-- Recalculate item_stock when a movement is posted
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
  -- Only fire when status changes to 'posted'
  if new.status != 'posted' or (old is not null and old.status = 'posted') then
    return new;
  end if;

  v_is_entry := new.movement_type like 'entry_%';

  for v_line in
    select * from stock_movement_lines where movement_id = new.id
  loop
    -- Get current stock
    select quantity, avg_cost_native
    into v_current_qty, v_current_cost
    from item_stock
    where item_id = v_line.item_id
      and warehouse_id = new.warehouse_id
      and season_id = new.season_id;

    if not found then
      v_current_qty := 0;
      v_current_cost := 0;
    end if;

    if v_is_entry then
      -- Weighted average cost on entry
      v_new_qty := v_current_qty + v_line.quantity;
      if v_new_qty > 0 then
        v_new_cost := ((v_current_qty * v_current_cost) + (v_line.quantity * v_line.unit_cost_native)) / v_new_qty;
      else
        v_new_cost := v_line.unit_cost_native;
      end if;
    else
      -- Exit: decrease qty, cost stays the same
      v_new_qty := v_current_qty - v_line.quantity;
      v_new_cost := v_current_cost;
    end if;

    -- Upsert item_stock
    insert into item_stock (item_id, warehouse_id, season_id, quantity, avg_cost_native, avg_cost_mxn, last_movement_at)
    values (
      v_line.item_id,
      new.warehouse_id,
      new.season_id,
      v_new_qty,
      v_new_cost,
      v_new_cost * coalesce(new.fx_rate, 1),
      now()
    )
    on conflict (item_id, warehouse_id, season_id) do update set
      quantity = excluded.quantity,
      avg_cost_native = excluded.avg_cost_native,
      avg_cost_mxn = excluded.avg_cost_mxn,
      last_movement_at = excluded.last_movement_at;

    -- For transfers, also update counterpart warehouse
    if new.movement_type in ('entry_transfer', 'exit_transfer') and new.counterpart_warehouse_id is not null then
      -- The counterpart gets the opposite operation
      -- (handled by creating a paired movement, not here)
      null;
    end if;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_recalc_stock
  after update on stock_movements
  for each row execute function fn_recalc_stock_on_post();

-- Also handle direct inserts with status='posted'
create trigger trg_recalc_stock_insert
  after insert on stock_movements
  for each row
  when (new.status = 'posted')
  execute function fn_recalc_stock_on_post();

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================

-- Helper function: get current user's organization_id
create or replace function auth_org_id()
returns uuid as $$
  select organization_id from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper function: get current user's role
create or replace function auth_role()
returns text as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- ─── Enable RLS on all tables ────────────────────────────────────────────────
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

-- ─── Organizations ───────────────────────────────────────────────────────────
create policy "Users can view their organization"
  on organizations for select
  using (id = auth_org_id());

create policy "Super admins can update their organization"
  on organizations for update
  using (id = auth_org_id() and auth_role() = 'super_admin');

-- ─── Profiles ────────────────────────────────────────────────────────────────
create policy "Users can view profiles in their org"
  on profiles for select
  using (organization_id = auth_org_id());

create policy "Users can update their own profile"
  on profiles for update
  using (id = auth.uid());

create policy "Super admins can manage all profiles in their org"
  on profiles for all
  using (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- ─── Seasons ─────────────────────────────────────────────────────────────────
create policy "Users can view seasons in their org"
  on seasons for select
  using (organization_id = auth_org_id());

create policy "Super admins can manage seasons"
  on seasons for all
  using (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- ─── Warehouses ──────────────────────────────────────────────────────────────
create policy "Users can view warehouses in their org"
  on warehouses for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage warehouses"
  on warehouses for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Categories ──────────────────────────────────────────────────────────────
create policy "Users can view categories"
  on categories for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage categories"
  on categories for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Units ───────────────────────────────────────────────────────────────────
create policy "Users can view units"
  on units for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage units"
  on units for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Suppliers ───────────────────────────────────────────────────────────────
create policy "Users can view suppliers"
  on suppliers for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage suppliers"
  on suppliers for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente', 'almacenista'));

-- ─── Crops/Lots ──────────────────────────────────────────────────────────────
create policy "Users can view crop lots"
  on crops_lots for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage crop lots"
  on crops_lots for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Equipment ───────────────────────────────────────────────────────────────
create policy "Users can view equipment"
  on equipment for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage equipment"
  on equipment for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Employees ───────────────────────────────────────────────────────────────
create policy "Users can view employees"
  on employees for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins can manage employees"
  on employees for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Items ───────────────────────────────────────────────────────────────────
create policy "Users can view items"
  on items for select
  using (organization_id = auth_org_id() and deleted_at is null);

create policy "Admins and almacenistas can manage items"
  on items for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente', 'almacenista'));

-- ─── Item Stock ──────────────────────────────────────────────────────────────
create policy "Users can view item stock"
  on item_stock for select
  using (
    exists (
      select 1 from items where items.id = item_stock.item_id and items.organization_id = auth_org_id()
    )
  );

-- ─── Stock Movements ─────────────────────────────────────────────────────────
create policy "Users can view movements in their org"
  on stock_movements for select
  using (organization_id = auth_org_id());

create policy "Users can create draft movements"
  on stock_movements for insert
  with check (
    organization_id = auth_org_id()
    and status = 'draft'
    and season_id in (select id from seasons where organization_id = auth_org_id() and status != 'closed')
  );

create policy "Users can update draft movements"
  on stock_movements for update
  using (
    organization_id = auth_org_id()
    and status = 'draft'
  );

-- ─── Stock Movement Lines ────────────────────────────────────────────────────
create policy "Users can view movement lines"
  on stock_movement_lines for select
  using (
    exists (
      select 1 from stock_movements
      where stock_movements.id = stock_movement_lines.movement_id
        and stock_movements.organization_id = auth_org_id()
    )
  );

create policy "Users can manage movement lines for draft movements"
  on stock_movement_lines for all
  using (
    exists (
      select 1 from stock_movements
      where stock_movements.id = stock_movement_lines.movement_id
        and stock_movements.organization_id = auth_org_id()
        and stock_movements.status = 'draft'
    )
  );

-- ─── FX Rates ────────────────────────────────────────────────────────────────
create policy "Users can view fx rates"
  on fx_rates for select
  using (organization_id = auth_org_id());

create policy "Admins can manage fx rates"
  on fx_rates for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Audit Log ───────────────────────────────────────────────────────────────
create policy "Admins can view audit log"
  on audit_log for select
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ─── Season Closures ─────────────────────────────────────────────────────────
create policy "Admins can view season closures"
  on season_closures for select
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

create policy "Super admins can create season closures"
  on season_closures for insert
  with check (organization_id = auth_org_id() and auth_role() = 'super_admin');

-- ─── Adjustment Reasons ──────────────────────────────────────────────────────
create policy "Users can view adjustment reasons"
  on adjustment_reasons for select
  using (organization_id = auth_org_id());

create policy "Admins can manage adjustment reasons"
  on adjustment_reasons for all
  using (organization_id = auth_org_id() and auth_role() in ('super_admin', 'gerente'));

-- ============================================================================
-- 10. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================================

-- This function creates a profile when a new user signs up
-- The organization_id must be passed as user metadata during signup
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
