-- ============================================================================
-- Fix RLS: Add policy allowing users to read their own profile
-- This breaks the circular dependency where auth_org_id() queries profiles
-- but profiles RLS requires auth_org_id()
-- ============================================================================

-- Allow users to always read their own profile row
create policy "Users can view own profile"
  on profiles for select
  using (id = auth.uid());

-- Also allow users to read their own organization directly
create policy "Users can view own organization"
  on organizations for select
  using (id in (select organization_id from profiles where id = auth.uid()));

-- Verify: check if demo profiles exist
-- (Run this SELECT separately to debug if still failing)
-- select u.email, p.id as profile_id, p.role, p.organization_id
-- from auth.users u
-- left join profiles p on p.id = u.id
-- where u.email like '%agristock.mx';
