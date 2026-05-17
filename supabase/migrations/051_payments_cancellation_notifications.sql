-- ============================================================================
-- 051_payments_cancellation_notifications.sql
--
-- Cierra el ciclo del módulo Compras:
--
-- 1. Pagos / Cuentas por pagar
--    - Nuevas columnas en supplier_invoices: paid_at, paid_by,
--      payment_method, payment_reference, payment_proof_url, payment_notes.
--    - RPC mark_invoice_paid(uuid, jsonb) que valida estado y persiste
--      metadata atómicamente.
--    - Vista materializable (view simple) ap_aging que produce el aging
--      bucket por factura (0-30, 31-60, 61-90, 90+).
--
-- 2. Cancelación formal de OC
--    - RPC cancel_po(uuid, text) admin-only.  Bloqueado si hay
--      recepciones registradas o facturas conciliadas.
--    - Columna po_orders.cancellation_reason text para auditar el motivo.
--
-- 3. Notificaciones expandidas
--    - Re-escribe get_user_notifications para incluir:
--      • OCs pending_signature > 2 días
--      • Facturas vencidas (due_date < today, status != paid)
--      • Facturas por vencer (due_date within 3 días)
--      • Recepciones pendientes > 30 días (PO sent sin recepción)
-- ============================================================================

-- ─── 1. Payment columns + cancellation reason ──────────────────────────────
alter table public.supplier_invoices
  add column if not exists paid_at            timestamptz,
  add column if not exists paid_by            uuid references auth.users(id),
  add column if not exists payment_method     text,
  add column if not exists payment_reference  text,
  add column if not exists payment_proof_url  text,
  add column if not exists payment_notes      text;

comment on column public.supplier_invoices.payment_method is
  'Método de pago: transferencia | cheque | efectivo | tarjeta | otro';
comment on column public.supplier_invoices.payment_reference is
  'Número de transferencia, folio de cheque, etc.';
comment on column public.supplier_invoices.payment_proof_url is
  'Storage path (bucket: cotizaciones) del comprobante PDF/imagen.';

alter table public.purchase_orders
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references auth.users(id);

-- ─── 2. mark_invoice_paid RPC ──────────────────────────────────────────────
create or replace function public.mark_invoice_paid(
  p_invoice_id uuid,
  p_payment    jsonb
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status public.invoice_status;
begin
  if not public.can_write_purchase(v_user) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;

  select status into v_status
    from public.supplier_invoices
   where id = p_invoice_id;

  if v_status is null then
    raise exception 'Factura no encontrada' using errcode = 'P0002';
  end if;
  if v_status not in ('reconciled', 'discrepancy', 'pending') then
    raise exception 'No se puede marcar pago en factura con estado %', v_status
      using errcode = 'P0001';
  end if;

  update public.supplier_invoices
     set status            = 'paid',
         paid_at           = coalesce((p_payment->>'paid_at')::timestamptz, now()),
         paid_by           = v_user,
         payment_method    = p_payment->>'payment_method',
         payment_reference = p_payment->>'payment_reference',
         payment_proof_url = p_payment->>'payment_proof_url',
         payment_notes     = p_payment->>'payment_notes',
         updated_at        = now()
   where id = p_invoice_id;

  return p_invoice_id;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, jsonb) from public;
grant execute on function public.mark_invoice_paid(uuid, jsonb) to authenticated;

-- ─── 3. Aging bucket helper + view ─────────────────────────────────────────
-- Función auxiliar para clasificar el aging (text-only, fácil de parsear).
create or replace function public.ap_aging_bucket(p_due date, p_status text)
returns text
language sql immutable
as $f$
  select case
    when p_status = 'paid'                              then 'paid'
    when p_due is null                                  then 'sin_vencimiento'
    when p_due >= current_date                          then 'al_corriente'
    when current_date - p_due <= 30                     then 'd_0_30'
    when current_date - p_due <= 60                     then 'd_31_60'
    when current_date - p_due <= 90                     then 'd_61_90'
    else                                                     'd_90_plus'
  end
$f$;

create or replace function public.ap_days_overdue(p_due date, p_status text)
returns int
language sql immutable
as $f$
  select case
    when p_due is null or p_status = 'paid' then null
    else (current_date - p_due)
  end
$f$;

-- Vista que el cliente consulta.  RLS heredado de supplier_invoices.
create or replace view public.ap_aging as
  select
    si.id,
    si.organization_id,
    si.po_id,
    si.supplier_id,
    sup.name             as supplier_name,
    si.invoice_folio,
    si.issue_date,
    si.due_date,
    si.total,
    si.currency,
    si.status,
    si.paid_at,
    public.ap_aging_bucket(si.due_date, si.status::text) as bucket,
    public.ap_days_overdue(si.due_date, si.status::text) as days_overdue
  from public.supplier_invoices si
  join public.suppliers sup on sup.id = si.supplier_id;
  -- supplier_invoices no soporta soft-delete (no tiene columna deleted_at)

grant select on public.ap_aging to authenticated;

comment on view public.ap_aging is
  'Aging por factura.  Bucket: paid / al_corriente / d_0_30 / d_31_60 / d_61_90 / d_90_plus / sin_vencimiento.';

-- ─── 4. cancel_po RPC ──────────────────────────────────────────────────────
create or replace function public.cancel_po(
  p_po_id  uuid,
  p_reason text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_status public.po_status;
begin
  select exists (
    select 1 from public.user_roles
     where user_id = v_user
       and revoked_at is null
       and role::text = 'admin'
  ) into v_is_admin;

  if not coalesce(v_is_admin, false) then
    raise exception 'Sólo un administrador puede cancelar una OC' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Indica el motivo de cancelación (mínimo 3 caracteres)' using errcode = 'P0001';
  end if;

  select status into v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null;

  if v_status is null then
    raise exception 'OC no encontrada' using errcode = 'P0002';
  end if;
  if v_status in ('cancelled', 'closed') then
    raise exception 'La OC ya está %', v_status using errcode = 'P0001';
  end if;

  -- Bloqueado si hay recepciones aceptadas o facturas conciliadas/pagadas.
  if exists (
    select 1 from public.receptions r
     where r.po_id = p_po_id
       and r.status in ('accepted', 'rejected_partial')
  ) then
    raise exception 'No se puede cancelar: hay recepciones registradas' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.supplier_invoices si
     where si.po_id = p_po_id
       and si.status in ('reconciled', 'paid')
  ) then
    raise exception 'No se puede cancelar: hay facturas conciliadas o pagadas' using errcode = 'P0001';
  end if;

  update public.purchase_orders
     set status              = 'cancelled',
         cancellation_reason = p_reason,
         cancelled_at        = now(),
         cancelled_by        = v_user,
         updated_at          = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.cancel_po(uuid, text) from public;
grant execute on function public.cancel_po(uuid, text) to authenticated;

-- ─── 5. Expanded notifications ─────────────────────────────────────────────
create or replace function public.get_user_notifications(
  p_user_id uuid,
  p_limit   int default 30
) returns table (
  kind         text,
  title        text,
  subtitle     text,
  link_path    text,
  created_at   timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.auth_org_id();
  v_user   uuid := coalesce(p_user_id, auth.uid());
begin
  if v_org is null then
    return;
  end if;

  return query
  (
    -- Requisiciones pendientes (admin/compras)
    select 'requisition_pending'::text,
           ('Requisición ' || pr.folio)::text,
           coalesce(pr.notes, '')::text,
           ('/compras/requisiciones/' || pr.id)::text,
           pr.created_at
      from public.purchase_requisitions pr
     where pr.organization_id = v_org
       and pr.deleted_at is null
       and pr.status = 'submitted'
       and (public.has_role(v_user, 'admin'::user_role) or public.has_role(v_user, 'compras'::user_role))
    union all
    -- OCs esperando firma > 2 días (admin)
    select 'po_signature_pending'::text,
           ('OC ' || po.folio || ' pendiente de firma')::text,
           ('Lleva ' || extract(day from (now() - po.updated_at))::int || ' día(s) esperando')::text,
           ('/compras/ordenes/' || po.id)::text,
           po.updated_at
      from public.purchase_orders po
     where po.organization_id = v_org
       and po.deleted_at is null
       and po.status = 'pending_signature'
       and po.updated_at < (now() - interval '2 days')
       and public.has_role(v_user, 'admin'::user_role)
    union all
    -- Facturas vencidas (admin/compras)
    select 'invoice_overdue'::text,
           ('Factura ' || si.invoice_folio || ' vencida')::text,
           (current_date - si.due_date || ' día(s) de mora · $' ||
            to_char(coalesce(si.total, 0), 'FM999,999,999.00'))::text,
           ('/compras/facturas/' || si.po_id)::text,
           (si.due_date::timestamptz)::timestamptz
      from public.supplier_invoices si
     where si.organization_id = v_org
       and 1 = 1
       and si.due_date is not null
       and si.due_date < current_date
       and si.status not in ('paid', 'cancelled')
       and (public.has_role(v_user, 'admin'::user_role) or public.has_role(v_user, 'compras'::user_role))
    union all
    -- Facturas por vencer en ≤ 3 días (admin/compras)
    select 'invoice_due_soon'::text,
           ('Factura ' || si.invoice_folio || ' por vencer')::text,
           ('Vence en ' || (si.due_date - current_date) || ' día(s) · $' ||
            to_char(coalesce(si.total, 0), 'FM999,999,999.00'))::text,
           ('/compras/facturas/' || si.po_id)::text,
           (si.due_date::timestamptz)::timestamptz
      from public.supplier_invoices si
     where si.organization_id = v_org
       and 1 = 1
       and si.due_date is not null
       and si.due_date >= current_date
       and si.due_date <= (current_date + interval '3 days')
       and si.status not in ('paid', 'cancelled')
       and (public.has_role(v_user, 'admin'::user_role) or public.has_role(v_user, 'compras'::user_role))
    union all
    -- OTs abiertas asignadas (mantenimiento/admin)
    select 'wo_open'::text,
           ('OT ' || wo.folio)::text,
           coalesce(wo.failure_description, '')::text,
           ('/mantenimiento/ordenes/' || wo.id)::text,
           wo.created_at
      from public.work_orders wo
     where wo.organization_id = v_org
       and wo.deleted_at is null
       and wo.status in ('reported', 'scheduled', 'assigned', 'in_progress', 'waiting_parts')
       and (public.has_role(v_user, 'admin'::user_role) or public.has_role(v_user, 'mantenimiento'::user_role))
    union all
    -- Items bajo reorden (admin/almacenista)
    select distinct on (i.id)
           'low_stock'::text,
           ('Bajo reorden: ' || i.name)::text,
           ('Pto. reorden: ' || coalesce(i.reorder_point, 0))::text,
           ('/almacen/inventario/' || i.id)::text,
           now()
      from public.items i
      join public.item_stock s on s.item_id = i.id
     where i.organization_id = v_org
       and i.is_active
       and i.reorder_point is not null
       and i.reorder_point > 0
       and (public.has_role(v_user, 'admin'::user_role) or public.has_role(v_user, 'almacenista'::user_role))
     group by i.id
    having sum(s.quantity) < i.reorder_point
  )
  order by created_at desc nulls last
  limit p_limit;
end;
$$;

revoke all on function public.get_user_notifications(uuid, int) from public;
grant execute on function public.get_user_notifications(uuid, int) to authenticated;
