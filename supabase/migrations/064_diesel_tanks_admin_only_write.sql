-- 064_diesel_tanks_admin_only_write.sql
--
-- Restringe INSERT / UPDATE / DELETE en diesel_tanks al rol "admin".
-- Antes: dt_write era `for all to authenticated` con sólo check de
-- organization_id → cualquier usuario autenticado de la org (almacenista,
-- compras, mantenimiento) podía crear/modificar/borrar tanques vía la API
-- de Supabase aunque la UI no expusiera el botón.
--
-- Política de negocio: "Crear y eliminar tanques es exclusivo del
-- administrador." El SELECT permanece abierto para todos los roles de la
-- org (los almacenistas necesitan ver los tanques al cargar combustible).

begin;

-- ─── 1. Política de SELECT (sin cambios) ────────────────────────────────
-- Reescribimos por idempotencia.
drop policy if exists dt_select on public.diesel_tanks;
create policy dt_select on public.diesel_tanks
  for select to authenticated
  using (organization_id = public.auth_org_id());

-- ─── 2. INSERT — sólo admin de la misma org ─────────────────────────────
drop policy if exists dt_write on public.diesel_tanks;
drop policy if exists dt_insert on public.diesel_tanks;
create policy dt_insert on public.diesel_tanks
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin')
  );

-- ─── 3. UPDATE — sólo admin (cubre archivar, editar, etc.) ──────────────
drop policy if exists dt_update on public.diesel_tanks;
create policy dt_update on public.diesel_tanks
  for update to authenticated
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin')
  )
  with check (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin')
  );

-- ─── 4. DELETE — sólo admin ─────────────────────────────────────────────
drop policy if exists dt_delete on public.diesel_tanks;
create policy dt_delete on public.diesel_tanks
  for delete to authenticated
  using (
    organization_id = public.auth_org_id()
    and public.has_role(auth.uid(), 'admin')
  );

-- ─── Nota ───────────────────────────────────────────────────────────────
-- Los triggers SECURITY DEFINER (fn_diesel_tank_dispense, register_diesel_load,
-- adjust_diesel_tank) siguen operando con privilegios elevados, así que
-- almacenistas pueden seguir cargando y dispensando sin tocar diesel_tanks
-- directamente.

commit;
