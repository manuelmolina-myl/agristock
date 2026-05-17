-- ============================================================================
-- 061_seed_diesel_tanks_demo.sql
--
-- Seed de tanques demo + algunas recargas históricas para evaluar.
-- Idempotente: skip si existen tanques con code DEMO-TANK-*.
-- ============================================================================

do $$
declare
  v_org uuid;
  v_admin uuid;
  v_tank1 uuid;
  v_tank2 uuid;
  v_supplier uuid;
  v_already boolean;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_admin from auth.users where email = 'admin@agristock.mx' limit 1;
  select id into v_supplier from public.suppliers where organization_id = v_org limit 1;

  if v_org is null then return; end if;

  select exists (
    select 1 from public.diesel_tanks
     where organization_id = v_org and code like 'DEMO-TANK-%'
  ) into v_already;
  if v_already then
    raise notice '── Diesel tanks demo ya sembrados ──';
    return;
  end if;

  v_tank1 := extensions.gen_random_uuid();
  v_tank2 := extensions.gen_random_uuid();

  insert into public.diesel_tanks
    (id, organization_id, code, name, type, capacity_liters,
     current_level_liters, alert_threshold_pct, location, supplier_id, is_active)
  values
    (v_tank1, v_org, 'DEMO-TANK-001', 'Tanque estacionario principal',
     'stationary', 5000, 3000, 20, 'Caseta de combustible · Bodega A',
     v_supplier, true),
    (v_tank2, v_org, 'DEMO-TANK-002', 'Pipa móvil 1,000 L',
     'mobile', 1000, 180, 25, 'Estacionamiento · Pipa',
     v_supplier, true);

  -- Recargas históricas
  insert into public.diesel_loads
    (organization_id, tank_id, supplier_id, delivery_date, liters,
     unit_cost_mxn, fuel_invoice_folio, notes, registered_by)
  values
    -- Tank 1
    (v_org, v_tank1, v_supplier, current_date - interval '7 days',
     2500, 24.50, 'F-DZL-12834', 'Recarga semanal', v_admin),
    (v_org, v_tank1, v_supplier, current_date - interval '21 days',
     2800, 23.90, 'F-DZL-12745', null, v_admin),
    -- Tank 2 (pipa)
    (v_org, v_tank2, v_supplier, current_date - interval '4 days',
     900, 24.80, 'F-DZL-12867', 'Llenado de pipa', v_admin);

  raise notice '── 2 tanques demo + 3 recargas sembrados ──';
end $$;
