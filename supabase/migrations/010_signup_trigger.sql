-- ============================================================================
-- Migration 010: Self-service signup trigger + onboarding flag
-- ============================================================================

-- 1. Add onboarding_completed flag to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Mark all existing orgs as already onboarded
UPDATE organizations SET onboarding_completed = true;

-- 2. Function that runs after a new auth.users row is inserted.
--    - New self-service signup: metadata contains org_name → create org + admin profile
--    - Invited user: metadata contains organization_id → create profile only
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_org_id        uuid;
  v_existing_org  uuid;
  v_org_name      text;
  v_full_name     text;
  v_role          text;
BEGIN
  -- Pull metadata set by the frontend on signUp / inviteUserByEmail
  v_org_name     := NEW.raw_user_meta_data->>'org_name';
  v_full_name    := COALESCE(
                     NEW.raw_user_meta_data->>'full_name',
                     split_part(NEW.email, '@', 1)
                   );
  v_existing_org := (NEW.raw_user_meta_data->>'organization_id')::uuid;
  v_role         := COALESCE(NEW.raw_user_meta_data->>'role', 'almacenista');

  IF v_existing_org IS NOT NULL THEN
    -- ── Invited user: attach to existing org ───────────────────────────
    INSERT INTO profiles (id, organization_id, full_name, role)
    VALUES (NEW.id, v_existing_org, v_full_name, v_role)
    ON CONFLICT (id) DO NOTHING;

  ELSIF v_org_name IS NOT NULL THEN
    -- ── New self-service signup: create org + admin profile ────────────
    INSERT INTO organizations (name, base_currency, timezone, onboarding_completed)
    VALUES (v_org_name, 'MXN', 'America/Mexico_City', false)
    RETURNING id INTO v_org_id;

    INSERT INTO profiles (id, organization_id, full_name, role)
    VALUES (NEW.id, v_org_id, v_full_name, 'admin');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_handle_new_user();

-- 4. Grant necessary permissions (SECURITY DEFINER handles the rest)
GRANT EXECUTE ON FUNCTION fn_handle_new_user() TO postgres;
