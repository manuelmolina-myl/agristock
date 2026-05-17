-- ============================================================================
-- 052_po_comments_price_history.sql
--
-- Wave 2 del plan: features adicionales del módulo Compras.
--
-- 1. Discusión por OC (po_comments) — hilo interno entre compras y admin.
-- 2. Histórico de precios — vista price_history que agrupa quotation_lines
--    e invoice_lines (si existen) por (item_id, supplier_id).
-- 3. Supplier performance — vista supplier_kpis que calcula:
--    - on_time_delivery_pct: % OCs entregadas a tiempo
--    - avg_delivery_days: días promedio entre OC firmada y recepción
--    - total_pos / active_pos / total_mxn
-- ============================================================================

-- ─── 1. po_comments ────────────────────────────────────────────────────────
create table if not exists public.po_comments (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  po_id           uuid not null references public.purchase_orders(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_po_comments_po on public.po_comments(po_id, created_at);

alter table public.po_comments enable row level security;

drop policy if exists pc_select on public.po_comments;
create policy pc_select on public.po_comments
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists pc_insert on public.po_comments;
create policy pc_insert on public.po_comments
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and user_id = auth.uid()
  );

drop policy if exists pc_delete on public.po_comments;
create policy pc_delete on public.po_comments
  for delete to authenticated
  using (
    organization_id = public.auth_org_id()
    and user_id = auth.uid()
  );

-- ─── 2. Histórico de precios por item-supplier ─────────────────────────────
-- Combina quotation_lines (precios cotizados) + receptions (precios reales
-- al momento de recepción si existen).  Útil para detectar tendencias.
create or replace view public.price_history as
  select
    rl.item_id,
    q.supplier_id,
    sup.name        as supplier_name,
    q.quotation_date as observed_on,
    ql.unit_cost    as unit_cost,
    ql.currency,
    q.id            as quotation_id,
    q.folio         as quotation_folio,
    'quotation'::text as source
  from public.quotation_lines ql
  join public.quotations q       on q.id = ql.quotation_id
  join public.requisition_lines rl on rl.id = ql.requisition_line_id
  join public.suppliers sup      on sup.id = q.supplier_id
  where rl.item_id is not null;

grant select on public.price_history to authenticated;

comment on view public.price_history is
  'Histórico de precios cotizados por item-supplier.  Útil para comparar precios actuales contra historial.';

-- ─── 3. Supplier KPIs ──────────────────────────────────────────────────────
-- Métricas operativas por proveedor: % entregas a tiempo, días promedio,
-- montos.  La vista calcula sobre todas las OCs no canceladas del proveedor.
create or replace view public.supplier_kpis as
  select
    sup.id                                            as supplier_id,
    sup.organization_id,
    sup.name                                          as supplier_name,
    count(po.id) filter (where po.status not in ('cancelled', 'draft'))  as total_pos,
    count(po.id) filter (
      where po.status in ('sent', 'pending_signature', 'confirmed', 'partially_received')
    )                                                                    as active_pos,
    count(po.id) filter (where po.status = 'received')                   as completed_pos,
    count(po.id) filter (where po.status = 'cancelled')                  as cancelled_pos,
    coalesce(
      sum(po.total_mxn) filter (where po.status not in ('cancelled', 'draft')),
      0
    )                                                                    as total_mxn,
    -- on-time: la recepción confirmada se hizo en/antes de expected_delivery_date
    count(po.id) filter (
      where po.status = 'received'
        and po.expected_delivery_date is not null
        and exists (
          select 1 from public.receptions r
           where r.po_id = po.id
             and r.status = 'accepted'
             and r.reception_date <= po.expected_delivery_date
        )
    )                                                                    as on_time_count,
    count(po.id) filter (
      where po.status = 'received'
        and po.expected_delivery_date is not null
    )                                                                    as eligible_for_on_time,
    -- avg delivery days: entre approved_at (firma) y la primera recepción
    (select avg(extract(day from (r.reception_date::timestamptz - po2.approved_at)))::int
       from public.purchase_orders po2
       join public.receptions r on r.po_id = po2.id and r.status = 'accepted'
      where po2.supplier_id = sup.id
        and po2.organization_id = sup.organization_id
        and po2.approved_at is not null
        and po2.deleted_at is null
    )                                                                    as avg_delivery_days
  from public.suppliers sup
  left join public.purchase_orders po
    on po.supplier_id = sup.id
   and po.organization_id = sup.organization_id
   and po.deleted_at is null
  where sup.deleted_at is null
  group by sup.id, sup.organization_id, sup.name;

grant select on public.supplier_kpis to authenticated;

comment on view public.supplier_kpis is
  'Métricas operativas por proveedor.  Heredados RLS via tabla suppliers (SELECT por org).';
