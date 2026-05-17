-- ============================================================================
-- 013_user_roles_table.sql — Sprint 0 §1.1
-- Migrate profiles.role (single text) → user_roles (N:M with enum)
-- ============================================================================
-- Strategy:
--   1. Create user_role enum (9 values, future-ready).
--   2. Create user_roles table with RLS.
--   3. Backfill from profiles.role with corrected mapping (gerente→director_sg,
--      supervisor→coordinador_compras+coordinador_mantenimiento, etc.).
--   4. Add has_role() and current_user_roles() helpers.
--   5. Re-point auth_role() to user_roles (returning legacy string) so existing
--      RLS policies in 001_schema.sql keep working without rewrite.
--   6. profiles.role stays for now (deprecated); dropped at end of Sprint 0.
-- ============================================================================

-- ─── 1. Enum ────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum (
    'super_admin',
    'director_sg',
    'coordinador_compras',
    'coordinador_mantenimiento',
    'almacenista',
    'tecnico',
    'operador',
    'solicitante',
    'auditor'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Table ───────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique(organization_id, user_id, role)
);

create index if not exists idx_user_roles_user_active
  on public.user_roles(user_id, role)
  where revoked_at is null;

create index if not exists idx_user_roles_org
  on public.user_roles(organization_id)
  where revoked_at is null;

alter table public.user_roles enable row level security;

-- ─── 3. Backfill from profiles.role ─────────────────────────────────────────
-- Mapping (informed by current repo state and memory):
--   super_admin  → super_admin + director_sg  (current super_admin is org-level admin)
--   gerente      → director_sg
--   supervisor   → coordinador_compras + coordinador_mantenimiento  (N:M lets us grant both)
--   almacenista  → almacenista
insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, 'super_admin'::user_role
  from public.profiles where role = 'super_admin'
on conflict do nothing;

insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, 'director_sg'::user_role
  from public.profiles where role in ('super_admin', 'gerente')
on conflict do nothing;

insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, 'coordinador_compras'::user_role
  from public.profiles where role = 'supervisor'
on conflict do nothing;

insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, 'coordinador_mantenimiento'::user_role
  from public.profiles where role = 'supervisor'
on conflict do nothing;

insert into public.user_roles (organization_id, user_id, role)
select organization_id, id, 'almacenista'::user_role
  from public.profiles where role = 'almacenista'
on conflict do nothing;

-- ─── 4. New helpers ─────────────────────────────────────────────────────────
create or replace function public.has_role(p_user_id uuid, p_role user_role)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id
      and role = p_role
      and revoked_at is null
  );
$$;

revoke all on function public.has_role(uuid, user_role) from public;
grant execute on function public.has_role(uuid, user_role) to authenticated;

create or replace function public.current_user_roles()
returns setof user_role
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select role from public.user_roles
  where user_id = auth.uid() and revoked_at is null
  order by case role
    when 'super_admin'::user_role then 1
    when 'director_sg'::user_role then 2
    when 'coordinador_compras'::user_role then 3
    when 'coordinador_mantenimiento'::user_role then 4
    when 'auditor'::user_role then 5
    when 'almacenista'::user_role then 6
    when 'tecnico'::user_role then 7
    when 'operador'::user_role then 8
    when 'solicitante'::user_role then 9
  end;
$$;

revoke all on function public.current_user_roles() from public;
grant execute on function public.current_user_roles() to authenticated;

-- ─── 5. Re-point auth_role() to user_roles (legacy-compat layer) ────────────
-- Existing RLS policies in 001_schema.sql call auth_role() and compare to
-- ('super_admin', 'gerente', 'almacenista', 'supervisor'). To keep them
-- working without touching every policy, auth_role() now returns the HIGHEST
-- legacy string the user qualifies for, derived from user_roles.
create or replace function public.auth_role()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case role
    when 'super_admin'::user_role             then 'super_admin'
    when 'director_sg'::user_role             then 'gerente'
    when 'coordinador_compras'::user_role     then 'supervisor'
    when 'coordinador_mantenimiento'::user_role then 'supervisor'
    when 'almacenista'::user_role             then 'almacenista'
    when 'tecnico'::user_role                 then 'almacenista'
    when 'operador'::user_role                then 'almacenista'
    when 'auditor'::user_role                 then 'gerente'
    when 'solicitante'::user_role             then 'almacenista'
  end
  from public.user_roles
  where user_id = auth.uid() and revoked_at is null
  order by case role
    when 'super_admin'::user_role             then 1
    when 'director_sg'::user_role             then 2
    when 'coordinador_compras'::user_role     then 3
    when 'coordinador_mantenimiento'::user_role then 4
    when 'auditor'::user_role                 then 5
    when 'almacenista'::user_role             then 6
    when 'tecnico'::user_role                 then 7
    when 'operador'::user_role                then 8
    when 'solicitante'::user_role             then 9
  end
  limit 1;
$$;

-- ─── 6. RLS policies on user_roles ──────────────────────────────────────────
-- Everyone authenticated in the org can read role assignments (needed by
-- frontend to render UIs). Only directors / super_admin can mutate.
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select
  using (organization_id = public.auth_org_id());

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert
  with check (
    organization_id = public.auth_org_id()
    and (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'director_sg'))
  );

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update
  using (
    organization_id = public.auth_org_id()
    and (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'director_sg'))
  );

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'super_admin')
  );

-- ─── 7. Mark profiles.role as deprecated ────────────────────────────────────
comment on column public.profiles.role is
  'DEPRECATED — use user_roles + has_role()/current_user_roles(). '
  'Kept temporarily for backwards compatibility; will be dropped at end of Sprint 0.';

-- ─── 8. Audit trigger on user_roles (insert + update only; no deletes here) ─
-- audit_log already exists from 001_schema.sql; we reuse its pattern.
-- Use a lightweight inline trigger that snapshots the change.
create or replace function public.audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log (
    organization_id, user_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    tg_op,
    'user_roles',
    coalesce(new.id, old.id),
    case when old is null then null else to_jsonb(old) end,
    case when new is null then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_user_roles on public.user_roles;
create trigger trg_audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_user_roles();
