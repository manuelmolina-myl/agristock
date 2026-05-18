-- 066_low_tank_notifications.sql
--
-- Añade un nuevo kind de notificación: `tank_low_level`.
-- Surge cuando un tanque activo cae por debajo de su `alert_threshold_pct`
-- (mismo criterio que el campo `level_status = 'low'` de
-- `diesel_tank_balance`).
--
-- Visible para: admin + almacenista (los roles que pueden disparar una
-- recarga vía `register_diesel_load`). Mantenimiento no, porque su flujo
-- es consultivo — verán los niveles en /almacen/tanques pero no son los
-- responsables de gestionar la alerta.

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

    union all

    -- ─── Tank low level (admin + almacenista) ──────────────────────────────
    -- Tanque activo cuyo nivel actual cae por debajo del umbral configurado.
    -- `updated_at` queda como timestamp de la notificación: el trigger
    -- `fn_diesel_tank_dispense` lo actualiza en cada dispensa, así que
    -- representa el momento del cruce real bajo carga normal.
    select
      'tank_low_level'::text                                          as kind,
      (t.name || ' (' || t.code || ')')                               as title,
      (
        round(t.current_level_liters, 0)::text || ' L de ' ||
        round(t.capacity_liters, 0)::text || ' L · umbral ' ||
        round(t.alert_threshold_pct, 0)::text || '%'
      )                                                               as subtitle,
      ('/almacen/tanques/' || t.id::text)                             as link_path,
      coalesce(t.updated_at, t.created_at)                            as created_at
    from public.diesel_tanks t
    where (v_is_admin or v_is_almacenista)
      and t.organization_id = v_org_id
      and t.is_active = true
      and t.deleted_at is null
      and t.capacity_liters > 0
      and (t.current_level_liters / t.capacity_liters * 100) < t.alert_threshold_pct
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
  is 'Returns a unified feed of role-relevant pending events for the calling user, scoped to their organization.  Kinds: requisition_pending, quotes_ready, wo_open, low_stock, tank_low_level.';
