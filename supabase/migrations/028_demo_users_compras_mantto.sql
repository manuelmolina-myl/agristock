-- ============================================================================
-- 028_demo_users_compras_mantto.sql
--
-- Creates two demo users that match the new 4-role model:
--   compras@agristock.mx       → rol `compras`
--   mantenimiento@agristock.mx → rol `mantenimiento`
--
-- Password for both: demo123 (matches the convention from 003).
-- Idempotent: skips insert if the email already exists.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── 1. compras user ────────────────────────────────────────────────────────
do $$
declare
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';
  v_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'compras@agristock.mx') then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role, created_at, updated_at,
      confirmation_token, recovery_token
    ) values (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'compras@agristock.mx',
      extensions.crypt('demo123', extensions.gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object(
        'organization_id', v_org,
        'full_name', 'Daniela Pérez Compras',
        'role', 'compras'
      ),
      'authenticated', 'authenticated',
      now(), now(), '', ''
    );

    -- Insert identity row so Supabase Auth treats this as a real email login.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at,
      created_at, updated_at
    ) values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'compras@agristock.mx', 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict do nothing;

    -- The fn_handle_new_user trigger (migration 010) created the profile row
    -- with role='compras'; trigger 018 wrote the matching user_roles entry.
    -- Belt-and-suspenders: guarantee both exist regardless of trigger timing.
    insert into public.profiles (id, organization_id, full_name, role)
    values (v_uid, v_org, 'Daniela Pérez Compras', 'compras')
    on conflict (id) do update set role = 'compras', organization_id = v_org;

    insert into public.user_roles (organization_id, user_id, role)
    values (v_org, v_uid, 'compras'::user_role)
    on conflict (organization_id, user_id, role) do update set revoked_at = null;
  end if;
end $$;

-- ─── 2. mantenimiento user ──────────────────────────────────────────────────
do $$
declare
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';
  v_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'mantenimiento@agristock.mx') then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role, created_at, updated_at,
      confirmation_token, recovery_token
    ) values (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'mantenimiento@agristock.mx',
      extensions.crypt('demo123', extensions.gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object(
        'organization_id', v_org,
        'full_name', 'Roberto Hernández Mantto',
        'role', 'mantenimiento'
      ),
      'authenticated', 'authenticated',
      now(), now(), '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at,
      created_at, updated_at
    ) values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'mantenimiento@agristock.mx', 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict do nothing;

    insert into public.profiles (id, organization_id, full_name, role)
    values (v_uid, v_org, 'Roberto Hernández Mantto', 'mantenimiento')
    on conflict (id) do update set role = 'mantenimiento', organization_id = v_org;

    insert into public.user_roles (organization_id, user_id, role)
    values (v_org, v_uid, 'mantenimiento'::user_role)
    on conflict (organization_id, user_id, role) do update set revoked_at = null;
  end if;
end $$;
