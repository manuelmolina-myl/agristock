-- ============================================================================
-- 046_org_update_policy_and_replace_po_quotation.sql
--
-- Dos bugs distintos en un solo migration porque ambos requieren cambios
-- de RLS y aprovechamos el push.
--
-- 1. LOGO QUE DESAPARECE
--    La policy "Super admins can update their organization" (creada en
--    migración 001) exige auth_role() = 'super_admin'.  Después de
--    normalizar roles en 024 → 'admin' y en 040 → renames legacy, ningún
--    usuario tiene 'super_admin' en profiles.role.  Resultado: el UPDATE
--    de logo_url no afecta ninguna fila (Supabase no lanza error en
--    0-row updates), refreshOrganization re-lee el null original y el
--    logo "desaparece".
--
--    Fix: reemplazar policy para aceptar 'admin' (que es el role canónico
--    para admins de org hoy).  También aceptamos 'super_admin' por si
--    aparece en el futuro plataform-wide.
--
-- 2. CAMBIAR COTIZACIÓN GANADORA NO ACTUALIZA LA OC
--    Cuando el usuario genera una OC desde la cotización A y luego elige
--    la cotización B como ganadora, sólo cambian los status en la tabla
--    quotations; la OC sigue con las líneas y precios de A.
--
--    Fix: RPC replace_po_quotation(p_po_id, p_quotation_id) que:
--    - Valida que la OC esté en status 'draft' (no se modifican OCs ya
--      enviadas/recibidas — el cliente debe cancelar primero)
--    - Marca el nuevo quotation como 'selected' y el resto del lote como
--      'discarded'
--    - Borra las po_lines existentes y las recrea desde la cotización nueva
--    - Recalcula subtotal/IVA/total en MXN usando el FX más reciente
--    - Actualiza el supplier_id, quotation_id y payment_terms de la OC
-- ============================================================================

-- ─── 1. Org UPDATE policy ──────────────────────────────────────────────────
drop policy if exists "Super admins can update their organization" on public.organizations;
create policy "Org admins can update their organization"
  on public.organizations
  for update to authenticated
  using (
    id = public.auth_org_id()
    and exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.organization_id = id
         and ur.revoked_at is null
         and ur.role::text in ('admin', 'super_admin')
    )
  )
  with check (
    id = public.auth_org_id()
    and exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.organization_id = id
         and ur.revoked_at is null
         and ur.role::text in ('admin', 'super_admin')
    )
  );

-- ─── 2. replace_po_quotation RPC ───────────────────────────────────────────
create or replace function public.replace_po_quotation(
  p_po_id        uuid,
  p_quotation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := auth.uid();
  v_org         uuid;
  v_req_id      uuid;
  v_supplier    uuid;
  v_pay_terms   text;
  v_status      public.po_status;
  v_subtotal    numeric := 0;
  v_tax         numeric := 0;
  v_fx          numeric;
begin
  if not public.can_write_purchase(v_user) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;

  -- Load PO + validate status.
  select organization_id, requisition_id, status
    into v_org, v_req_id, v_status
    from public.purchase_orders
   where id = p_po_id
     and deleted_at is null;

  if v_org is null then
    raise exception 'OC no encontrada' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Sólo se puede cambiar la cotización de una OC en borrador (estado actual: %)', v_status
      using errcode = 'P0001';
  end if;

  -- Validate quotation belongs to the same requisition + org.
  select supplier_id, payment_terms
    into v_supplier, v_pay_terms
    from public.quotations
   where id = p_quotation_id
     and requisition_id = v_req_id
     and organization_id = v_org;

  if v_supplier is null then
    raise exception 'La cotización no pertenece a esta requisición' using errcode = 'P0001';
  end if;

  -- Verify it has at least one quotable line (no free-description items
  -- — same defensive check as generate_po_from_requisition).
  if exists (
    select 1 from public.quotation_lines ql
      join public.requisition_lines rl on rl.id = ql.requisition_line_id
     where ql.quotation_id = p_quotation_id
       and rl.item_id is null
  ) then
    raise exception 'La cotización incluye ítems no catalogados. Crea esos ítems antes de regenerar la OC.'
      using errcode = 'P0001';
  end if;

  -- Mark this quotation as selected and discard siblings.
  update public.quotations
     set status = case when id = p_quotation_id then 'selected' else 'discarded' end
   where requisition_id = v_req_id;

  -- Wipe existing PO lines.
  delete from public.po_lines where po_id = p_po_id;

  -- Insert fresh lines from the new quotation.
  insert into public.po_lines (po_id, item_id, quantity, unit_cost, currency, tax_pct)
  select p_po_id, rl.item_id, rl.quantity, ql.unit_cost, ql.currency, ql.tax_pct
    from public.quotation_lines ql
    join public.requisition_lines rl on rl.id = ql.requisition_line_id
   where ql.quotation_id = p_quotation_id
     and rl.item_id is not null;

  -- Latest FX rate for MXN-equivalent totals.
  select rate into v_fx
    from public.fx_rates
   where organization_id = v_org
     and date <= current_date
     and currency_from = 'USD'
     and currency_to   = 'MXN'
   order by date desc, created_at desc
   limit 1;

  select coalesce(sum(
           case when currency = 'MXN' then quantity * unit_cost
                when currency = 'USD' then quantity * unit_cost * coalesce(v_fx, 1)
                else 0 end
         ), 0)
    into v_subtotal
    from public.po_lines
   where po_id = p_po_id;

  v_tax := round(v_subtotal * 0.16, 4);

  update public.purchase_orders
     set supplier_id   = v_supplier,
         quotation_id  = p_quotation_id,
         payment_terms = v_pay_terms,
         fx_rate       = v_fx,
         subtotal_mxn  = v_subtotal,
         tax_mxn       = v_tax,
         total_mxn     = v_subtotal + v_tax,
         updated_at    = now()
   where id = p_po_id;

  return p_po_id;
end;
$$;

revoke all on function public.replace_po_quotation(uuid, uuid) from public;
grant execute on function public.replace_po_quotation(uuid, uuid) to authenticated;
