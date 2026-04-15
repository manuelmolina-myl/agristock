-- ─── solicitudes ────────────────────────────────────────────────────────────

create table solicitudes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  season_id uuid not null references seasons(id),
  requested_by uuid not null references auth.users(id),
  destination_type text check (destination_type in ('crop_lot','equipment','employee','maintenance','other')),
  crop_lot_id uuid references crops_lots(id),
  equipment_id uuid references equipment(id),
  employee_id uuid references employees(id),
  destination_notes text,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada','entregada')),
  urgency text not null default 'normal' check (urgency in ('baja','normal','alta','urgente')),
  notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index idx_solicitudes_org on solicitudes(organization_id);
create index idx_solicitudes_requested_by on solicitudes(requested_by);
create index idx_solicitudes_status on solicitudes(organization_id, status);

create trigger trg_solicitudes_updated_at before update on solicitudes for each row execute function fn_set_updated_at();

-- ─── solicitud_lines ─────────────────────────────────────────────────────────

create table solicitud_lines (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity_requested numeric not null check (quantity_requested > 0),
  quantity_approved numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_solicitud_lines on solicitud_lines(solicitud_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table solicitudes enable row level security;
alter table solicitud_lines enable row level security;

create policy "solicitudes_select" on solicitudes for select using (organization_id = auth_org_id());
create policy "solicitudes_insert" on solicitudes for insert with check (organization_id = auth_org_id() and requested_by = auth.uid());
create policy "solicitudes_update" on solicitudes for update using (organization_id = auth_org_id());

create policy "solicitud_lines_select" on solicitud_lines for select using (
  exists (select 1 from solicitudes where solicitudes.id = solicitud_lines.solicitud_id and solicitudes.organization_id = auth_org_id())
);
create policy "solicitud_lines_insert" on solicitud_lines for insert with check (
  exists (select 1 from solicitudes where solicitudes.id = solicitud_lines.solicitud_id and solicitudes.organization_id = auth_org_id())
);
