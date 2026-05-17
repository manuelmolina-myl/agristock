-- ============================================================================
-- 048_consolidate_org_policies.sql
--
-- La tabla organizations tiene 5 policies acumuladas que se contradicen
-- y una de ellas (la que agregué en migración 046) tiene un bug: el
-- subquery comparaba ur.organization_id = ur.id en vez de = id (org id),
-- comparación que es siempre falsa.
--
-- Consolidación:
--   - 1 sola policy SELECT (id = auth_org_id())
--   - 1 sola policy UPDATE que acepta admin via user_roles
--
-- Limpia las redundantes/rotas:
--   * "Admins can update their organization"  (legacy — profiles.role-based)
--   * "Gerente can view organization"         (no longer needed; org_select cubre)
--   * "Org admins can update their organization" (la mía rota)
--   * "org_update"                            (super_admin-only legacy)
--   * "org_select"                            (la mantenemos)
-- ============================================================================

-- Drop legacy / broken
drop policy if exists "Admins can update their organization"      on public.organizations;
drop policy if exists "Gerente can view organization"             on public.organizations;
drop policy if exists "Org admins can update their organization"  on public.organizations;
drop policy if exists org_update                                  on public.organizations;
drop policy if exists "Users can view their organization"         on public.organizations;
drop policy if exists "Super admins can update their organization" on public.organizations;

-- Re-create the SELECT policy (in case it was somehow dropped earlier).
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select to authenticated
  using (id = public.auth_org_id());

-- The single UPDATE policy: admin del tenant.
-- Validates against user_roles (not profiles.role) because user_roles is the
-- canonical source of truth post-migración 024.  Allows both 'admin' and
-- 'super_admin' role names.
create policy org_update on public.organizations
  for update to authenticated
  using (
    id = public.auth_org_id()
    and exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.organization_id = public.organizations.id   -- NOTA: org.id, no ur.id
         and ur.revoked_at is null
         and ur.role::text in ('admin', 'super_admin')
    )
  )
  with check (
    id = public.auth_org_id()
    and exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.organization_id = public.organizations.id
         and ur.revoked_at is null
         and ur.role::text in ('admin', 'super_admin')
    )
  );

-- Verify outcome.
do $$
declare
  v_row record;
begin
  raise notice '─── POLICIES en public.organizations después de cleanup ───';
  for v_row in
    select polname, polcmd
      from pg_policy
      join pg_class on pg_class.oid = pg_policy.polrelid
     where pg_class.relname = 'organizations'
     order by polname
  loop
    raise notice '  policy %: cmd=%', v_row.polname, v_row.polcmd;
  end loop;
end $$;

notify pgrst, 'reload schema';
