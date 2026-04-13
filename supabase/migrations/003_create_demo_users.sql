-- ============================================================================
-- AgriStock — Create Demo Auth Users
-- Run this in Supabase SQL Editor AFTER 001_schema.sql and 002_seed.sql
-- Creates 4 demo users with password: demo123
-- ============================================================================

-- Ensure pgcrypto is available
create extension if not exists pgcrypto;

-- Insert demo users directly into auth.users
-- The fn_handle_new_user trigger will auto-create their profiles

insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) values
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@agristock.mx',
    crypt('demo123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Ing. Ricardo Valenzuela", "role": "super_admin"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    ''
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'gerente@agristock.mx',
    crypt('demo123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Lic. Martha Coronel", "role": "gerente"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    ''
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'almacen@agristock.mx',
    crypt('demo123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "José Luis Martínez", "role": "almacenista"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    ''
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'supervisor@agristock.mx',
    crypt('demo123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"organization_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Francisco Javier Soto", "role": "supervisor"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    ''
  );

-- Also create their identities (required for email/password login)
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(),
  now(),
  now()
from auth.users u
where u.email in ('admin@agristock.mx', 'gerente@agristock.mx', 'almacen@agristock.mx', 'supervisor@agristock.mx');
