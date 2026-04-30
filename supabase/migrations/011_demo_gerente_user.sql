-- ============================================================================
-- Migration 011: Ensure gerente demo user exists
-- Adds gerente@agristock.mx to the demo org with role='gerente'
-- ============================================================================

-- Only insert if not already present
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
  recovery_token, recovery_sent_at, email_change_token_new, email_change,
  email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
  phone_change, phone_change_token, phone_change_sent_at,
  email_change_token_current, email_change_confirm_status, banned_until,
  reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
) VALUES (
  'aa000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'gerente@agristock.mx',
  crypt('demo123', gen_salt('bf')),
  now(), null, '', null, '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"organization_id":"a0000000-0000-0000-0000-000000000001","full_name":"Lic. Martha Coronel","role":"gerente"}',
  false, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
)
ON CONFLICT (id) DO NOTHING;

-- Identity
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'aa000000-0000-0000-0000-000000000005',
  'aa000000-0000-0000-0000-000000000005',
  '{"sub":"aa000000-0000-0000-0000-000000000005","email":"gerente@agristock.mx","email_verified":false,"phone_verified":false}',
  'email', 'aa000000-0000-0000-0000-000000000005', now(), now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Profile
INSERT INTO profiles (id, organization_id, full_name, role)
VALUES (
  'aa000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Lic. Martha Coronel',
  'gerente'
)
ON CONFLICT (id) DO NOTHING;
