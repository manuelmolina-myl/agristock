-- ============================================================================
-- 015_equipment_cmms_fields.sql — Sprint 0 §1.3
-- Extend equipment table with CMMS-ready fields: status, kind, serial, photos,
-- responsible employee, acquisition cost, insurance, etc.
-- ============================================================================
-- Original equipment.type: 'tractor' | 'implement' | 'vehicle' | 'pump' | 'other'
-- New equipment.kind:      'vehicle' | 'machinery' | 'implement' | 'installation'
--                          | 'irrigation_system' | 'tool' | 'other'
-- Mapping:
--   tractor   → machinery
--   implement → implement
--   vehicle   → vehicle
--   pump      → irrigation_system   (agricultural pumps are typically irrigation)
--   other     → other
-- ============================================================================

-- ─── 1. Enums ──────────────────────────────────────────────────────────────
do $$ begin
  create type equipment_status as enum (
    'operational', 'in_maintenance', 'out_of_service', 'disposed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_kind as enum (
    'vehicle', 'machinery', 'implement', 'installation',
    'irrigation_system', 'tool', 'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. New columns on equipment ───────────────────────────────────────────
alter table public.equipment
  add column if not exists status equipment_status not null default 'operational',
  add column if not exists kind equipment_kind,
  add column if not exists serial_number text,
  add column if not exists engine_number text,
  add column if not exists location text,
  add column if not exists responsible_employee_id uuid references public.employees(id),
  add column if not exists acquisition_date date,
  add column if not exists acquisition_cost_native numeric(18,4),
  add column if not exists acquisition_currency char(3),
  add column if not exists insurance_policy text,
  add column if not exists insurance_expires_at date,
  add column if not exists documents jsonb default '[]'::jsonb,
  add column if not exists photos jsonb default '[]'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- ─── 3. Backfill kind from legacy type column ──────────────────────────────
update public.equipment set kind = case lower(type)
  when 'tractor'   then 'machinery'::equipment_kind
  when 'implement' then 'implement'::equipment_kind
  when 'vehicle'   then 'vehicle'::equipment_kind
  when 'pump'      then 'irrigation_system'::equipment_kind
  when 'other'     then 'other'::equipment_kind
  else 'other'::equipment_kind
end
where kind is null;

-- After backfill, kind should be NOT NULL for every row.  Enforce going
-- forward via NOT NULL once we drop legacy `type` (end of Sprint 3 per plan).

-- ─── 4. Mark legacy column deprecated ──────────────────────────────────────
comment on column public.equipment.type is
  'DEPRECATED — use kind. Dropped at end of Sprint 3 (CMMS module).';

-- ─── 5. Indexes ────────────────────────────────────────────────────────────
create index if not exists idx_equipment_status
  on public.equipment(organization_id, status)
  where deleted_at is null;

create index if not exists idx_equipment_kind
  on public.equipment(organization_id, kind)
  where deleted_at is null;

create index if not exists idx_equipment_responsible
  on public.equipment(responsible_employee_id)
  where responsible_employee_id is not null and deleted_at is null;

create index if not exists idx_equipment_insurance_expiry
  on public.equipment(insurance_expires_at)
  where insurance_expires_at is not null and deleted_at is null;
