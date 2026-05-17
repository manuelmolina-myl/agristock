-- ============================================================================
-- 019_catalogs_failure_service.sql — Sprint 1 §4
-- New catalog tables required by upcoming sprints:
--   - failure_types: drives the failure_type_id FK on work_orders (Sprint 3 CMMS)
--   - service_types: drives the service_type_id FK on service_contracts
--                    (Sprint 5 — external services)
-- ============================================================================

-- ─── 1. failure_types ───────────────────────────────────────────────────────
create table if not exists public.failure_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code            text not null,
  label           text not null,
  severity        text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz,
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  unique (organization_id, code)
);

create index if not exists idx_failure_types_org
  on public.failure_types(organization_id)
  where deleted_at is null;

create index if not exists idx_failure_types_severity
  on public.failure_types(organization_id, severity)
  where deleted_at is null and is_active;

create trigger trg_failure_types_updated_at
  before update on public.failure_types
  for each row execute function public.fn_set_updated_at();

-- ─── 2. service_types ───────────────────────────────────────────────────────
create table if not exists public.service_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code            text not null,
  label           text not null,
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz,
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  unique (organization_id, code)
);

create index if not exists idx_service_types_org
  on public.service_types(organization_id)
  where deleted_at is null;

create trigger trg_service_types_updated_at
  before update on public.service_types
  for each row execute function public.fn_set_updated_at();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.failure_types enable row level security;
alter table public.service_types enable row level security;

-- failure_types: read for any org member, write for director_sg or coord_mantenimiento
drop policy if exists failure_types_select on public.failure_types;
create policy failure_types_select on public.failure_types
  for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists failure_types_insert on public.failure_types;
create policy failure_types_insert on public.failure_types
  for insert
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'director_sg')
      or public.has_role(auth.uid(), 'coordinador_mantenimiento')
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

drop policy if exists failure_types_update on public.failure_types;
create policy failure_types_update on public.failure_types
  for update
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'director_sg')
      or public.has_role(auth.uid(), 'coordinador_mantenimiento')
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

drop policy if exists failure_types_delete on public.failure_types;
create policy failure_types_delete on public.failure_types
  for delete
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'super_admin')
  );

-- service_types: read for any org member, write for director_sg or coord_compras
drop policy if exists service_types_select on public.service_types;
create policy service_types_select on public.service_types
  for select
  using (organization_id = public.auth_org_id() and deleted_at is null);

drop policy if exists service_types_insert on public.service_types;
create policy service_types_insert on public.service_types
  for insert
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'director_sg')
      or public.has_role(auth.uid(), 'coordinador_compras')
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

drop policy if exists service_types_update on public.service_types;
create policy service_types_update on public.service_types
  for update
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'director_sg')
      or public.has_role(auth.uid(), 'coordinador_compras')
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

drop policy if exists service_types_delete on public.service_types;
create policy service_types_delete on public.service_types
  for delete
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'super_admin')
  );

-- ─── 4. Audit triggers (reuse generic helper from 013) ──────────────────────
create or replace function public.audit_simple_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log (
    organization_id, user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when old is null then null else to_jsonb(old) end,
    case when new is null then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_failure_types on public.failure_types;
create trigger trg_audit_failure_types
  after insert or update or delete on public.failure_types
  for each row execute function public.audit_simple_catalog();

drop trigger if exists trg_audit_service_types on public.service_types;
create trigger trg_audit_service_types
  after insert or update or delete on public.service_types
  for each row execute function public.audit_simple_catalog();

-- ─── 5. Seed minimal defaults for existing organizations ────────────────────
-- Common Mexican agricultural-ops failure types (severity is a hint, ops can change).
insert into public.failure_types (organization_id, code, label, severity, description)
select
  o.id,
  fc.code,
  fc.label,
  fc.severity,
  fc.description
from public.organizations o
cross join (values
  ('falla_motor',          'Falla de motor',            'critical', 'Motor del equipo no enciende o se detiene en operación'),
  ('falla_hidraulica',     'Falla hidráulica',          'high',     'Fugas o pérdida de presión en sistema hidráulico'),
  ('falla_electrica',      'Falla eléctrica',           'high',     'Cortocircuito, falla de batería, alternador, luces'),
  ('falla_transmision',    'Falla de transmisión',      'high',     'Caja de cambios, embrague, tracción'),
  ('falla_rodamiento',     'Falla de rodamiento',       'medium',   'Llantas, ejes, suspensión'),
  ('falla_neumatica',      'Falla neumática',           'medium',     'Compresor, presión de aire, neumáticos'),
  ('desgaste_normal',      'Desgaste normal',           'low',      'Componente por reemplazo programado'),
  ('mantenimiento_rutina', 'Mantenimiento de rutina',   'low',      'Cambio de aceite, filtros, etc.'),
  ('otro',                 'Otro',                      'medium',   'Falla no clasificada — describir en notas')
) as fc(code, label, severity, description)
on conflict (organization_id, code) do nothing;

-- Common service types (Mexican B2B context).
insert into public.service_types (organization_id, code, label, description)
select
  o.id,
  st.code,
  st.label,
  st.description
from public.organizations o
cross join (values
  ('limpieza',         'Limpieza',         'Limpieza de oficinas, almacenes, áreas comunes'),
  ('jardineria',       'Jardinería',       'Mantenimiento de áreas verdes, poda, riego'),
  ('seguridad',        'Seguridad privada','Vigilancia, control de acceso'),
  ('fumigacion',       'Fumigación',       'Control de plagas en instalaciones, no aplica a cultivos'),
  ('transporte',       'Transporte',       'Fletes y transporte tercerizado'),
  ('capacitacion',     'Capacitación',     'Cursos, talleres internos o externos'),
  ('mantenimiento_inst','Mantenimiento de instalaciones','Plomería, electricidad, herrería'),
  ('consultoria',      'Consultoría',      'Asesoría legal, contable, técnica, agronómica')
) as st(code, label, description)
on conflict (organization_id, code) do nothing;
