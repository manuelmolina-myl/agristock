-- ============================================================================
-- Fix: Ensure profiles exist for all demo users
-- Run if "Database error querying schema" appears on login
-- ============================================================================

-- Insert profiles for any auth users that are missing them
insert into profiles (id, organization_id, full_name, role)
select
  u.id,
  (u.raw_user_meta_data->>'organization_id')::uuid,
  coalesce(u.raw_user_meta_data->>'full_name', u.email),
  coalesce(u.raw_user_meta_data->>'role', 'almacenista')
from auth.users u
where u.email in ('admin@agristock.mx', 'gerente@agristock.mx', 'almacen@agristock.mx', 'supervisor@agristock.mx')
  and not exists (select 1 from profiles p where p.id = u.id);
