-- ============================================================================
-- 022_cmms_schema.sql — Sprint 3: CMMS (Computerized Maintenance Management)
-- Adds work orders, maintenance plans, parts consumption, labor tracking,
-- and a refreshable materialized view for MTBF / MTTR KPIs.
-- RPCs live in 023_cmms_rpcs.sql.
-- ============================================================================

-- ─── Enums ─────────────────────────────────────────────────────────────────
do $$ begin create type wo_type as enum (
  'corrective', 'preventive', 'predictive', 'improvement', 'inspection'
); exception when duplicate_object then null; end $$;

do $$ begin create type wo_priority as enum (
  'low', 'medium', 'high', 'critical'
); exception when duplicate_object then null; end $$;

do $$ begin create type wo_status as enum (
  'reported', 'scheduled', 'assigned', 'in_progress', 'waiting_parts',
  'completed', 'closed', 'cancelled'
); exception when duplicate_object then null; end $$;

do $$ begin create type plan_trigger_type as enum (
  'hours', 'kilometers', 'calendar', 'usage_hours'
); exception when duplicate_object then null; end $$;

-- ─── maintenance_plans ─────────────────────────────────────────────────────
create table if not exists public.maintenance_plans (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id),
  equipment_id           uuid not null references public.equipment(id),
  name                   text not null,
  trigger_type           plan_trigger_type not null,
  interval_value         numeric not null check (interval_value > 0),
  interval_unit          text not null,
  last_execution_value   numeric,
  next_execution_value   numeric not null,
  advance_warning        numeric default 0,
  default_checklist      jsonb default '[]'::jsonb,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  deleted_at             timestamptz
);

create index if not exists idx_plans_equipment
  on public.maintenance_plans(equipment_id)
  where is_active and deleted_at is null;

create trigger trg_plans_updated_at
  before update on public.maintenance_plans
  for each row execute function public.fn_set_updated_at();

-- ─── work_orders ───────────────────────────────────────────────────────────
create table if not exists public.work_orders (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations(id),
  folio                      text not null,
  equipment_id               uuid not null references public.equipment(id),
  wo_type                    wo_type not null,
  priority                   wo_priority not null default 'medium',
  failure_description        text,
  failure_type_id            uuid references public.failure_types(id),
  maintenance_plan_id        uuid references public.maintenance_plans(id),
  reported_by                uuid references auth.users(id),
  reported_at                timestamptz not null default now(),
  scheduled_date             date,
  started_at                 timestamptz,
  completed_at               timestamptz,
  status                     wo_status not null default 'reported',
  primary_technician_id      uuid references public.employees(id),
  helper_technician_ids      uuid[] default '{}'::uuid[],
  estimated_hours            numeric,
  actual_hours               numeric,
  hours_meter_open           numeric,
  hours_meter_close          numeric,
  downtime_minutes           int,
  solution_applied           text,
  notes                      text,
  requires_external_service  boolean default false,
  external_supplier_id       uuid references public.suppliers(id),
  external_service_cost_mxn  numeric(18,4) default 0,
  total_cost_mxn             numeric(18,4) default 0,
  photos_before              jsonb default '[]'::jsonb,
  photos_after               jsonb default '[]'::jsonb,
  approved_by                uuid references auth.users(id),
  approved_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz,
  deleted_at                 timestamptz,
  unique (organization_id, folio)
);

create index if not exists idx_wo_equipment
  on public.work_orders(equipment_id)
  where deleted_at is null;
create index if not exists idx_wo_org_status
  on public.work_orders(organization_id, status)
  where deleted_at is null;
create index if not exists idx_wo_technician
  on public.work_orders(primary_technician_id)
  where primary_technician_id is not null;
create index if not exists idx_wo_scheduled
  on public.work_orders(scheduled_date)
  where status in ('scheduled', 'assigned');
create index if not exists idx_wo_created
  on public.work_orders(organization_id, created_at desc)
  where deleted_at is null;

create trigger trg_wo_updated_at
  before update on public.work_orders
  for each row execute function public.fn_set_updated_at();

-- ─── wo_checklist (tareas por orden) ────────────────────────────────────────
create table if not exists public.wo_checklist (
  id                 uuid primary key default gen_random_uuid(),
  wo_id              uuid not null references public.work_orders(id) on delete cascade,
  task_description   text not null,
  is_completed       boolean default false,
  completed_by       uuid references auth.users(id),
  completed_at       timestamptz,
  notes              text,
  display_order      int default 0
);

create index if not exists idx_wo_checklist_wo on public.wo_checklist(wo_id);

-- ─── wo_parts (refacciones consumidas) ──────────────────────────────────────
create table if not exists public.wo_parts (
  id                       uuid primary key default gen_random_uuid(),
  wo_id                    uuid not null references public.work_orders(id) on delete cascade,
  item_id                  uuid not null references public.items(id),
  requested_quantity       numeric(14,4) not null check (requested_quantity > 0),
  delivered_quantity       numeric(14,4) default 0 check (delivered_quantity >= 0),
  stock_movement_line_id   uuid references public.stock_movement_lines(id),
  total_cost_mxn           numeric(18,4) default 0,
  status                   text not null default 'requested'
                            check (status in ('requested', 'delivered', 'partially_delivered', 'returned')),
  created_at               timestamptz not null default now()
);

create index if not exists idx_wo_parts_wo on public.wo_parts(wo_id);
create index if not exists idx_wo_parts_item on public.wo_parts(item_id);

-- ─── wo_labor (mano de obra) ────────────────────────────────────────────────
create table if not exists public.wo_labor (
  id                  uuid primary key default gen_random_uuid(),
  wo_id               uuid not null references public.work_orders(id) on delete cascade,
  technician_id       uuid not null references public.employees(id),
  work_date           date not null,
  hours               numeric(6,2) not null check (hours > 0),
  hourly_rate_mxn     numeric(10,2),
  total_mxn           numeric(18,4) generated always as (hours * coalesce(hourly_rate_mxn, 0)) stored,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_wo_labor_wo on public.wo_labor(wo_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.maintenance_plans enable row level security;
alter table public.work_orders       enable row level security;
alter table public.wo_checklist      enable row level security;
alter table public.wo_parts          enable row level security;
alter table public.wo_labor          enable row level security;

-- Helper: who can write CMMS?
create or replace function public.can_write_cmms(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id
      and role in ('super_admin','director_sg','coordinador_mantenimiento','tecnico')
      and revoked_at is null
  );
$$;

-- maintenance_plans
drop policy if exists mp_select on public.maintenance_plans;
create policy mp_select on public.maintenance_plans for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists mp_write on public.maintenance_plans;
create policy mp_write on public.maintenance_plans for all
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'director_sg')
    or public.has_role(auth.uid(),'coordinador_mantenimiento')
    or public.has_role(auth.uid(),'super_admin')
  ))
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'director_sg')
    or public.has_role(auth.uid(),'coordinador_mantenimiento')
    or public.has_role(auth.uid(),'super_admin')
  ));

-- work_orders: anyone in org reads.  Operator/tecnico can report (insert).
-- Coordinador/director can update.  Soft-delete is admin-only.
drop policy if exists wo_select on public.work_orders;
create policy wo_select on public.work_orders for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists wo_insert on public.work_orders;
create policy wo_insert on public.work_orders for insert
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(),'operador')
      or public.has_role(auth.uid(),'tecnico')
      or public.has_role(auth.uid(),'coordinador_mantenimiento')
      or public.has_role(auth.uid(),'director_sg')
      or public.has_role(auth.uid(),'super_admin')
    )
  );

drop policy if exists wo_update on public.work_orders;
create policy wo_update on public.work_orders for update
  using (organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid()));

-- wo_checklist / wo_parts / wo_labor: scope through parent work_order
drop policy if exists woc_select on public.wo_checklist;
create policy woc_select on public.wo_checklist for select
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id()));

drop policy if exists woc_write on public.wo_checklist;
create policy woc_write on public.wo_checklist for all
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())))
  with check (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())));

drop policy if exists wop_select on public.wo_parts;
create policy wop_select on public.wo_parts for select
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id()));

drop policy if exists wop_write on public.wo_parts;
create policy wop_write on public.wo_parts for all
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())))
  with check (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())));

drop policy if exists wol_select on public.wo_labor;
create policy wol_select on public.wo_labor for select
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id()));

drop policy if exists wol_write on public.wo_labor;
create policy wol_write on public.wo_labor for all
  using (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())))
  with check (exists (select 1 from public.work_orders wo
    where wo.id = wo_id and wo.organization_id = public.auth_org_id() and public.can_write_cmms(auth.uid())));

-- ─── Audit triggers ─────────────────────────────────────────────────────────
drop trigger if exists trg_audit_work_orders on public.work_orders;
create trigger trg_audit_work_orders
  after insert or update or delete on public.work_orders
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_maint_plans on public.maintenance_plans;
create trigger trg_audit_maint_plans
  after insert or update or delete on public.maintenance_plans
  for each row execute function public.audit_simple_catalog();

-- ─── Materialized view for KPIs (refreshed nightly via pg_cron) ────────────
drop materialized view if exists public.mv_maintenance_history;
create materialized view public.mv_maintenance_history as
select
  e.organization_id,
  e.id          as equipment_id,
  e.code        as equipment_code,
  e.name        as equipment_name,
  count(*) filter (where wo.wo_type = 'corrective' and wo.status = 'closed')                                  as corrective_count,
  count(*) filter (where wo.wo_type = 'preventive' and wo.status = 'closed')                                  as preventive_count,
  count(*) filter (where wo.status not in ('closed','cancelled'))                                             as open_count,
  avg(extract(epoch from (wo.completed_at - wo.started_at)) / 3600)
    filter (where wo.status = 'closed' and wo.started_at is not null and wo.completed_at is not null)         as mttr_hours,
  sum(wo.total_cost_mxn) filter (where wo.status = 'closed' and wo.completed_at > now() - interval '1 year')  as total_cost_mxn_last_year,
  max(wo.completed_at) filter (where wo.status = 'closed')                                                    as last_closed_at
from public.equipment e
left join public.work_orders wo
       on wo.equipment_id = e.id
      and wo.deleted_at is null
where e.deleted_at is null
group by e.organization_id, e.id, e.code, e.name;

create unique index if not exists idx_mv_maint_eq on public.mv_maintenance_history(equipment_id);
create index if not exists idx_mv_maint_org on public.mv_maintenance_history(organization_id);
