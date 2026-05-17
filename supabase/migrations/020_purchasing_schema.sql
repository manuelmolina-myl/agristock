-- ============================================================================
-- 020_purchasing_schema.sql — Sprint 2: Procurement module
-- Adds the full purchasing flow: requisition → quotation → PO → reception
-- → supplier invoice.  All tables tenant-scoped, soft-deleted, audit-tracked.
-- RPCs live in 021_purchasing_rpcs.sql.
-- ============================================================================

-- ─── Enums ─────────────────────────────────────────────────────────────────
do $$ begin create type requisition_status as enum (
  'draft', 'submitted', 'in_quotation', 'approved', 'rejected', 'po_generated', 'cancelled'
); exception when duplicate_object then null; end $$;

do $$ begin create type requisition_priority as enum (
  'low', 'medium', 'high', 'urgent'
); exception when duplicate_object then null; end $$;

do $$ begin create type quotation_status as enum (
  'requested', 'received', 'selected', 'discarded'
); exception when duplicate_object then null; end $$;

do $$ begin create type po_status as enum (
  'draft', 'sent', 'confirmed', 'partially_received', 'received', 'closed', 'cancelled'
); exception when duplicate_object then null; end $$;

do $$ begin create type reception_status as enum (
  'draft', 'accepted', 'rejected_partial', 'rejected'
); exception when duplicate_object then null; end $$;

do $$ begin create type invoice_status as enum (
  'pending', 'reconciled', 'paid', 'cancelled', 'discrepancy'
); exception when duplicate_object then null; end $$;

-- ─── purchase_requisitions ─────────────────────────────────────────────────
create table if not exists public.purchase_requisitions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id),
  folio                text not null,
  requester_id         uuid not null references auth.users(id),
  request_date         date not null default current_date,
  priority             requisition_priority not null default 'medium',
  justification        text,
  crop_lot_id          uuid references public.crops_lots(id),
  equipment_id         uuid references public.equipment(id),
  status               requisition_status not null default 'draft',
  approved_by          uuid references auth.users(id),
  approved_at          timestamptz,
  rejection_reason     text,
  estimated_total_mxn  numeric(18,4),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  deleted_at           timestamptz,
  unique (organization_id, folio)
);

create index if not exists idx_req_org_status
  on public.purchase_requisitions(organization_id, status)
  where deleted_at is null;
create index if not exists idx_req_requester
  on public.purchase_requisitions(requester_id);
create index if not exists idx_req_created_at
  on public.purchase_requisitions(organization_id, created_at desc)
  where deleted_at is null;

create trigger trg_req_updated_at
  before update on public.purchase_requisitions
  for each row execute function public.fn_set_updated_at();

-- ─── requisition_lines ─────────────────────────────────────────────────────
create table if not exists public.requisition_lines (
  id                    uuid primary key default gen_random_uuid(),
  requisition_id        uuid not null references public.purchase_requisitions(id) on delete cascade,
  item_id               uuid references public.items(id),
  free_description      text,
  quantity              numeric(14,4) not null check (quantity > 0),
  unit_id               uuid references public.units(id),
  estimated_unit_cost   numeric(18,4),
  currency              currency_code,
  notes                 text,
  created_at            timestamptz not null default now(),
  check (item_id is not null or free_description is not null)
);

create index if not exists idx_req_lines_req on public.requisition_lines(requisition_id);
create index if not exists idx_req_lines_item on public.requisition_lines(item_id) where item_id is not null;

-- ─── quotations ────────────────────────────────────────────────────────────
create table if not exists public.quotations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  requisition_id    uuid not null references public.purchase_requisitions(id),
  supplier_id       uuid not null references public.suppliers(id),
  folio             text not null,
  quotation_date    date not null,
  status            quotation_status not null default 'requested',
  pdf_url           text,
  payment_terms     text,
  delivery_days     int,
  validity_days     int,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (organization_id, folio)
);

create index if not exists idx_quot_req on public.quotations(requisition_id);
create index if not exists idx_quot_supplier on public.quotations(supplier_id);

create trigger trg_quot_updated_at
  before update on public.quotations
  for each row execute function public.fn_set_updated_at();

-- ─── quotation_lines ───────────────────────────────────────────────────────
create table if not exists public.quotation_lines (
  id                   uuid primary key default gen_random_uuid(),
  quotation_id         uuid not null references public.quotations(id) on delete cascade,
  requisition_line_id  uuid not null references public.requisition_lines(id),
  unit_cost            numeric(18,4) not null check (unit_cost >= 0),
  currency             currency_code not null,
  discount_pct         numeric(5,2) default 0 check (discount_pct between 0 and 100),
  tax_pct              numeric(5,2) default 16 check (tax_pct between 0 and 100),
  available            boolean default true,
  notes                text
);

create index if not exists idx_quot_lines_quot on public.quotation_lines(quotation_id);

-- ─── purchase_orders ───────────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id),
  folio                    text not null,
  supplier_id              uuid not null references public.suppliers(id),
  quotation_id             uuid references public.quotations(id),
  requisition_id           uuid references public.purchase_requisitions(id),
  issue_date               date not null default current_date,
  expected_delivery_date   date,
  payment_terms            text,
  delivery_location        text,
  destination_warehouse_id uuid references public.warehouses(id),
  subtotal_mxn             numeric(18,4),
  tax_mxn                  numeric(18,4),
  total_mxn                numeric(18,4),
  subtotal_usd             numeric(18,4),
  total_usd                numeric(18,4),
  fx_rate                  numeric(12,6),
  status                   po_status not null default 'draft',
  pdf_url                  text,
  sent_to_supplier_at      timestamptz,
  created_by               uuid references auth.users(id),
  approved_by              uuid references auth.users(id),
  approved_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,
  deleted_at               timestamptz,
  unique (organization_id, folio)
);

create index if not exists idx_po_supplier on public.purchase_orders(supplier_id);
create index if not exists idx_po_org_status
  on public.purchase_orders(organization_id, status)
  where deleted_at is null;
create index if not exists idx_po_created_at
  on public.purchase_orders(organization_id, created_at desc)
  where deleted_at is null;

create trigger trg_po_updated_at
  before update on public.purchase_orders
  for each row execute function public.fn_set_updated_at();

-- ─── po_lines ──────────────────────────────────────────────────────────────
create table if not exists public.po_lines (
  id                 uuid primary key default gen_random_uuid(),
  po_id              uuid not null references public.purchase_orders(id) on delete cascade,
  item_id            uuid not null references public.items(id),
  quantity           numeric(14,4) not null check (quantity > 0),
  unit_cost          numeric(18,4) not null check (unit_cost >= 0),
  currency           currency_code not null,
  tax_pct            numeric(5,2) default 16,
  received_quantity  numeric(14,4) not null default 0 check (received_quantity >= 0),
  notes              text
);

create index if not exists idx_po_lines_po on public.po_lines(po_id);

-- ─── receptions ────────────────────────────────────────────────────────────
create table if not exists public.receptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id),
  folio                    text not null,
  po_id                    uuid not null references public.purchase_orders(id),
  reception_date           date not null default current_date,
  warehouse_id             uuid not null references public.warehouses(id),
  received_by              uuid references auth.users(id),
  supplier_delivery_note   text,
  delivery_note_url        text,
  quality_notes            text,
  status                   reception_status not null default 'draft',
  photos                   jsonb default '[]'::jsonb,
  stock_movement_id        uuid references public.stock_movements(id),
  created_at               timestamptz not null default now(),
  unique (organization_id, folio)
);

create index if not exists idx_rec_po on public.receptions(po_id);
create index if not exists idx_rec_org_date
  on public.receptions(organization_id, reception_date desc);

-- ─── reception_lines ───────────────────────────────────────────────────────
create table if not exists public.reception_lines (
  id                  uuid primary key default gen_random_uuid(),
  reception_id        uuid not null references public.receptions(id) on delete cascade,
  po_line_id          uuid not null references public.po_lines(id),
  item_id             uuid not null references public.items(id),
  received_quantity   numeric(14,4) not null check (received_quantity >= 0),
  accepted_quantity   numeric(14,4) not null check (accepted_quantity >= 0),
  rejected_quantity   numeric(14,4) generated always as (received_quantity - accepted_quantity) stored,
  rejection_reason    text,
  supplier_lot        text,
  expiry_date         date,
  notes               text,
  check (accepted_quantity <= received_quantity)
);

create index if not exists idx_rec_lines_reception on public.reception_lines(reception_id);

-- ─── supplier_invoices ─────────────────────────────────────────────────────
create table if not exists public.supplier_invoices (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  po_id             uuid not null references public.purchase_orders(id),
  supplier_id       uuid not null references public.suppliers(id),
  invoice_folio     text not null,
  cfdi_uuid         text,
  issue_date        date not null,
  due_date          date,
  subtotal          numeric(18,4),
  tax               numeric(18,4),
  total             numeric(18,4),
  currency          currency_code not null,
  pdf_url           text,
  xml_url           text,
  status            invoice_status not null default 'pending',
  reconciled_at     timestamptz,
  reconciled_by     uuid references auth.users(id),
  discrepancies     jsonb,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (cfdi_uuid),
  unique (organization_id, supplier_id, invoice_folio)
);

create index if not exists idx_inv_po on public.supplier_invoices(po_id);
create index if not exists idx_inv_cfdi
  on public.supplier_invoices(cfdi_uuid)
  where cfdi_uuid is not null;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Pattern: all read for org members.  Create/edit gated by has_role checks.
alter table public.purchase_requisitions enable row level security;
alter table public.requisition_lines     enable row level security;
alter table public.quotations            enable row level security;
alter table public.quotation_lines       enable row level security;
alter table public.purchase_orders       enable row level security;
alter table public.po_lines              enable row level security;
alter table public.receptions            enable row level security;
alter table public.reception_lines       enable row level security;
alter table public.supplier_invoices     enable row level security;

-- Helper: who can write purchasing? (super_admin OR director_sg OR coord_compras)
create or replace function public.can_write_purchase(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id
      and role in ('super_admin','director_sg','coordinador_compras')
      and revoked_at is null
  );
$$;

-- Requisitions: anyone in org reads; coord_compras+director write; solicitante creates own
drop policy if exists pr_select on public.purchase_requisitions;
create policy pr_select on public.purchase_requisitions for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists pr_insert on public.purchase_requisitions;
create policy pr_insert on public.purchase_requisitions for insert
  with check (organization_id = public.auth_org_id() and requester_id = auth.uid());

drop policy if exists pr_update on public.purchase_requisitions;
create policy pr_update on public.purchase_requisitions for update
  using (
    organization_id = public.auth_org_id()
    and (
      public.can_write_purchase(auth.uid())
      or (requester_id = auth.uid() and status = 'draft')
    )
  );

-- Requisition lines: scope through parent
drop policy if exists rl_select on public.requisition_lines;
create policy rl_select on public.requisition_lines for select
  using (exists (select 1 from public.purchase_requisitions pr
    where pr.id = requisition_id and pr.organization_id = public.auth_org_id()));

drop policy if exists rl_write on public.requisition_lines;
create policy rl_write on public.requisition_lines for all
  using (exists (select 1 from public.purchase_requisitions pr
    where pr.id = requisition_id
      and pr.organization_id = public.auth_org_id()
      and (
        public.can_write_purchase(auth.uid())
        or (pr.requester_id = auth.uid() and pr.status = 'draft')
      )))
  with check (exists (select 1 from public.purchase_requisitions pr
    where pr.id = requisition_id
      and pr.organization_id = public.auth_org_id()
      and (
        public.can_write_purchase(auth.uid())
        or (pr.requester_id = auth.uid() and pr.status = 'draft')
      )));

-- Quotations: coord_compras+director read/write
drop policy if exists q_select on public.quotations;
create policy q_select on public.quotations for select
  using (organization_id = public.auth_org_id());

drop policy if exists q_write on public.quotations;
create policy q_write on public.quotations for all
  using (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()))
  with check (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()));

drop policy if exists ql_select on public.quotation_lines;
create policy ql_select on public.quotation_lines for select
  using (exists (select 1 from public.quotations q
    where q.id = quotation_id and q.organization_id = public.auth_org_id()));

drop policy if exists ql_write on public.quotation_lines;
create policy ql_write on public.quotation_lines for all
  using (exists (select 1 from public.quotations q
    where q.id = quotation_id and q.organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid())))
  with check (exists (select 1 from public.quotations q
    where q.id = quotation_id and q.organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid())));

-- Purchase orders
drop policy if exists po_select on public.purchase_orders;
create policy po_select on public.purchase_orders for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists po_write on public.purchase_orders;
create policy po_write on public.purchase_orders for all
  using (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()))
  with check (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()));

drop policy if exists pol_select on public.po_lines;
create policy pol_select on public.po_lines for select
  using (exists (select 1 from public.purchase_orders po
    where po.id = po_id and po.organization_id = public.auth_org_id()));

drop policy if exists pol_write on public.po_lines;
create policy pol_write on public.po_lines for all
  using (exists (select 1 from public.purchase_orders po
    where po.id = po_id and po.organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid())))
  with check (exists (select 1 from public.purchase_orders po
    where po.id = po_id and po.organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid())));

-- Receptions: almacenista + director_sg can create; everyone in org reads
drop policy if exists rec_select on public.receptions;
create policy rec_select on public.receptions for select
  using (organization_id = public.auth_org_id());

drop policy if exists rec_write on public.receptions;
create policy rec_write on public.receptions for all
  using (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'almacenista')
    or public.has_role(auth.uid(),'director_sg')
    or public.has_role(auth.uid(),'super_admin')
  ))
  with check (organization_id = public.auth_org_id() and (
    public.has_role(auth.uid(),'almacenista')
    or public.has_role(auth.uid(),'director_sg')
    or public.has_role(auth.uid(),'super_admin')
  ));

drop policy if exists recl_select on public.reception_lines;
create policy recl_select on public.reception_lines for select
  using (exists (select 1 from public.receptions r
    where r.id = reception_id and r.organization_id = public.auth_org_id()));

drop policy if exists recl_write on public.reception_lines;
create policy recl_write on public.reception_lines for all
  using (exists (select 1 from public.receptions r
    where r.id = reception_id and r.organization_id = public.auth_org_id() and (
      public.has_role(auth.uid(),'almacenista')
      or public.has_role(auth.uid(),'director_sg')
      or public.has_role(auth.uid(),'super_admin')
    )))
  with check (exists (select 1 from public.receptions r
    where r.id = reception_id and r.organization_id = public.auth_org_id() and (
      public.has_role(auth.uid(),'almacenista')
      or public.has_role(auth.uid(),'director_sg')
      or public.has_role(auth.uid(),'super_admin')
    )));

-- Supplier invoices
drop policy if exists si_select on public.supplier_invoices;
create policy si_select on public.supplier_invoices for select
  using (organization_id = public.auth_org_id());

drop policy if exists si_write on public.supplier_invoices;
create policy si_write on public.supplier_invoices for all
  using (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()))
  with check (organization_id = public.auth_org_id() and public.can_write_purchase(auth.uid()));

-- ─── Audit triggers (reuse audit_simple_catalog) ───────────────────────────
drop trigger if exists trg_audit_requisitions on public.purchase_requisitions;
create trigger trg_audit_requisitions
  after insert or update or delete on public.purchase_requisitions
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_quotations on public.quotations;
create trigger trg_audit_quotations
  after insert or update or delete on public.quotations
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_pos on public.purchase_orders;
create trigger trg_audit_pos
  after insert or update or delete on public.purchase_orders
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_receptions on public.receptions;
create trigger trg_audit_receptions
  after insert or update or delete on public.receptions
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_invoices on public.supplier_invoices;
create trigger trg_audit_invoices
  after insert or update or delete on public.supplier_invoices
  for each row execute function public.audit_simple_catalog();
