-- ============================================================================
-- 062_executive_summary.sql
--
-- Función monolítica para el Tablero Ejecutivo del director:
--   • executive_summary() — todos los KPIs cross-módulo en una sola
--     llamada (eficiencia: un round-trip)
--   • executive_monthly_spend() — serie temporal últimos 6 meses
--     (gasto total por mes desglosado por origen)
--   • executive_cash_flow_30d() — proyección de pagos próximos 30 días
--   • executive_spend_by_category() — pie por categoría este mes
-- ============================================================================

-- ─── executive_summary: todos los KPIs en un solo call ─────────────────
create or replace function public.executive_summary()
returns table (
  -- Almacén
  inventory_value_mxn       numeric,
  low_stock_count           int,
  -- Compras
  spend_month_mxn           numeric,
  spend_last_month_mxn      numeric,
  pending_requisitions      int,
  pending_signatures        int,
  ap_overdue_mxn            numeric,
  ap_due_7d_mxn             numeric,
  -- Mantenimiento
  open_wos                  int,
  overdue_wos               int,
  pm_compliance_pct         numeric,
  avg_mttr_hours            numeric,
  mantto_cost_month_mxn     numeric,
  open_service_requests     int,
  -- Combustible
  total_diesel_inventory_l  numeric,
  tanks_low_count           int,
  diesel_consumed_month_l   numeric,
  diesel_cost_month_mxn     numeric,
  -- Cross
  active_critical_alerts    int
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v as (select public.auth_org_id() as org_id),
  m as (select date_trunc('month', current_date) as month_start,
              date_trunc('month', current_date - interval '1 month') as last_month_start),
  inv as (
    select
      coalesce(sum(s.quantity * s.avg_cost_mxn), 0) as inventory_value,
      count(distinct i.id) filter (
        where i.reorder_point is not null and i.reorder_point > 0
          and s.quantity < i.reorder_point
      ) as low_count
    from public.item_stock s
    join public.items i on i.id = s.item_id
    cross join v
    where i.organization_id = v.org_id
      and i.is_active
  ),
  spend_now as (
    select coalesce(sum(po.total_mxn), 0) as spend
      from public.purchase_orders po, v, m
     where po.organization_id = v.org_id
       and po.issue_date >= m.month_start
       and po.status != 'cancelled'
       and po.deleted_at is null
  ),
  spend_prev as (
    select coalesce(sum(po.total_mxn), 0) as spend
      from public.purchase_orders po, v, m
     where po.organization_id = v.org_id
       and po.issue_date >= m.last_month_start
       and po.issue_date < m.month_start
       and po.status != 'cancelled'
       and po.deleted_at is null
  ),
  reqs as (
    select count(*)::int as pending
      from public.purchase_requisitions pr, v
     where pr.organization_id = v.org_id
       and pr.status = 'submitted'
       and pr.deleted_at is null
  ),
  sigs as (
    select count(*)::int as pending
      from public.purchase_orders po, v
     where po.organization_id = v.org_id
       and po.status = 'pending_signature'
       and po.deleted_at is null
  ),
  ap_over as (
    select coalesce(sum(si.total), 0) as amt
      from public.supplier_invoices si, v
     where si.organization_id = v.org_id
       and si.due_date < current_date
       and si.status not in ('paid', 'cancelled')
  ),
  ap_soon as (
    select coalesce(sum(si.total), 0) as amt
      from public.supplier_invoices si, v
     where si.organization_id = v.org_id
       and si.due_date >= current_date
       and si.due_date <= current_date + interval '7 days'
       and si.status not in ('paid', 'cancelled')
  ),
  mantto as (
    select * from public.maintenance_dashboard_kpis()
  ),
  diesel_inv as (
    select
      coalesce(sum(t.current_level_liters), 0) as total_l,
      count(*) filter (
        where (t.current_level_liters / nullif(t.capacity_liters, 0)) * 100
              < t.alert_threshold_pct
      )::int as low_n
    from public.diesel_tanks t, v
    where t.organization_id = v.org_id
      and t.is_active
      and t.deleted_at is null
  ),
  diesel_use as (
    select
      coalesce(sum(sml.diesel_liters), 0) as liters,
      coalesce(sum(sml.line_total_mxn), 0) as cost
    from public.stock_movement_lines sml
    join public.stock_movements sm on sm.id = sml.movement_id
    cross join v, m
    where sm.organization_id = v.org_id
      and sml.diesel_liters is not null
      and sm.posted_at >= m.month_start
      and sm.status = 'posted'
  )
  select
    inv.inventory_value,
    inv.low_count::int,
    spend_now.spend,
    spend_prev.spend,
    reqs.pending,
    sigs.pending,
    ap_over.amt,
    ap_soon.amt,
    mantto.open_wos,
    mantto.overdue_wos,
    mantto.pm_compliance_pct,
    mantto.avg_mttr_hours,
    mantto.cost_this_month_mxn,
    mantto.open_service_requests,
    diesel_inv.total_l,
    diesel_inv.low_n,
    diesel_use.liters,
    diesel_use.cost,
    -- critical alerts = vencidas + bajo nivel + OTs críticas
    (reqs.pending + sigs.pending +
     mantto.overdue_wos + mantto.open_critical_wos +
     diesel_inv.low_n)::int as active_critical_alerts
  from inv, spend_now, spend_prev, reqs, sigs, ap_over, ap_soon, mantto, diesel_inv, diesel_use;
$$;

grant execute on function public.executive_summary() to authenticated;

-- ─── executive_monthly_spend: serie temporal últimos 6 meses ───────────
create or replace function public.executive_monthly_spend()
returns table (
  month_start date,
  spend_compras_mxn  numeric,
  spend_mantto_mxn   numeric,
  spend_diesel_mxn   numeric,
  total_mxn          numeric
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v as (select public.auth_org_id() as org_id),
  months as (
    select generate_series(
      date_trunc('month', current_date - interval '5 months'),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as m
  )
  select
    months.m,
    coalesce((
      select sum(po.total_mxn)
        from public.purchase_orders po, v
       where po.organization_id = v.org_id
         and date_trunc('month', po.issue_date) = months.m
         and po.status != 'cancelled'
         and po.deleted_at is null
    ), 0)::numeric,
    coalesce((
      select sum(wo.total_cost_mxn)
        from public.work_orders wo, v
       where wo.organization_id = v.org_id
         and date_trunc('month', wo.completed_at) = months.m
         and wo.deleted_at is null
    ), 0)::numeric,
    coalesce((
      select sum(sml.line_total_mxn)
        from public.stock_movement_lines sml
        join public.stock_movements sm on sm.id = sml.movement_id
        cross join v
       where sm.organization_id = v.org_id
         and sml.diesel_liters is not null
         and date_trunc('month', sm.posted_at) = months.m
         and sm.status = 'posted'
    ), 0)::numeric,
    0::numeric
  from months
  order by months.m;
$$;

-- Patch: total_mxn must be computed via a subquery — recreate to fix
create or replace function public.executive_monthly_spend()
returns table (
  month_start date,
  spend_compras_mxn  numeric,
  spend_mantto_mxn   numeric,
  spend_diesel_mxn   numeric,
  total_mxn          numeric
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v as (select public.auth_org_id() as org_id),
  months as (
    select generate_series(
      date_trunc('month', current_date - interval '5 months'),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as m
  ),
  s as (
    select
      months.m,
      coalesce((
        select sum(po.total_mxn)
          from public.purchase_orders po, v
         where po.organization_id = v.org_id
           and date_trunc('month', po.issue_date) = months.m
           and po.status != 'cancelled'
           and po.deleted_at is null
      ), 0)::numeric as compras_n,
      coalesce((
        select sum(wo.total_cost_mxn)
          from public.work_orders wo, v
         where wo.organization_id = v.org_id
           and date_trunc('month', wo.completed_at) = months.m
           and wo.deleted_at is null
      ), 0)::numeric as mantto_n,
      coalesce((
        select sum(sml.line_total_mxn)
          from public.stock_movement_lines sml
          join public.stock_movements sm on sm.id = sml.movement_id
          cross join v
         where sm.organization_id = v.org_id
           and sml.diesel_liters is not null
           and date_trunc('month', sm.posted_at) = months.m
           and sm.status = 'posted'
      ), 0)::numeric as diesel_n
    from months
  )
  select m, compras_n, mantto_n, diesel_n,
         (compras_n + mantto_n + diesel_n) as total_n
    from s
   order by m;
$$;

grant execute on function public.executive_monthly_spend() to authenticated;

-- ─── executive_cash_flow_30d: proyección de pagos próximos 30 días ─────
create or replace function public.executive_cash_flow_30d()
returns table (
  day             date,
  due_amount_mxn  numeric,
  invoice_count   int
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v as (select public.auth_org_id() as org_id),
  days as (
    select generate_series(current_date, current_date + interval '30 days', interval '1 day')::date as d
  )
  select
    days.d,
    coalesce((
      select sum(si.total)
        from public.supplier_invoices si, v
       where si.organization_id = v.org_id
         and si.due_date = days.d
         and si.status not in ('paid', 'cancelled')
    ), 0)::numeric as amt,
    coalesce((
      select count(*)
        from public.supplier_invoices si, v
       where si.organization_id = v.org_id
         and si.due_date = days.d
         and si.status not in ('paid', 'cancelled')
    ), 0)::int as cnt
  from days
  order by days.d;
$$;

grant execute on function public.executive_cash_flow_30d() to authenticated;

-- ─── executive_spend_by_category: pie del mes ──────────────────────────
create or replace function public.executive_spend_by_category()
returns table (
  category_name  text,
  total_mxn      numeric
)
language sql security definer
set search_path = public, pg_temp
as $$
  with v as (select public.auth_org_id() as org_id),
  m as (select date_trunc('month', current_date) as month_start)
  select
    coalesce(cat.name, 'Sin categoría') as cat_name,
    coalesce(sum(pol.quantity * pol.unit_cost), 0) as total
  from public.po_lines pol
  join public.purchase_orders po on po.id = pol.po_id
  left join public.items it on it.id = pol.item_id
  left join public.categories cat on cat.id = it.category_id
  cross join v, m
  where po.organization_id = v.org_id
    and po.issue_date >= m.month_start
    and po.status != 'cancelled'
    and po.deleted_at is null
  group by cat.name
  order by total desc
  limit 10;
$$;

grant execute on function public.executive_spend_by_category() to authenticated;
