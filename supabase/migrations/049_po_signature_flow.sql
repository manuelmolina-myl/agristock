-- ============================================================================
-- 049_po_signature_flow.sql
--
-- Flujo de firma para Órdenes de Compra:
--
--   DRAFT  →  PENDING_SIGNATURE  →  SENT  →  CONFIRMED → ...RECEIVED → CLOSED
--           (pasar a firma)      (firmar)
--             compras/admin       sólo admin
--
-- - Nuevo valor en el enum po_status: 'pending_signature'
-- - RPC submit_po_for_signature(uuid):  draft → pending_signature
--   Requiere can_write_purchase (admin o compras)
-- - RPC sign_po(uuid):                  pending_signature → sent
--   Requiere rol 'admin' EXCLUSIVAMENTE (no compras). Setea
--   approved_by + approved_at + sent_to_supplier_at = now()
-- ============================================================================

-- ─── 1. Enum value ────────────────────────────────────────────────────────
alter type po_status add value if not exists 'pending_signature' before 'sent';

-- ─── 2. submit_po_for_signature ───────────────────────────────────────────
create or replace function public.submit_po_for_signature(p_po_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_status public.po_status;
begin
  if not public.can_write_purchase(v_user) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;

  select organization_id, status into v_org, v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null;

  if v_org is null then
    raise exception 'OC no encontrada' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Sólo se puede pasar a firma una OC en borrador (estado actual: %)', v_status
      using errcode = 'P0001';
  end if;

  update public.purchase_orders
     set status = 'pending_signature',
         updated_at = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.submit_po_for_signature(uuid) from public;
grant execute on function public.submit_po_for_signature(uuid) to authenticated;

-- ─── 3. sign_po — exclusivo de admin ──────────────────────────────────────
create or replace function public.sign_po(p_po_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_org    uuid;
  v_status public.po_status;
begin
  -- Sólo admin firma — compras NO puede firmar lo que ella misma creó.
  select exists (
    select 1 from public.user_roles
     where user_id = v_user
       and revoked_at is null
       and role::text = 'admin'
  ) into v_is_admin;

  if not coalesce(v_is_admin, false) then
    raise exception 'Sólo un administrador puede firmar la OC' using errcode = '42501';
  end if;

  select organization_id, status into v_org, v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null;

  if v_org is null then
    raise exception 'OC no encontrada' using errcode = 'P0002';
  end if;
  if v_status <> 'pending_signature' then
    raise exception 'La OC no está pendiente de firma (estado actual: %)', v_status
      using errcode = 'P0001';
  end if;
  if v_org <> public.auth_org_id() then
    raise exception 'OC de otra organización' using errcode = '42501';
  end if;

  update public.purchase_orders
     set status               = 'sent',
         approved_by          = v_user,
         approved_at          = now(),
         sent_to_supplier_at  = now(),
         updated_at           = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.sign_po(uuid) from public;
grant execute on function public.sign_po(uuid) to authenticated;

-- ─── 4. reject_po_signature — opcional, regresa a draft ───────────────────
-- Admin puede rechazar la firma (devolver al status draft para que compras
-- la corrija).  Útil cuando hay algo mal y necesita ajuste antes de
-- firmarse.
create or replace function public.reject_po_signature(p_po_id uuid, p_reason text default null)
returns uuid
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
    raise exception 'Sólo un administrador puede rechazar la firma' using errcode = '42501';
  end if;

  select status into v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null;

  if v_status <> 'pending_signature' then
    raise exception 'La OC no está pendiente de firma' using errcode = 'P0001';
  end if;

  -- Note: p_reason is accepted for future use (cuando agreguemos columna
  -- notes a purchase_orders); por ahora la razón se pierde silenciosamente.
  -- El admin debe comunicarla por canal externo (Slack/email).
  update public.purchase_orders
     set status = 'draft',
         updated_at = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.reject_po_signature(uuid, text) from public;
grant execute on function public.reject_po_signature(uuid, text) to authenticated;
