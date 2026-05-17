-- ============================================================================
-- 058_seed_cmms_demo_data.sql
--
-- Seed de data demo para todo el módulo de Mantenimiento.  Permite
-- evaluar los flujos end-to-end sin tener que capturar manualmente.
--
-- Incluye:
--   • 10 equipos (tractores, implementos, vehículos, bombas) con
--     criticality, location, current_hours, qr_code
--   • 5 empleados con skills + is_technician + hourly_rate
--   • 8 maintenance_plans (horas + calendar)
--   • 4 service_requests (open, triaged, converted, rejected)
--   • 15 work_orders cubriendo todos los estados (reported → closed)
--   • wo_parts, wo_labor, wo_checklist, wo_comments para varias OTs
--
-- Idempotente: se salta si encuentra equipos con prefijo "DEMO-".
-- ============================================================================

do $$
declare
  v_org      uuid;
  v_admin    uuid;
  v_mantto   uuid;
  v_compras  uuid;
  v_almacen  uuid;
  v_already_seeded boolean;

  -- Equipment ids (asignados al insertar para uso posterior)
  v_eq_tractor1 uuid;
  v_eq_tractor2 uuid;
  v_eq_tractor3 uuid;
  v_eq_implem1  uuid;
  v_eq_implem2  uuid;
  v_eq_pickup   uuid;
  v_eq_camion   uuid;
  v_eq_bomba1   uuid;
  v_eq_bomba2   uuid;
  v_eq_otro     uuid;

  v_emp_juan    uuid;
  v_emp_pedro   uuid;
  v_emp_carlos  uuid;
  v_emp_maria   uuid;
  v_emp_roberto uuid;

  v_plan1 uuid; v_plan2 uuid; v_plan3 uuid; v_plan4 uuid;
  v_plan5 uuid; v_plan6 uuid;

  v_failure_motor uuid; v_failure_elec uuid; v_failure_hyd uuid;

  v_wo_id uuid;
  v_sr_id uuid;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_admin   from auth.users where email = 'admin@agristock.mx'         limit 1;
  select id into v_mantto  from auth.users where email = 'mantenimiento@agristock.mx' limit 1;
  select id into v_compras from auth.users where email = 'compras@agristock.mx'       limit 1;
  select id into v_almacen from auth.users where email = 'almacen@agristock.mx'       limit 1;

  if v_org is null then
    raise notice 'No org found, skipping seed.';
    return;
  end if;

  select exists (
    select 1 from public.equipment
     where organization_id = v_org
       and code like 'DEMO-%'
  ) into v_already_seeded;

  if v_already_seeded then
    raise notice '── CMMS demo data already seeded, skipping ──';
    return;
  end if;

  raise notice '── Seeding CMMS demo data for org % ──', v_org;

  -- ─── 1. Failure types (si no hay) ────────────────────────────────────
  insert into public.failure_types (organization_id, code, label, severity, description, is_active)
  values
    (v_org, 'DEMO-MOT-001', 'Falla de motor',     'critical', 'Cualquier fallo del bloque motor', true),
    (v_org, 'DEMO-ELE-001', 'Falla eléctrica',    'high',     'Cortos, batería, alternador, arnés', true),
    (v_org, 'DEMO-HYD-001', 'Falla hidráulica',   'high',     'Bombas, mangueras, cilindros', true)
  on conflict (organization_id, code) do nothing;

  select id into v_failure_motor from public.failure_types where organization_id = v_org and code = 'DEMO-MOT-001';
  select id into v_failure_elec  from public.failure_types where organization_id = v_org and code = 'DEMO-ELE-001';
  select id into v_failure_hyd   from public.failure_types where organization_id = v_org and code = 'DEMO-HYD-001';

  -- ─── 2. Equipment ────────────────────────────────────────────────────
  v_eq_tractor1 := extensions.gen_random_uuid();
  v_eq_tractor2 := extensions.gen_random_uuid();
  v_eq_tractor3 := extensions.gen_random_uuid();
  v_eq_implem1  := extensions.gen_random_uuid();
  v_eq_implem2  := extensions.gen_random_uuid();
  v_eq_pickup   := extensions.gen_random_uuid();
  v_eq_camion   := extensions.gen_random_uuid();
  v_eq_bomba1   := extensions.gen_random_uuid();
  v_eq_bomba2   := extensions.gen_random_uuid();
  v_eq_otro     := extensions.gen_random_uuid();

  insert into public.equipment
    (id, organization_id, code, name, type, brand, model, year,
     current_hours, current_km, criticality, location, qr_code, notes, is_active)
  values
    (v_eq_tractor1, v_org, 'DEMO-TRC-001', 'Tractor John Deere 6110',
     'tractor', 'John Deere', '6110M', 2021, 3450, null, 'critical',
     'Bodega A · Patio 1', 'QR-TRC-001', 'Equipo crítico para temporada de cosecha', true),
    (v_eq_tractor2, v_org, 'DEMO-TRC-002', 'Tractor Massey Ferguson 4290',
     'tractor', 'Massey Ferguson', '4290', 2019, 5820, null, 'high',
     'Bodega A · Patio 2', 'QR-TRC-002', null, true),
    (v_eq_tractor3, v_org, 'DEMO-TRC-003', 'Tractor New Holland TD5',
     'tractor', 'New Holland', 'TD5.110', 2022, 1290, null, 'medium',
     'Bodega B · Patio 1', 'QR-TRC-003', null, true),
    (v_eq_implem1, v_org, 'DEMO-IMP-001', 'Rastra de discos 28 pulgadas',
     'implement', 'Rhino', 'RX-28', 2020, null, null, 'medium',
     'Bodega C', 'QR-IMP-001', null, true),
    (v_eq_implem2, v_org, 'DEMO-IMP-002', 'Sembradora neumática 8 hileras',
     'implement', 'Kuhn', 'Maxima 3', 2021, null, null, 'high',
     'Bodega C', 'QR-IMP-002', 'Calibrar antes de cada temporada', true),
    (v_eq_pickup, v_org, 'DEMO-VEH-001', 'Camioneta Ford F-250',
     'vehicle', 'Ford', 'F-250', 2020, null, 78400, 'medium',
     'Estacionamiento principal', 'QR-VEH-001', null, true),
    (v_eq_camion, v_org, 'DEMO-VEH-002', 'Camión Volvo VM 270',
     'vehicle', 'Volvo', 'VM 270', 2018, null, 132500, 'high',
     'Estacionamiento principal', 'QR-VEH-002', null, true),
    (v_eq_bomba1, v_org, 'DEMO-BMB-001', 'Bomba de riego principal',
     'pump', 'Berkeley', 'B4ZPMS', 2017, 8900, null, 'critical',
     'Caseta de bombeo norte', 'QR-BMB-001', 'Bomba de la parcela principal', true),
    (v_eq_bomba2, v_org, 'DEMO-BMB-002', 'Bomba sumergible 5HP',
     'pump', 'Pedrollo', '4SR4', 2022, 1200, null, 'medium',
     'Pozo profundo 2', 'QR-BMB-002', null, true),
    (v_eq_otro, v_org, 'DEMO-OTR-001', 'Generador diésel 30 kVA',
     'other', 'Cummins', 'C30D5', 2019, 4200, null, 'high',
     'Caseta eléctrica', 'QR-OTR-001', 'Respaldo para caseta de bombeo', true)
  on conflict (organization_id, code) do nothing;

  -- ─── 3. Empleados técnicos ──────────────────────────────────────────
  v_emp_juan    := extensions.gen_random_uuid();
  v_emp_pedro   := extensions.gen_random_uuid();
  v_emp_carlos  := extensions.gen_random_uuid();
  v_emp_maria   := extensions.gen_random_uuid();
  v_emp_roberto := extensions.gen_random_uuid();

  insert into public.employees
    (id, organization_id, employee_code, full_name, role_field, is_active,
     skills, is_technician, hourly_rate_mxn)
  values
    (v_emp_juan,    v_org, 'DEMO-EMP-001', 'Juan Pérez Hernández',  'mecánico senior',
     true, array['motor','transmisión','hidráulica'], true, 180.00),
    (v_emp_pedro,   v_org, 'DEMO-EMP-002', 'Pedro Ramírez López',   'eléctrico',
     true, array['eléctrico','electrónica','soldadura'], true, 165.00),
    (v_emp_carlos,  v_org, 'DEMO-EMP-003', 'Carlos Méndez Solís',   'mecánico general',
     true, array['mecánica','soldadura','tornería'], true, 145.00),
    (v_emp_maria,   v_org, 'DEMO-EMP-004', 'María González Cruz',   'preventivo',
     true, array['lubricación','inspección','PM'], true, 130.00),
    (v_emp_roberto, v_org, 'DEMO-EMP-005', 'Roberto Vázquez Aguilar','ayudante',
     true, array['mecánica básica'], true, 95.00)
  on conflict (organization_id, employee_code) do nothing;

  -- ─── 4. Maintenance plans ───────────────────────────────────────────
  v_plan1 := extensions.gen_random_uuid();
  v_plan2 := extensions.gen_random_uuid();
  v_plan3 := extensions.gen_random_uuid();
  v_plan4 := extensions.gen_random_uuid();
  v_plan5 := extensions.gen_random_uuid();
  v_plan6 := extensions.gen_random_uuid();

  insert into public.maintenance_plans
    (id, organization_id, equipment_id, name, trigger_type, interval_value,
     interval_unit, last_execution_value, next_execution_value, advance_warning,
     default_checklist, is_active)
  values
    -- Tractor 1: cambio de aceite cada 250h (actual 3450h, próximo 3500h, está cerca)
    (v_plan1, v_org, v_eq_tractor1, 'Cambio de aceite y filtros',
     'hours', 250, 'horas', 3250, 3500, 50,
     '["Drenar aceite usado","Reemplazar filtro de aceite","Reemplazar filtro de combustible","Llenar con aceite nuevo 15W40","Verificar fugas"]'::jsonb,
     true),
    -- Tractor 1: engrase cada 50h (DUE)
    (v_plan2, v_org, v_eq_tractor1, 'Engrase general',
     'hours', 50, 'horas', 3400, 3450, 10,
     '["Engrasar puntos del eje delantero","Engrasar puntos del eje trasero","Engrasar transmisión","Verificar niveles de aceite hidráulico"]'::jsonb,
     true),
    -- Tractor 2: filtro de aire cada 500h
    (v_plan3, v_org, v_eq_tractor2, 'Cambio de filtro de aire',
     'hours', 500, 'horas', 5500, 6000, 100,
     '["Inspeccionar filtro primario","Reemplazar filtro de aire","Limpiar caja del filtro"]'::jsonb,
     true),
    -- Bomba 1: inspección anual (calendario, due)
    (v_plan4, v_org, v_eq_bomba1, 'Inspección semestral',
     'calendar', 180, 'días', null,
     extract(epoch from current_date - interval '5 days') / 86400, 7,
     '["Inspeccionar empaques","Verificar presión de descarga","Limpiar trampa de arena","Probar arrancador"]'::jsonb,
     true),
    -- Camioneta: servicio cada 10,000 km (próximo 80,000, actual 78,400)
    (v_plan5, v_org, v_eq_pickup, 'Servicio mayor',
     'kilometers', 10000, 'km', 70000, 80000, 1500,
     '["Cambio de aceite y filtro","Rotación de neumáticos","Inspección de frenos","Inspección de transmisión"]'::jsonb,
     true),
    -- Generador: inspección mensual (calendario, vencido)
    (v_plan6, v_org, v_eq_otro, 'Inspección mensual',
     'calendar', 30, 'días', null,
     extract(epoch from current_date - interval '8 days') / 86400, 3,
     '["Verificar nivel de aceite","Verificar nivel de combustible","Prueba de arranque","Limpiar terminales batería"]'::jsonb,
     true)
  on conflict do nothing;

  -- ─── 5. Service requests ────────────────────────────────────────────
  -- Una abierta reciente (sin triagear)
  v_sr_id := extensions.gen_random_uuid();
  insert into public.service_requests
    (id, organization_id, folio, equipment_id, reported_by, reported_at,
     description, urgency, status, location_hint)
  values
    (v_sr_id, v_org, 'SR-DEMO-001', v_eq_tractor2, coalesce(v_almacen, v_mantto),
     now() - interval '6 hours',
     'El tractor MF 4290 hace ruido extraño al acelerar. Suena como cadena. El operador detuvo el trabajo por seguridad.',
     'high', 'open', 'Parcela norte, lote 7');

  -- Una triagada (en revisión)
  insert into public.service_requests
    (organization_id, folio, equipment_id, reported_by, reported_at,
     description, urgency, status,
     triaged_by, triaged_at, triage_notes)
  values
    (v_org, 'SR-DEMO-002', v_eq_pickup, coalesce(v_almacen, v_mantto),
     now() - interval '2 days',
     'La camioneta tiene fuga de aceite. Mancha en el piso del estacionamiento.',
     'medium', 'triaged',
     v_mantto, now() - interval '1 day',
     'Confirmado. Fuga viene del cárter. Se programará para esta semana.');

  -- Una rechazada (no era un problema)
  insert into public.service_requests
    (organization_id, folio, equipment_id, reported_by, reported_at,
     description, urgency, status,
     triaged_by, triaged_at, triage_notes)
  values
    (v_org, 'SR-DEMO-003', v_eq_implem1, coalesce(v_almacen, v_mantto),
     now() - interval '5 days',
     'La rastra parece tener un disco doblado.',
     'low', 'rejected',
     v_mantto, now() - interval '4 days',
     'Revisado: el disco está dentro de tolerancia. No requiere intervención.');

  -- ─── 6. Work orders en distintos estados ────────────────────────────
  -- 6.1 REPORTED (recién creada por operario)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, failure_type_id, reported_by, reported_at, status)
  values
    (v_org, 'OT-DEMO-001', v_eq_tractor2, 'corrective', 'high',
     'Ruido al acelerar — posible cadena de distribución floja.', v_failure_motor,
     coalesce(v_almacen, v_mantto), now() - interval '4 hours', 'reported');

  -- 6.2 SCHEDULED (PM generado a futuro)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, maintenance_plan_id, reported_by, reported_at,
     scheduled_date, status)
  values
    (v_org, 'OT-DEMO-002', v_eq_pickup, 'preventive', 'medium',
     'PM programado: Servicio mayor 80,000 km', v_plan5,
     v_mantto, now() - interval '1 day',
     current_date + interval '3 days', 'scheduled');

  -- 6.3 ASSIGNED (técnico ya asignado, listo para iniciar)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, reported_by, reported_at,
     scheduled_date, status, primary_technician_id, estimated_hours)
  values
    (v_org, 'OT-DEMO-003', v_eq_bomba1, 'corrective', 'critical',
     'Bomba principal pierde presión. Riego de la parcela detenido.',
     v_mantto, now() - interval '8 hours',
     current_date, 'assigned', v_emp_juan, 4.0);

  -- 6.4 IN_PROGRESS (técnico trabajando)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, failure_type_id, reported_by, reported_at,
     status, primary_technician_id, started_at, estimated_hours,
     hours_meter_open)
  values
    (v_org, 'OT-DEMO-004', v_eq_tractor3, 'corrective', 'high',
     'Falla eléctrica intermitente al arranque.', v_failure_elec,
     coalesce(v_almacen, v_mantto), now() - interval '2 days',
     'in_progress', v_emp_pedro, now() - interval '3 hours', 6.0, 1290);

  -- 6.5 WAITING_PARTS (esperando refacción)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, failure_type_id, reported_by, reported_at,
     status, primary_technician_id, started_at, estimated_hours)
  values
    (v_org, 'OT-DEMO-005', v_eq_implem2, 'corrective', 'high',
     'Sembradora no dosifica correctamente. Posible disco roto.',
     v_failure_hyd, coalesce(v_almacen, v_mantto), now() - interval '3 days',
     'waiting_parts', v_emp_carlos, now() - interval '2 days', 8.0);

  -- 6.6 COMPLETED (terminado pero sin firma de cierre)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, solution_applied, reported_by, reported_at,
     status, primary_technician_id, started_at, completed_at,
     actual_hours, estimated_hours, hours_meter_open, hours_meter_close,
     downtime_minutes, total_cost_mxn)
  values
    (v_org, 'OT-DEMO-006', v_eq_tractor1, 'preventive', 'medium',
     'Engrase general programado',
     'Engrase completo realizado. Verificados niveles de aceites.',
     v_mantto, now() - interval '4 days',
     'completed', v_emp_maria, now() - interval '3 days',
     now() - interval '3 days' + interval '1.5 hours',
     1.5, 2.0, 3445, 3448, 90, 285.00)
  returning id into v_wo_id;

  -- Agregar parts + labor + checklist + comment a OT-DEMO-006
  insert into public.wo_labor (wo_id, technician_id, work_date, hours, hourly_rate_mxn, notes)
  values (v_wo_id, v_emp_maria, (now() - interval '3 days')::date, 1.5, 130.00, 'Engrase completo');

  insert into public.wo_checklist (wo_id, task_description, display_order, is_completed, completed_at, completed_by)
  values
    (v_wo_id, 'Engrasar puntos del eje delantero', 1, true,  now() - interval '3 days', v_mantto),
    (v_wo_id, 'Engrasar puntos del eje trasero',   2, true,  now() - interval '3 days', v_mantto),
    (v_wo_id, 'Engrasar transmisión',              3, true,  now() - interval '3 days', v_mantto),
    (v_wo_id, 'Verificar niveles de hidráulico',   4, true,  now() - interval '3 days', v_mantto);

  -- 6.7 CLOSED (firmada, histórica)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, solution_applied, failure_type_id, reported_by, reported_at,
     status, primary_technician_id, started_at, completed_at,
     actual_hours, estimated_hours, hours_meter_open, hours_meter_close,
     downtime_minutes, total_cost_mxn,
     signed_off_by, signed_off_at)
  values
    (v_org, 'OT-DEMO-007', v_eq_tractor1, 'corrective', 'high',
     'Pérdida de potencia. Diagnóstico: filtro de combustible obstruido.',
     'Reemplazado filtro de combustible primario y secundario. Purgado el sistema. Probado en campo OK.',
     v_failure_motor, coalesce(v_almacen, v_mantto), now() - interval '12 days',
     'closed', v_emp_juan, now() - interval '11 days',
     now() - interval '11 days' + interval '3 hours',
     3.0, 4.0, 3380, 3383, 180, 1750.00,
     v_admin, now() - interval '10 days')
  returning id into v_wo_id;

  insert into public.wo_labor (wo_id, technician_id, work_date, hours, hourly_rate_mxn)
  values (v_wo_id, v_emp_juan, (now() - interval '11 days')::date, 3.0, 180.00);

  -- 6.8 CLOSED #2 (mes pasado)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, solution_applied, failure_type_id, reported_by, reported_at,
     status, primary_technician_id, started_at, completed_at,
     actual_hours, estimated_hours, hours_meter_open, hours_meter_close,
     downtime_minutes, total_cost_mxn,
     signed_off_by, signed_off_at)
  values
    (v_org, 'OT-DEMO-008', v_eq_bomba1, 'corrective', 'critical',
     'Bomba dejó de arrancar. Operación de riego suspendida.',
     'Cambio de capacitor y limpieza de impulsor. Probado 2 horas continuas sin fallas.',
     v_failure_elec, coalesce(v_almacen, v_mantto), now() - interval '35 days',
     'closed', v_emp_pedro, now() - interval '35 days' + interval '2 hours',
     now() - interval '34 days', 6.0, 8.0, 8820, 8826, 600, 4250.00,
     v_admin, now() - interval '33 days');

  -- 6.9 CLOSED #3 (PM histórico)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, solution_applied, maintenance_plan_id, reported_by, reported_at,
     status, primary_technician_id, started_at, completed_at,
     actual_hours, estimated_hours,
     downtime_minutes, total_cost_mxn,
     signed_off_by, signed_off_at, scheduled_date)
  values
    (v_org, 'OT-DEMO-009', v_eq_tractor2, 'preventive', 'medium',
     'PM: Cambio de filtro de aire programado.',
     'Reemplazado filtro de aire primario. Caja limpia.',
     v_plan3, v_mantto, now() - interval '50 days',
     'closed', v_emp_maria, now() - interval '48 days',
     now() - interval '48 days' + interval '1 hour',
     1.0, 1.0, 60, 450.00,
     v_admin, now() - interval '47 days',
     (current_date - interval '49 days')::date);

  -- 6.10 CANCELLED (descartada)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, reported_by, reported_at, status,
     notes)
  values
    (v_org, 'OT-DEMO-010', v_eq_implem1, 'inspection', 'low',
     'Inspección de discos por reporte de usuario.', v_mantto,
     now() - interval '4 days', 'cancelled',
     'Cancelada: el disco está dentro de tolerancia tras inspección visual.');

  -- 6.11 PM PROGRAMADO (vencido — para demo del calendar)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, maintenance_plan_id, reported_by, reported_at,
     scheduled_date, status, primary_technician_id)
  values
    (v_org, 'OT-DEMO-011', v_eq_otro, 'preventive', 'medium',
     'PM: Inspección mensual del generador.', v_plan6,
     v_mantto, now() - interval '15 days',
     (current_date - interval '5 days')::date, 'scheduled', v_emp_maria);

  -- 6.12 PM PROXIMO (este mes)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, maintenance_plan_id, reported_by, reported_at,
     scheduled_date, status, primary_technician_id)
  values
    (v_org, 'OT-DEMO-012', v_eq_tractor1, 'preventive', 'high',
     'PM: Cambio de aceite y filtros (próximo a 3500h).',
     v_plan1, v_mantto, now() - interval '1 day',
     (current_date + interval '12 days')::date, 'scheduled', v_emp_juan);

  -- 6.13 SR convertida → WO (linkea SR-DEMO-001 a una WO nueva)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, reported_by, reported_at, status,
     primary_technician_id)
  values
    (v_org, 'OT-DEMO-013', v_eq_tractor2, 'corrective', 'high',
     'Ruido al acelerar — convertida desde SR-DEMO-001.',
     coalesce(v_almacen, v_mantto), now() - interval '5 hours', 'assigned',
     v_emp_juan)
  returning id into v_wo_id;

  insert into public.service_requests
    (organization_id, folio, equipment_id, reported_by, reported_at,
     description, urgency, status,
     triaged_by, triaged_at, triage_notes, converted_wo_id)
  values
    (v_org, 'SR-DEMO-004', v_eq_tractor2, coalesce(v_almacen, v_mantto),
     now() - interval '6 hours',
     'Tractor MF hace ruido raro al acelerar fuerte. El operador lo apagó.',
     'high', 'converted',
     v_mantto, now() - interval '5 hours',
     'Confirmado. Posible problema de cadena. Asignado a Juan.', v_wo_id);

  -- 6.14 Otra reportada hoy
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, reported_by, reported_at, status)
  values
    (v_org, 'OT-DEMO-014', v_eq_camion, 'corrective', 'medium',
     'Camión Volvo tiene falla en luces traseras. No prende ninguna luz al accionar el switch.',
     coalesce(v_almacen, v_mantto), now() - interval '1 hour', 'reported');

  -- 6.15 Completed reciente (sin firma todavía)
  insert into public.work_orders
    (organization_id, folio, equipment_id, wo_type, priority,
     failure_description, solution_applied, reported_by, reported_at,
     status, primary_technician_id, started_at, completed_at,
     actual_hours, estimated_hours, downtime_minutes, total_cost_mxn)
  values
    (v_org, 'OT-DEMO-015', v_eq_bomba2, 'corrective', 'medium',
     'Bomba sumergible no arranca. Probable corto en cable.',
     'Reemplazado tramo de cable submarino dañado. Probado 30 min OK.',
     coalesce(v_almacen, v_mantto), now() - interval '2 days',
     'completed', v_emp_pedro, now() - interval '1 day',
     now() - interval '1 day' + interval '2.5 hours',
     2.5, 3.0, 150, 1650.00);

  -- ─── 7. Comentarios en algunas OTs ──────────────────────────────────
  for v_wo_id in
    select id from public.work_orders
     where organization_id = v_org
       and folio in ('OT-DEMO-003', 'OT-DEMO-005', 'OT-DEMO-008')
  loop
    insert into public.wo_comments (organization_id, wo_id, user_id, body, created_at)
    values
      (v_org, v_wo_id, v_mantto,
       'Recibida. Voy a coordinar las refacciones.', now() - interval '1 day'),
      (v_org, v_wo_id, v_admin,
       'Prioridad alta. Confirmen cuando ya tengan las partes.', now() - interval '20 hours');
  end loop;

  raise notice '── CMMS demo seed completado ──';
end $$;
