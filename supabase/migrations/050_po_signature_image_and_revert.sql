-- ============================================================================
-- 050_po_signature_image_and_revert.sql
--
-- (a) Firma manuscrita: nueva columna signature_url en purchase_orders
--     para guardar el path en storage de la imagen PNG que dibuja el
--     admin dentro de la app.  Se renderiza en el PDF dentro de la caja
--     "Autorizado por".
-- (b) sign_po ahora acepta el path del signature como parámetro opcional.
-- (c) RPC nuevo revert_po_signature: admin puede deshacer una firma
--     ya emitida (sent → draft, limpia approved_by/approved_at/
--     signature_url/sent_to_supplier_at).
-- ============================================================================

alter table public.purchase_orders
  add column if not exists signature_url text;

comment on column public.purchase_orders.signature_url is
  'Storage path (bucket: cotizaciones) del PNG con la firma manuscrita del admin que aprobó la OC.';

-- ─── sign_po ahora acepta signature_url ───────────────────────────────────
create or replace function public.sign_po(
  p_po_id uuid,
  p_signature_url text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_org    uuid;
  v_status public.po_status;
begin
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
         signature_url        = p_signature_url,
         sent_to_supplier_at  = now(),
         updated_at           = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.sign_po(uuid, text) from public;
grant execute on function public.sign_po(uuid, text) to authenticated;

-- ─── revert_po_signature — admin deshace firma ────────────────────────────
-- Permite revertir el sent → draft si se firmó por error.  No aplica si la
-- OC ya tiene recepciones (status confirmed, partially_received, received,
-- closed) — en ese caso hay efecto secundario en inventario y necesita
-- cancelación formal.
create or replace function public.revert_po_signature(p_po_id uuid)
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
    raise exception 'Sólo un administrador puede revertir la firma' using errcode = '42501';
  end if;

  select status into v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null;

  if v_status is null then
    raise exception 'OC no encontrada' using errcode = 'P0002';
  end if;
  if v_status not in ('sent', 'confirmed') then
    raise exception 'No se puede revertir una OC en estado % (ya tiene movimientos de inventario o está cerrada)', v_status
      using errcode = 'P0001';
  end if;

  -- Si tiene recepciones, NO revertir.
  if exists (
    select 1 from public.receptions r
     where r.po_id = p_po_id
       and r.status in ('accepted', 'rejected_partial')
  ) then
    raise exception 'No se puede revertir una OC con recepciones registradas.'
      using errcode = 'P0001';
  end if;

  update public.purchase_orders
     set status               = 'draft',
         approved_by          = null,
         approved_at          = null,
         signature_url        = null,
         sent_to_supplier_at  = null,
         updated_at           = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.revert_po_signature(uuid) from public;
grant execute on function public.revert_po_signature(uuid) to authenticated;
