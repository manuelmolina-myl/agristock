-- 063_diesel_loads_rls_fix.sql — Completar UPDATE/DELETE RLS en diesel_loads
--
-- Auditoría AgriStock v2: la migración 060 dejó únicamente SELECT/INSERT en
-- `diesel_loads`. Sin políticas de UPDATE/DELETE, los admins no pueden corregir
-- folios mal cargados o eliminar entradas de prueba. Añadimos políticas que
-- restringen mutaciones a la organización del usuario autenticado.

drop policy if exists dl_update on public.diesel_loads;
create policy dl_update on public.diesel_loads
  for update to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

drop policy if exists dl_delete on public.diesel_loads;
create policy dl_delete on public.diesel_loads
  for delete to authenticated
  using (organization_id = public.auth_org_id());
