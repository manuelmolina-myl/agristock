-- ============================================================================
-- Migration 012: Restore 'gerente' as a distinct role
-- Gerente = read-only manager: can view reports and approve solicitudes,
-- but cannot manage catalog, config, or perform admin actions.
-- ============================================================================

-- 1. Drop the current constraint that excludes 'gerente'
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Re-add with gerente included
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'gerente', 'almacenista', 'supervisor'));

-- 3. Update RLS helper functions to recognize gerente
-- (gerente gets read-only access to their org's data, same as admin for SELECT)

-- Allow gerente to read org data
DROP POLICY IF EXISTS "Gerente can view organization" ON organizations;
CREATE POLICY "Gerente can view organization"
  ON organizations FOR SELECT
  USING (id = auth_org_id() AND auth_role() = 'gerente');

-- Allow gerente to read all profiles in org
DROP POLICY IF EXISTS "Gerente can view org profiles" ON profiles;
CREATE POLICY "Gerente can view org profiles"
  ON profiles FOR SELECT
  USING (organization_id = auth_org_id() AND auth_role() = 'gerente');

-- Allow gerente to read seasons
DROP POLICY IF EXISTS "Gerente can view seasons" ON seasons;
CREATE POLICY "Gerente can view seasons"
  ON seasons FOR SELECT
  USING (organization_id = auth_org_id() AND auth_role() = 'gerente');
