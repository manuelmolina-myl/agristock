-- ============================================================================
-- 029_fix_demo_users_identities.sql
--
-- Migration 028 inserted custom rows into auth.identities that confuse
-- Supabase's auth flow ("Database error querying schema").  Wipe those rows
-- and let Supabase's internal trigger recreate them on next login attempt.
-- For safety, we also delete and recreate the user rows themselves following
-- the EXACT pattern of migration 003 (which is known to work).
-- ============================================================================

-- 1. Remove the broken rows.
delete from auth.identities
 where user_id in (
   select id from auth.users where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
 );

delete from public.user_roles
 where user_id in (
   select id from auth.users where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
 );

delete from public.profiles
 where id in (
   select id from auth.users where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
 );

delete from auth.users
 where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx');

-- 2. Re-create them using the same pattern as migration 003 (just auth.users;
--    Supabase auto-creates identities + the fn_handle_new_user trigger fills
--    profiles + trigger 018 fills user_roles).
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at,
  confirmation_token, recovery_token
) values
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'compras@agristock.mx',
    extensions.crypt('demo123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Daniela Pérez Compras", "role": "compras"}',
    'authenticated', 'authenticated', now(), now(), '', ''
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'mantenimiento@agristock.mx',
    extensions.crypt('demo123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Roberto Hernández Mantto", "role": "mantenimiento"}',
    'authenticated', 'authenticated', now(), now(), '', ''
  );

-- 3. Create the auth.identities rows in the format Supabase expects.
-- The provider must be 'email' and provider_id should equal user_id (uuid).
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where u.email in ('compras@agristock.mx', 'mantenimiento@agristock.mx');

-- 4. Make sure profiles + user_roles are wired. The fn_handle_new_user trigger
-- fires on INSERT into auth.users and should have populated profiles. Trigger
-- 018 then writes user_roles. Backfill explicitly in case timing is off.
insert into public.profiles (id, organization_id, full_name, role)
select u.id, 'a0000000-0000-0000-0000-000000000001',
       u.raw_user_meta_data->>'full_name',
       u.raw_user_meta_data->>'role'
  from auth.users u
 where u.email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
on conflict (id) do update
  set role = excluded.role, full_name = excluded.full_name;

insert into public.user_roles (organization_id, user_id, role)
select 'a0000000-0000-0000-0000-000000000001'::uuid, u.id, (u.raw_user_meta_data->>'role')::user_role
  from auth.users u
 where u.email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
on conflict (organization_id, user_id, role) do update set revoked_at = null;
