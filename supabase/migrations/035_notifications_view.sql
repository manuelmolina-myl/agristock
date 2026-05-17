-- ============================================================================
-- 035_notifications_view.sql — Notification center MVP
--
-- Adds `public.get_user_notifications(p_user_id uuid, p_limit int)` — a
-- SECURITY DEFINER function that returns the union of role-relevant events
-- for the calling user.  No separate `notifications` table is materialized;
-- the function is a thin view over the existing business tables.
--
-- Role gating happens inside the function via `public.has_role(uid, role)`
-- so each user only sees the notifications their role cares about, scoped
-- to their own organization (`public.auth_org_id()`).
--
-- Notification kinds:
--   • requisition_pending  (admin, compras)         — purchase_requisitions.status = 'submitted'
--   • quotes_ready         (admin, compras)         — requisitions w/ ≥2 quotations and no PO yet
--   • wo_open              (admin, mantenimiento)   — work_orders in open/in-progress states
--   • low_stock            (admin, almacenista)     — items below reorder_point
-- ============================================================================

create or replace function public.get_user_notifications(
  p_user_id uuid,
  p_limit   int default 20
)
returns table (
  kind        text,
  title       text,
  subtitle    text,
  link_path   text,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_org_id          uuid;
  v_is_admin        boolean;
  v_is_compras      boolean;
  v_is_mantto       boolean;
  v_is_almacenista  boolean;
begin
  -- Resolve org from the caller's profile.  We use `auth_org_id()` (which
  -- queries profiles by auth.uid()) instead of trusting p_user_id, to make
  -- the function safe even if a client passes someone else's UUID.
  v_org_id := public.auth_org_id();
  if v_org_id is null then
    return;
  end if;

  v_is_admin       := public.has_role(auth.uid(), 'admin');
  v_is_compras     := public.has_role(auth.uid(), 'compras');
  v_is_mantto      := public.has_role(auth.uid(), 'mantenimiento');
  v_is_almacenista := public.has_role(auth.uid(), 'almacenista');

  return query
  with combined as (
    -- ─── Pending requisitions (admin + compras) ────────────────────────────
    select
      'requisition_pending'::text                                    as kind,
      coalesce(pr.folio, 'Requisición')                              as title,
      coalesce(
        'Solicitada por ' || coalesce(prof.full_name, 'usuario'),
        'Pendiente de revisión'
      )                                                              as subtitle,
      ('/compras/requisiciones/' || pr.id::text)                     as link_path,
      pr.created_at                                                  as created_at
    from public.purchase_requisitions pr
    left join public.profiles prof on prof.id = pr.requester_id
    where (v_is_admin or v_is_compras)
      and pr.organization_id = v_org_id
      and pr.status = 'submitted'
      and pr.deleted_at is null

    union all

    -- ─── Quotations awaiting decision (admin + compras) ────────────────────
    -- Requisitions that have ≥2 quotations and no purchase_order yet.
    select
      'quotes_ready'::text                                            as kind,
      coalesce(pr.folio, 'Requisición')                               as title,
      (q_stats.quote_count::text || ' cotizaciones listas para comparar') as subtitle,
      ('/compras/cotizaciones/comparar?requisicion=' || pr.id::text)  as link_path,
      q_stats.last_quote_at                                           as created_at
    from public.purchase_requisitions pr
    join (
      select
        q.requisition_id,
        count(*)         as quote_count,
        max(q.created_at) as last_quote_at
      from public.quotations q
      where q.organization_id = v_org_id
      group by q.requisition_id
      having count(*) >= 2
    ) q_stats on q_stats.requisition_id = pr.id
    where (v_is_admin or v_is_compras)
      and pr.organization_id = v_org_id
      and pr.deleted_at is null
      and not exists (
        select 1
        from public.purchase_orders po
        where po.requisition_id = pr.id
          and po.deleted_at is null
      )

    union all

    -- ─── Open work orders (admin + mantenimiento) ──────────────────────────
    -- Schema note: work_orders.primary_technician_id references employees(id),
    -- and employees has no FK back to auth.users, so the brief's "assigned to
    -- me" cannot be expressed directly.  As a pragmatic MVP we surface every
    -- open WO in the org to the mantenimiento/admin roles.  Once an
    -- employee↔user link exists, narrow this with `and primary_technician_id
    -- = (select id from employees where user_id = p_user_id)`.
    select
      'wo_open'::text                                                 as kind,
      coalesce(wo.folio, 'OT')                                        as title,
      coalesce(
        nullif(wo.failure_description, ''),
        'Orden abierta'
      )                                                               as subtitle,
      ('/mantenimiento/ordenes/' || wo.id::text)                      as link_path,
      coalesce(wo.reported_at, wo.created_at)                         as created_at
    from public.work_orders wo
    where (v_is_admin or v_is_mantto)
      and wo.organization_id = v_org_id
      and wo.deleted_at is null
      and wo.status in ('reported', 'scheduled', 'assigned', 'in_progress', 'waiting_parts')

    union all

    -- ─── Low stock (admin + almacenista) ───────────────────────────────────
    -- Aggregated across warehouses so a single item only fires once even if
    -- multiple warehouse rows are below the reorder point.  Capped at 10
    -- distinct items via the nested subquery so we never flood the popover
    -- with an entire catalog when reorder points are misconfigured.
    select
      'low_stock'::text                                               as kind,
      low.name                                                        as title,
      ('SKU ' || low.sku || ' · Stock ' || low.total_qty::text ||
        ' (umbral ' || low.reorder_point::text || ')')                as subtitle,
      ('/almacen/inventario/' || low.id::text)                        as link_path,
      low.last_event_at                                               as created_at
    from (
      select
        it.id,
        it.name,
        it.sku,
        it.reorder_point,
        ls.total_qty,
        coalesce(ls.last_movement_at, it.created_at) as last_event_at
      from public.items it
      join (
        select
          s.item_id,
          sum(s.quantity)            as total_qty,
          max(s.last_movement_at)    as last_movement_at
        from public.item_stock s
        group by s.item_id
      ) ls on ls.item_id = it.id
      where (v_is_admin or v_is_almacenista)
        and it.organization_id = v_org_id
        and it.deleted_at is null
        and it.is_active = true
        and coalesce(it.reorder_point, 0) > 0
        and ls.total_qty < it.reorder_point
      order by coalesce(ls.last_movement_at, it.created_at) desc nulls last
      limit 10
    ) low
  )
  select
    c.kind,
    c.title,
    c.subtitle,
    c.link_path,
    c.created_at
  from combined c
  order by c.created_at desc nulls last
  limit greatest(p_limit, 1);
end;
$$;

comment on function public.get_user_notifications(uuid, int)
  is 'Returns a unified feed of role-relevant pending events for the calling user, scoped to their organization.  Notification center MVP — see migration 035.';

revoke all on function public.get_user_notifications(uuid, int) from public;
grant execute on function public.get_user_notifications(uuid, int) to authenticated;
