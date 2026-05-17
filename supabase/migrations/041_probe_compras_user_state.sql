-- ============================================================================
-- 041_probe_compras_user_state.sql
--
-- Diagnostic migration: imprime el estado de cada profile + sus user_roles
-- vía RAISE NOTICE para encontrar por qué can_write_purchase devuelve false
-- para el usuario compras. NO modifica datos.
-- ============================================================================

do $$
declare
  v_row record;
begin
  raise notice '─── PROFILES ───';
  for v_row in
    select u.email, p.id, p.organization_id, p.role
      from public.profiles p
      join auth.users u on u.id = p.id
     order by u.email
  loop
    raise notice 'profile: email=% id=% org=% role=%',
      v_row.email, v_row.id, v_row.organization_id, v_row.role;
  end loop;

  raise notice '─── USER_ROLES ───';
  for v_row in
    select u.email, ur.user_id, ur.organization_id, ur.role::text as role,
           ur.revoked_at, ur.granted_at
      from public.user_roles ur
      join auth.users u on u.id = ur.user_id
     order by u.email, ur.role
  loop
    raise notice 'user_role: email=% org=% role=% revoked_at=%',
      v_row.email, v_row.organization_id, v_row.role, v_row.revoked_at;
  end loop;

  raise notice '─── CAN_WRITE_PURCHASE per user ───';
  for v_row in
    select u.email, u.id, public.can_write_purchase(u.id) as can
      from auth.users u
     order by u.email
  loop
    raise notice 'can_write_purchase(%): %', v_row.email, v_row.can;
  end loop;
end $$;
