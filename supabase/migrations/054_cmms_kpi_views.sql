-- ============================================================================
-- 054_cmms_kpi_views.sql
--
-- Vistas KPI para el módulo Mantenimiento:
--
-- 1. equipment_kpis — por equipo: MTBF, MTTR, downtime acumulado, costo
--    total, # OTs, % preventivo vs correctivo, última falla.
--
-- 2. maintenance_dashboard_kpis — KPIs agregados por organización para el
--    dashboard principal.
--
-- 3. wo_overdue — vista de OTs vencidas (PMs con scheduled_date < hoy aún
--    en status not in (completed/closed/cancelled)).
-- ============================================================================

-- ─── 1. equipment_kpis ────────────────────────────────────────────────────
-- Definiciones:
--   MTBF (Mean Time Between Failures): tiempo promedio en horas (downtime
--     entendido como ventana operativa entre reported_at de una OT
--     correctiva y reported_at de la siguiente).  Si no hay 2+ fallas,
--     null.
--   MTTR (Mean Time To Repair): promedio de (completed_at - started_at)
--     en horas para OTs cerradas con esos timestamps.
--   downtime_hours: suma de (completed_at - started_at) en horas para
--     todas las OTs (correctivas) cerradas en los últimos 365 días.

create or replace view public.equipment_kpis as
with corrective_failures as (
  select
    wo.equipment_id,
    wo.reported_at,
    lag(wo.reported_at) over (
      partition by wo.equipment_id
      order by wo.reported_at
    ) as previous_failure_at
  from public.work_orders wo
  where wo.wo_type = 'corrective'
    and wo.deleted_at is null
),
mtbf_per_equip as (
  select
    equipment_id,
    avg(extract(epoch from (reported_at - previous_failure_at)) / 3600) as mtbf_hours
  from corrective_failures
  where previous_failure_at is not null
  group by equipment_id
),
mttr_per_equip as (
  select
    wo.equipment_id,
    avg(extract(epoch from (wo.completed_at - wo.started_at)) / 3600) as mttr_hours
  from public.work_orders wo
  where wo.completed_at is not null
    and wo.started_at is not null
    and wo.deleted_at is null
  group by wo.equipment_id
),
last_year_downtime as (
  select
    wo.equipment_id,
    sum(extract(epoch from (wo.completed_at - wo.started_at)) / 3600) as downtime_hours
  from public.work_orders wo
  where wo.completed_at is not null
    and wo.started_at is not null
    and wo.completed_at >= now() - interval '365 days'
    and wo.deleted_at is null
  group by wo.equipment_id
),
cost_totals as (
  select
    wo.equipment_id,
    sum(coalesce(wo.total_cost_mxn, 0)) as total_cost_mxn,
    sum(coalesce(wo.total_cost_mxn, 0))
      filter (where wo.completed_at >= now() - interval '365 days') as cost_last_year_mxn
  from public.work_orders wo
  where wo.deleted_at is null
  group by wo.equipment_id
),
wo_counts as (
  select
    wo.equipment_id,
    count(*)                                            as total_wos,
    count(*) filter (where wo.wo_type = 'corrective')   as corrective_wos,
    count(*) filter (where wo.wo_type = 'preventive')   as preventive_wos,
    count(*) filter (
      where wo.status not in ('completed', 'closed', 'cancelled')
    )                                                   as open_wos,
    max(wo.reported_at) filter (where wo.wo_type = 'corrective') as last_failure_at
  from public.work_orders wo
  where wo.deleted_at is null
  group by wo.equipment_id
)
select
  e.id                          as equipment_id,
  e.organization_id,
  e.code,
  e.name,
  e.type,
  e.criticality,
  e.location,
  coalesce(wc.total_wos, 0)     as total_wos,
  coalesce(wc.corrective_wos, 0) as corrective_wos,
  coalesce(wc.preventive_wos, 0) as preventive_wos,
  coalesce(wc.open_wos, 0)      as open_wos,
  wc.last_failure_at,
  -- % preventivo: preventive / total
  case
    when coalesce(wc.total_wos, 0) = 0 then null
    else round((wc.preventive_wos::numeric / wc.total_wos::numeric) * 100, 1)
  end                           as preventive_pct,
  round(mtbf.mtbf_hours::numeric, 1)        as mtbf_hours,
  round(mttr.mttr_hours::numeric, 2)        as mttr_hours,
  round(coalesce(ly.downtime_hours, 0)::numeric, 1)   as downtime_hours_last_year,
  coalesce(ct.total_cost_mxn, 0)            as total_cost_mxn,
  coalesce(ct.cost_last_year_mxn, 0)        as cost_last_year_mxn
from public.equipment e
left join wo_counts        wc   on wc.equipment_id = e.id
left join mtbf_per_equip   mtbf on mtbf.equipment_id = e.id
left join mttr_per_equip   mttr on mttr.equipment_id = e.id
left join last_year_downtime ly on ly.equipment_id = e.id
left join cost_totals      ct   on ct.equipment_id = e.id
where e.deleted_at is null;

grant select on public.equipment_kpis to authenticated;

comment on view public.equipment_kpis is
  'Métricas operativas por equipo: MTBF (h), MTTR (h), downtime año, costo, contadores.  RLS heredado del query (organization_id se filtra client-side).';

-- ─── 2. wo_overdue ───────────────────────────────────────────────────────
-- OTs con scheduled_date < hoy que aún no se completan/cierran.
create or replace view public.wo_overdue as
  select
    wo.*,
    e.name             as equipment_name,
    e.code             as equipment_code,
    (current_date - wo.scheduled_date) as days_overdue
  from public.work_orders wo
  join public.equipment e on e.id = wo.equipment_id
  where wo.deleted_at is null
    and wo.scheduled_date is not null
    and wo.scheduled_date < current_date
    and wo.status not in ('completed', 'closed', 'cancelled');

grant select on public.wo_overdue to authenticated;

-- ─── 3. maintenance_dashboard_kpis (función, no vista) ──────────────────
-- Función que regresa KPIs agregados para la org actual.  Usar como:
--   select * from public.maintenance_dashboard_kpis();
create or replace function public.maintenance_dashboard_kpis()
returns table (
  open_wos                  int,
  open_critical_wos         int,
  overdue_wos               int,
  wos_completed_this_month  int,
  pm_compliance_pct         numeric,
  avg_mttr_hours            numeric,
  downtime_hours_this_month numeric,
  cost_this_month_mxn       numeric,
  open_service_requests     int
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v_org as (select public.auth_org_id() as org),
  m as (select date_trunc('month', current_date) as month_start)
  select
    -- open WOs
    (select count(*)::int
       from public.work_orders wo, v_org
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.status not in ('completed', 'closed', 'cancelled')),
    -- open critical (priority=urgent or equipo criticality=critical)
    (select count(*)::int
       from public.work_orders wo
       join public.equipment e on e.id = wo.equipment_id
       cross join v_org
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.status not in ('completed', 'closed', 'cancelled')
        and (wo.priority = 'critical' or e.criticality = 'critical')),
    -- overdue (scheduled_date pasada)
    (select count(*)::int from public.wo_overdue ov, v_org
      where ov.organization_id = v_org.org),
    -- completadas este mes
    (select count(*)::int
       from public.work_orders wo, v_org, m
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.status in ('completed', 'closed')
        and wo.completed_at >= m.month_start),
    -- PM compliance: % de PMs completados a tiempo en el mes
    (select case
              when count(*) = 0 then null
              else round(
                100.0 * count(*) filter (where wo.completed_at::date <= wo.scheduled_date)
                / count(*)::numeric, 1)
            end
       from public.work_orders wo, v_org, m
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.wo_type = 'preventive'
        and wo.completed_at >= m.month_start
        and wo.scheduled_date is not null),
    -- MTTR promedio (últimos 90 días)
    (select round(avg(extract(epoch from (wo.completed_at - wo.started_at)) / 3600)::numeric, 2)
       from public.work_orders wo, v_org
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.completed_at is not null
        and wo.started_at is not null
        and wo.completed_at >= now() - interval '90 days'),
    -- downtime del mes
    (select round(coalesce(sum(extract(epoch from (wo.completed_at - wo.started_at)) / 3600), 0)::numeric, 1)
       from public.work_orders wo, v_org, m
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.completed_at >= m.month_start
        and wo.started_at is not null),
    -- costo del mes
    (select coalesce(sum(wo.total_cost_mxn), 0)
       from public.work_orders wo, v_org, m
      where wo.organization_id = v_org.org
        and wo.deleted_at is null
        and wo.completed_at >= m.month_start),
    -- service requests abiertas (open + triaged)
    (select count(*)::int
       from public.service_requests sr, v_org
      where sr.organization_id = v_org.org
        and sr.deleted_at is null
        and sr.status in ('open', 'triaged'));
$$;

grant execute on function public.maintenance_dashboard_kpis() to authenticated;
