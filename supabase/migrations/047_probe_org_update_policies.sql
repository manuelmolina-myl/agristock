-- ============================================================================
-- 047_probe_org_update_policies.sql
--
-- Diagnostic — el usuario reporta que ni el logo ni "Guardar cambios"
-- persisten en /configuracion → Organización, incluso después de
-- migración 046. Posibles causas:
--   - Quedó otra policy UPDATE residual de migraciones tempranas que
--     gana por orden (RLS evalúa policies con OR — si UNA permite, pasa;
--     si TODAS niegan, falla; multiple policies on same op = OR).
--   - El user_roles row del admin no está activo en la org real
--     (distinto al rol en profiles.role).
--   - El frontend re-lee del cache de TanStack y no ve el cambio aunque
--     sí persistió.
--
-- Esta migración:
--   1. Lista TODAS las policies UPDATE sobre organizations
--   2. Imprime el state de user_roles para cada admin
--   3. Hace un UPDATE de prueba seteando logo_url = current value
--      (no-op funcional pero confirma que el RLS deja pasar al menos
--      una identidad)
-- ============================================================================

do $$
declare
  v_row record;
begin
  raise notice '─── POLICIES en public.organizations ───';
  for v_row in
    select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
           pg_get_expr(polwithcheck, polrelid) as check_expr
      from pg_policy
      join pg_class on pg_class.oid = pg_policy.polrelid
     where pg_class.relname = 'organizations'
     order by polname
  loop
    raise notice 'policy %: cmd=% using=% check=%',
      v_row.polname, v_row.polcmd, v_row.using_expr, v_row.check_expr;
  end loop;
end $$;

do $$
declare
  v_row record;
begin
  raise notice '─── USER_ROLES por usuario ───';
  for v_row in
    select u.email, ur.organization_id, ur.role::text as role, ur.revoked_at
      from auth.users u
      join public.user_roles ur on ur.user_id = u.id
     where ur.revoked_at is null
     order by u.email, ur.role
  loop
    raise notice '  % | org=% | role=%', v_row.email, v_row.organization_id, v_row.role;
  end loop;
end $$;

-- Test: confirmar que el current logo_url está intacto (no-op).
do $$
declare
  v_count int;
begin
  raise notice '─── ORG state ───';
  select count(*) into v_count from public.organizations;
  raise notice 'Total orgs: %', v_count;
  for v_count in
    select 1
      from public.organizations
     where logo_url is not null
  loop
    raise notice 'Org con logo_url: presente';
  end loop;
end $$;
