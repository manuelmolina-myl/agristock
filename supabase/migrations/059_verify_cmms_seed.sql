-- ============================================================================
-- 059_verify_cmms_seed.sql
--
-- Verificación del seed CMMS — imprime los conteos por tabla para que el
-- usuario sepa qué se cargó.
-- ============================================================================

do $$
declare
  v_org uuid;
  v_eq_count int;
  v_emp_count int;
  v_plan_count int;
  v_sr_count int;
  v_wo_count int;
  v_wo_open int;
  v_wo_closed int;
  v_wo_labor_count int;
  v_wo_comments_count int;
begin
  select id into v_org from public.organizations order by created_at limit 1;

  select count(*) into v_eq_count   from public.equipment           where organization_id = v_org and code like 'DEMO-%';
  select count(*) into v_emp_count  from public.employees           where organization_id = v_org and employee_code like 'DEMO-%';
  select count(*) into v_plan_count from public.maintenance_plans   where organization_id = v_org;
  select count(*) into v_sr_count   from public.service_requests    where organization_id = v_org and folio like 'SR-DEMO-%';
  select count(*) into v_wo_count   from public.work_orders         where organization_id = v_org and folio like 'OT-DEMO-%';
  select count(*) into v_wo_open    from public.work_orders         where organization_id = v_org and folio like 'OT-DEMO-%' and status not in ('completed','closed','cancelled');
  select count(*) into v_wo_closed  from public.work_orders         where organization_id = v_org and folio like 'OT-DEMO-%' and status in ('completed','closed');
  select count(*) into v_wo_labor_count    from public.wo_labor      l join public.work_orders wo on wo.id = l.wo_id where wo.organization_id = v_org and wo.folio like 'OT-DEMO-%';
  select count(*) into v_wo_comments_count from public.wo_comments   c where c.organization_id = v_org;

  raise notice '┌─────────────────────────────────────────────────┐';
  raise notice '│ CMMS DEMO DATA — Verificación                   │';
  raise notice '├─────────────────────────────────────────────────┤';
  raise notice '│  Equipos:                  % │', lpad(v_eq_count::text, 3);
  raise notice '│  Empleados técnicos:       % │', lpad(v_emp_count::text, 3);
  raise notice '│  Maintenance plans:        % │', lpad(v_plan_count::text, 3);
  raise notice '│  Service requests:         % │', lpad(v_sr_count::text, 3);
  raise notice '│  Work orders total:        % │', lpad(v_wo_count::text, 3);
  raise notice '│    abiertas:               % │', lpad(v_wo_open::text, 3);
  raise notice '│    completadas / cerradas: % │', lpad(v_wo_closed::text, 3);
  raise notice '│  Wo_labor entries:         % │', lpad(v_wo_labor_count::text, 3);
  raise notice '│  Wo_comments:              % │', lpad(v_wo_comments_count::text, 3);
  raise notice '└─────────────────────────────────────────────────┘';
end $$;
