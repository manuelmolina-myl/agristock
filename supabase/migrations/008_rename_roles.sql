-- ============================================================================
-- Migration 008: Rename roles
-- super_admin + gerente → admin (org-level admin)
-- super_admin is reserved for future platform-wide admin
-- ============================================================================

-- 1. Migrate existing data first (must happen before constraint change)
UPDATE profiles
  SET role = 'admin'
  WHERE role IN ('super_admin', 'gerente');

-- 2. Update check constraint on profiles.role
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'almacenista', 'supervisor'));

-- 3. Drop and recreate RLS policies that referenced 'super_admin' or 'gerente'

-- Organizations
DROP POLICY IF EXISTS "Super admins can update their organization" ON organizations;
CREATE POLICY "Admins can update their organization"
  ON organizations FOR UPDATE
  USING (id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Profiles
DROP POLICY IF EXISTS "Super admins can manage all profiles in their org" ON profiles;
CREATE POLICY "Admins can manage all profiles in their org"
  ON profiles FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Seasons
DROP POLICY IF EXISTS "Super admins can manage seasons" ON seasons;
CREATE POLICY "Admins can manage seasons"
  ON seasons FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Warehouses
DROP POLICY IF EXISTS "Admins can manage warehouses" ON warehouses;
CREATE POLICY "Admins can manage warehouses"
  ON warehouses FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Categories
DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Units
DROP POLICY IF EXISTS "Admins can manage units" ON units;
CREATE POLICY "Admins can manage units"
  ON units FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Suppliers
DROP POLICY IF EXISTS "Admins can manage suppliers" ON suppliers;
CREATE POLICY "Admins can manage suppliers"
  ON suppliers FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin', 'almacenista'));

-- Crop lots
DROP POLICY IF EXISTS "Admins can manage crop lots" ON crops_lots;
CREATE POLICY "Admins can manage crop lots"
  ON crops_lots FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Equipment
DROP POLICY IF EXISTS "Admins can manage equipment" ON equipment;
CREATE POLICY "Admins can manage equipment"
  ON equipment FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Employees
DROP POLICY IF EXISTS "Admins can manage employees" ON employees;
CREATE POLICY "Admins can manage employees"
  ON employees FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Items
DROP POLICY IF EXISTS "Admins and almacenistas can manage items" ON items;
CREATE POLICY "Admins and almacenistas can manage items"
  ON items FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin', 'almacenista'));

-- FX Rates
DROP POLICY IF EXISTS "Admins can manage fx rates" ON fx_rates;
CREATE POLICY "Admins can manage fx rates"
  ON fx_rates FOR ALL
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Audit log
DROP POLICY IF EXISTS "Admins can view audit log" ON audit_log;
CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));

-- Season closures
DROP POLICY IF EXISTS "Admins can view season closures" ON season_closures;
DROP POLICY IF EXISTS "Super admins can create season closures" ON season_closures;
CREATE POLICY "Admins can view season closures"
  ON season_closures FOR SELECT
  USING (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));
CREATE POLICY "Admins can create season closures"
  ON season_closures FOR INSERT
  WITH CHECK (organization_id = auth_org_id() AND auth_role() IN ('super_admin', 'admin'));
