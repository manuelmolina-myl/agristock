-- 065_suppliers_items_rls_consistency.sql
--
-- Alinea las policies RLS de `suppliers` e `items` con los gates que ya
-- aplica la UI y elimina el uso del helper frágil `auth_role()` (que cae
-- a 'almacenista' por defecto si user_roles está vacío). Reemplazamos por
-- `has_role(auth.uid(), 'admin')` que devuelve estrictamente true/false.
--
-- Bugs corregidos:
--
--   1. `suppliers` — la policy "Admins can manage suppliers" (mig. 008)
--      permitía escritura sólo a admin + almacenista. Pero la UI en
--      /compras/proveedores está gateada a admin + compras (claim
--      `purchase.create`). Resultado: usuarios `compras` veían los
--      botones de "Nuevo proveedor" pero al guardar recibían 42501.
--      Además, almacenista no debería gestionar registros de proveedores
--      (ese rol pertenece a Compras / Admin).
--      Fix: writes restringidos a admin OR compras.
--
--   2. `items` — la policy "Admins and almacenistas can manage items"
--      (mig. 008) funcionalmente apunta a admin + almacenista, pero vía
--      `auth_role()`. Lo reescribimos con `has_role()` para robustez.
--      Sin cambio de rol efectivo.

begin;

-- ─── 1. suppliers ───────────────────────────────────────────────────────
-- SELECT permanece abierto a toda la org (policy "Users can view suppliers"
-- creada en 001 sigue vigente). Sólo redefinimos la policy de escritura.

drop policy if exists "Admins can manage suppliers" on public.suppliers;
drop policy if exists suppliers_write on public.suppliers;

create policy suppliers_write on public.suppliers
  for all to authenticated
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'compras'::user_role)
    )
  )
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'compras'::user_role)
    )
  );

-- ─── 2. items ───────────────────────────────────────────────────────────
-- Mantiene admin + almacenista (mismo set que antes), sólo cambia el
-- helper a `has_role` para no depender del fallback de `auth_role()`.
-- SELECT permanece abierto vía policy "Users can view items" de 001.

drop policy if exists "Admins and almacenistas can manage items" on public.items;
drop policy if exists items_write on public.items;

create policy items_write on public.items
  for all to authenticated
  using (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'almacenista'::user_role)
    )
  )
  with check (
    organization_id = public.auth_org_id()
    and (
      public.has_role(auth.uid(), 'admin'::user_role)
      or public.has_role(auth.uid(), 'almacenista'::user_role)
    )
  );

-- ─── Nota ────────────────────────────────────────────────────────────────
-- Resto de tablas del 008 (categories, units, equipment, employees,
-- crops_lots, fx_rates, audit_log, season_closures, adjustment_reasons,
-- profiles, warehouses, seasons) siguen usando `auth_role()`. Son
-- funcionalmente admin-only (porque la única forma de que auth_role()
-- devuelva 'super_admin' es tener el rol admin). Las migraremos en un
-- pase futuro si reaparece fricción — no son bugs activos hoy.

commit;
