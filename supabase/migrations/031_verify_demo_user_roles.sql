-- ============================================================================
-- 031_verify_demo_user_roles.sql
--
-- The RLS check on `requisition_lines` calls `can_write_purchase(auth.uid())`,
-- which reads `user_roles`.  The demo users compras@/mantenimiento@ were
-- created via migration 029 with an upsert that updates only role/full_name
-- on conflict — and the sync trigger `trg_sync_profile_role_update` REVOKES
-- existing user_roles before re-inserting with ON CONFLICT DO NOTHING, leaving
-- the row revoked instead of active.
--
-- This migration force-activates a single active user_roles row per demo user.
-- ============================================================================

-- Belt and suspenders: ensure profile org + role are correct for both demos.
update public.profiles p
   set organization_id = 'a0000000-0000-0000-0000-000000000001',
       role = case
         when u.email = 'compras@agristock.mx' then 'compras'
         when u.email = 'mantenimiento@agristock.mx' then 'mantenimiento'
       end
  from auth.users u
 where u.id = p.id
   and u.email in ('compras@agristock.mx', 'mantenimiento@agristock.mx');

-- Revoke any straggler rows from earlier botched migrations and grant the
-- correct one cleanly.
do $$
declare
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';
  v_uid uuid;
  v_role user_role;
  v_email text;
begin
  for v_email, v_uid, v_role in
    select u.email, u.id, (u.raw_user_meta_data->>'role')::user_role
      from auth.users u
     where u.email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
  loop
    -- Revoke everything currently active for this user.
    update public.user_roles
       set revoked_at = now()
     where user_id = v_uid and revoked_at is null;

    -- Force-activate the desired role: either insert fresh or un-revoke
    -- whatever row exists for (org, user, role).
    insert into public.user_roles (organization_id, user_id, role)
    values (v_org, v_uid, v_role)
    on conflict (organization_id, user_id, role) do update
       set revoked_at = null, revoked_by = null;
  end loop;
end $$;
