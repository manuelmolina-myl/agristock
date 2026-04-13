-- ============================================================================
-- AgriStock — Demo movements seed data
-- Run AFTER reset.sql and fix_users.sql
-- Creates realistic entries, exits, and diesel loads for the last 30 days
-- ============================================================================

-- ─── Helper: get IDs ─────────────────────────────────────────────────────────
-- org: a0000000-0000-0000-0000-000000000001
-- season: b0000000-0000-0000-0000-000000000001
-- warehouse ALM-01: c0000000-0000-0000-0000-000000000001
-- warehouse ALM-02: c0000000-0000-0000-0000-000000000002
-- admin user: aa000000-0000-0000-0000-000000000001

-- ─── 1. ENTRY MOVEMENTS (purchases) ─────────────────────────────────────────

-- Entry 1: Compra de agroquímicos (hace 25 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, supplier_id, document_number, reference_external, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native, fx_rate, fx_source)
values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'ENT-001', 'FAC-2024-001', 'posted', now() - interval '25 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '25 days', 45000, 45000, 17.45, 'DOF_FIX');

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000001', (select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 200, 180, 'MXN', 180, 36000, 36000),
  ('e1000000-0000-0000-0000-000000000001', (select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 5, 1800, 'MXN', 1800, 9000, 9000);

-- Entry 2: Compra de fertilizantes USD (hace 22 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, supplier_id, document_number, reference_external, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native, fx_rate, fx_source)
values
  ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'ENT-002', 'INV-2024-045', 'posted', now() - interval '22 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '22 days', 87250, 5000, 17.45, 'DOF_FIX');

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000002', (select id from items where sku='FER-002' and organization_id='a0000000-0000-0000-0000-000000000001'), 10, 350, 'USD', 6107.5, 3500, 61075),
  ('e1000000-0000-0000-0000-000000000002', (select id from items where sku='AGR-002' and organization_id='a0000000-0000-0000-0000-000000000001'), 20, 75, 'USD', 1308.75, 1500, 26175);

-- Entry 3: Compra semillas (hace 20 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, supplier_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native, fx_rate, fx_source)
values
  ('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'ENT-003', 'posted', now() - interval '20 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '20 days', 52350, 3000, 17.45, 'DOF_FIX');

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000003', (select id from items where sku='SEM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 20, 150, 'USD', 2617.5, 3000, 52350);

-- Entry 4: Compra refacciones y EPP (hace 18 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, supplier_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'ENT-004', 'posted', now() - interval '18 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '18 days', 28500, 28500);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000004', (select id from items where sku='REF-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 10, 850, 'MXN', 850, 8500, 8500),
  ('e1000000-0000-0000-0000-000000000004', (select id from items where sku='HER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 15, 350, 'MXN', 350, 5250, 5250),
  ('e1000000-0000-0000-0000-000000000004', (select id from items where sku='EPP-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 20, 450, 'MXN', 450, 9000, 9000),
  ('e1000000-0000-0000-0000-000000000004', (select id from items where sku='CON-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 30, 192, 'MXN', 192, 5750, 5750);

-- Entry 5: Compra diésel (hace 15 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, supplier_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'ENT-005', 'posted', now() - interval '15 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '15 days', 120000, 120000);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000005', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 5000, 24, 'MXN', 24, 120000, 120000);

-- Entry 6: Otra compra (hace 10 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000002', 'ENT-006', 'posted', now() - interval '10 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '10 days', 15600, 15600);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn) values
  ('e1000000-0000-0000-0000-000000000006', (select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 50, 185, 'MXN', 185, 9250, 9250),
  ('e1000000-0000-0000-0000-000000000006', (select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 3, 2100, 'MXN', 2100, 6300, 6300);

-- Entry 7: Borrador (hoy)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, created_by, created_at, total_mxn, total_native)
values
  ('e1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'entry_purchase', 'c0000000-0000-0000-0000-000000000001', 'ENT-007', 'draft', 'aa000000-0000-0000-0000-000000000001', now(), 0, 0);

-- ─── 2. EXIT MOVEMENTS (consumption to crop lots) ───────────────────────────

-- Exit 1: Consumo Lote 1 - Tomate (hace 23 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-001', 'posted', now() - interval '23 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '23 days', 12600, 12600);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, crop_lot_id) values
  ('e2000000-0000-0000-0000-000000000001', (select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 50, 180, 'MXN', 180, 9000, 9000, 'crop_lot', '10000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000001', (select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 2, 1800, 'MXN', 1800, 3600, 3600, 'crop_lot', '10000000-0000-0000-0000-000000000001');

-- Exit 2: Consumo Lote 2 - Chile (hace 19 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-002', 'posted', now() - interval '19 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '19 days', 8100, 8100);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, crop_lot_id) values
  ('e2000000-0000-0000-0000-000000000002', (select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 30, 180, 'MXN', 180, 5400, 5400, 'crop_lot', '10000000-0000-0000-0000-000000000002'),
  ('e2000000-0000-0000-0000-000000000002', (select id from items where sku='EPP-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 6, 450, 'MXN', 450, 2700, 2700, 'crop_lot', '10000000-0000-0000-0000-000000000002');

-- Exit 3: Consumo Lote 4 - Maíz (hace 14 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-003', 'posted', now() - interval '14 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '14 days', 7200, 7200);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, crop_lot_id) values
  ('e2000000-0000-0000-0000-000000000003', (select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 4, 1800, 'MXN', 1800, 7200, 7200, 'crop_lot', '10000000-0000-0000-0000-000000000004');

-- Exit 4: Refacciones a tractor (hace 12 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-004', 'posted', now() - interval '12 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '12 days', 2550, 2550);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id) values
  ('e2000000-0000-0000-0000-000000000004', (select id from items where sku='REF-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 3, 850, 'MXN', 850, 2550, 2550, 'equipment', '20000000-0000-0000-0000-000000000001');

-- Exit 5: EPP a empleado (hace 8 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-005', 'posted', now() - interval '8 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '8 days', 900, 900);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, employee_id) values
  ('e2000000-0000-0000-0000-000000000005', (select id from items where sku='EPP-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 2, 450, 'MXN', 450, 900, 900, 'employee', '30000000-0000-0000-0000-000000000001');

-- Exit 6: Consumo reciente Lote 1 (hace 3 días)
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values
  ('e2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'SAL-006', 'posted', now() - interval '3 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '3 days', 5400, 5400);

insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, crop_lot_id) values
  ('e2000000-0000-0000-0000-000000000006', (select id from items where sku='CON-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 10, 192, 'MXN', 192, 1920, 1920, 'crop_lot', '10000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000006', (select id from items where sku='HER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 5, 350, 'MXN', 350, 1750, 1750, 'crop_lot', '10000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000006', (select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 10, 182, 'MXN', 182, 1820, 1820, 'crop_lot', '10000000-0000-0000-0000-000000000001');

-- ─── 3. DIESEL LOADS ────────────────────────────────────────────────────────

-- Diesel load 1: JD-01, 24 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-001', 'posted', now() - interval '24 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '24 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000001', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 180, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 180, 3200, 3220);

-- Diesel load 2: JD-02, 22 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-002', 'posted', now() - interval '22 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '22 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000002', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 150, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 150, 2100, 2118);

-- Diesel load 3: NH-01, 20 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-003', 'posted', now() - interval '20 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '20 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000003', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 200, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 200, 4500, 4522);

-- Diesel load 4: JD-01, 17 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-004', 'posted', now() - interval '17 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '17 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000004', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 190, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 190, 3220, 3242);

-- Diesel load 5: JD-02, 14 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-005', 'posted', now() - interval '14 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '14 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000005', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 160, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 160, 2118, 2137);

-- Diesel load 6: NH-01, 10 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-006', 'posted', now() - interval '10 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '10 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000006', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 210, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 210, 4522, 4546);

-- Diesel load 7: JD-01, 7 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-007', 'posted', now() - interval '7 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '7 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000007', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 175, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 175, 3242, 3260);

-- Diesel load 8: JD-02, 4 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-008', 'posted', now() - interval '4 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '4 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000008', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 145, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 145, 2137, 2152);

-- Diesel load 9: NH-01, 2 días atrás
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-009', 'posted', now() - interval '2 days', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now() - interval '2 days', 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000009', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 195, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 195, 4546, 4568);

-- Diesel load 10: JD-01, hoy
insert into stock_movements (id, organization_id, season_id, movement_type, warehouse_id, document_number, status, posted_at, posted_by, created_by, created_at, total_mxn, total_native)
values ('e3000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'exit_consumption', 'c0000000-0000-0000-0000-000000000001', 'DSL-010', 'posted', now(), 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now(), 0, 0);
insert into stock_movement_lines (movement_id, item_id, quantity, unit_cost_native, native_currency, unit_cost_mxn, line_total_native, line_total_mxn, destination_type, equipment_id, operator_employee_id, diesel_liters, equipment_hours_before, equipment_hours_after) values
  ('e3000000-0000-0000-0000-000000000010', (select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 185, 0, 'MXN', 0, 0, 0, 'equipment', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 185, 3260, 3280);

-- ─── 4. UPDATE ITEM_STOCK (materialized balances) ───────────────────────────

-- Calculate stock balances from all posted movements
-- Glifosato: entered 250, exited 90 = 160
insert into item_stock (item_id, warehouse_id, season_id, quantity, avg_cost_native, avg_cost_mxn, last_movement_at) values
  ((select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 160, 181.25, 181.25, now() - interval '3 days'),
  ((select id from items where sku='AGR-002' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 20, 75, 1308.75, now() - interval '22 days'),
  ((select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 2, 1866.67, 1866.67, now() - interval '10 days'),
  ((select id from items where sku='FER-002' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10, 350, 6107.5, now() - interval '22 days'),
  ((select id from items where sku='SEM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 20, 150, 2617.5, now() - interval '20 days'),
  ((select id from items where sku='REF-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 7, 850, 850, now() - interval '12 days'),
  ((select id from items where sku='HER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10, 350, 350, now() - interval '3 days'),
  ((select id from items where sku='COM-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 3315, 24, 24, now()),
  ((select id from items where sku='CON-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 20, 192, 192, now() - interval '3 days'),
  ((select id from items where sku='EPP-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 12, 450, 450, now() - interval '8 days')
on conflict (item_id, warehouse_id, season_id) do update set
  quantity = excluded.quantity,
  avg_cost_native = excluded.avg_cost_native,
  avg_cost_mxn = excluded.avg_cost_mxn,
  last_movement_at = excluded.last_movement_at;

-- Also some stock in ALM-02
insert into item_stock (item_id, warehouse_id, season_id, quantity, avg_cost_native, avg_cost_mxn, last_movement_at) values
  ((select id from items where sku='AGR-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 50, 185, 185, now() - interval '10 days'),
  ((select id from items where sku='FER-001' and organization_id='a0000000-0000-0000-0000-000000000001'), 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 3, 2100, 2100, now() - interval '10 days')
on conflict (item_id, warehouse_id, season_id) do update set
  quantity = excluded.quantity,
  avg_cost_native = excluded.avg_cost_native,
  avg_cost_mxn = excluded.avg_cost_mxn,
  last_movement_at = excluded.last_movement_at;

-- ─── 5. UPDATE EQUIPMENT HOURS ──────────────────────────────────────────────
update equipment set current_hours = 3280 where id = '20000000-0000-0000-0000-000000000001';
update equipment set current_hours = 2152 where id = '20000000-0000-0000-0000-000000000002';
update equipment set current_hours = 4568 where id = '20000000-0000-0000-0000-000000000003';

-- ─── 6. MORE FX RATES (last 30 days) ────────────────────────────────────────
insert into fx_rates (organization_id, date, currency_from, currency_to, rate, source) values
  ('a0000000-0000-0000-0000-000000000001', current_date - 1, 'USD', 'MXN', 17.42, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 2, 'USD', 'MXN', 17.48, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 3, 'USD', 'MXN', 17.35, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 4, 'USD', 'MXN', 17.51, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 5, 'USD', 'MXN', 17.55, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 6, 'USD', 'MXN', 17.60, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 7, 'USD', 'MXN', 17.58, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 8, 'USD', 'MXN', 17.40, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 14, 'USD', 'MXN', 17.30, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 21, 'USD', 'MXN', 17.65, 'DOF_FIX'),
  ('a0000000-0000-0000-0000-000000000001', current_date - 28, 'USD', 'MXN', 17.70, 'DOF_FIX')
on conflict (organization_id, date, currency_from, currency_to) do nothing;
