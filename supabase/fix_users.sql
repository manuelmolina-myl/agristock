-- ============================================================================
-- Fix: Delete broken auth users and recreate them properly
-- ============================================================================

-- 1. Clean up broken users
delete from profiles where id in (
  select id from auth.users where email like '%@agristock.mx'
);
delete from auth.identities where user_id in (
  select id from auth.users where email like '%@agristock.mx'
);
delete from auth.users where email like '%@agristock.mx';

-- 2. Check auth.users columns to understand what's needed
-- (This SELECT will show you the structure — useful for debugging)
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'auth' and table_name = 'users'
-- order by ordinal_position;

-- 3. Insert users with ALL required columns for modern Supabase
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at,
  is_anonymous
) values
(
  'aa000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@agristock.mx',
  crypt('demo123', gen_salt('bf')),
  now(), null, '', null, '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Ing. Ricardo Valenzuela","role":"super_admin"}',
  false, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
),
(
  'aa000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'gerente@agristock.mx',
  crypt('demo123', gen_salt('bf')),
  now(), null, '', null, '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Lic. Martha Coronel","role":"gerente"}',
  false, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
),
(
  'aa000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'almacen@agristock.mx',
  crypt('demo123', gen_salt('bf')),
  now(), null, '', null, '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"José Luis Martínez","role":"almacenista"}',
  false, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
),
(
  'aa000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'supervisor@agristock.mx',
  crypt('demo123', gen_salt('bf')),
  now(), null, '', null, '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Francisco Javier Soto","role":"supervisor"}',
  false, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
);

-- 4. Create identities
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values
  ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', '{"sub":"aa000000-0000-0000-0000-000000000001","email":"admin@agristock.mx","email_verified":false,"phone_verified":false}', 'email', 'aa000000-0000-0000-0000-000000000001', now(), now(), now()),
  ('aa000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', '{"sub":"aa000000-0000-0000-0000-000000000002","email":"gerente@agristock.mx","email_verified":false,"phone_verified":false}', 'email', 'aa000000-0000-0000-0000-000000000002', now(), now(), now()),
  ('aa000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', '{"sub":"aa000000-0000-0000-0000-000000000003","email":"almacen@agristock.mx","email_verified":false,"phone_verified":false}', 'email', 'aa000000-0000-0000-0000-000000000003', now(), now(), now()),
  ('aa000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000004', '{"sub":"aa000000-0000-0000-0000-000000000004","email":"supervisor@agristock.mx","email_verified":false,"phone_verified":false}', 'email', 'aa000000-0000-0000-0000-000000000004', now(), now(), now());

-- 5. Create profiles (in case trigger didn't fire)
insert into profiles (id, organization_id, full_name, role) values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Ing. Ricardo Valenzuela', 'super_admin'),
  ('aa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Lic. Martha Coronel', 'gerente'),
  ('aa000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'José Luis Martínez', 'almacenista'),
  ('aa000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Francisco Javier Soto', 'supervisor')
on conflict (id) do nothing;

-- 6. Verify
select u.email, p.full_name, p.role, p.organization_id
from auth.users u
join profiles p on p.id = u.id
where u.email like '%@agristock.mx';
