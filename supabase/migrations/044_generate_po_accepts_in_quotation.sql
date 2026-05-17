-- ============================================================================
-- 044_generate_po_accepts_in_quotation.sql
--
-- Síntoma: 400 al hacer "Elegir" en el comparator de cotizaciones.
-- Error real (oculto en el toast): "Requisition not found or not approved".
--
-- Causa: la RPC generate_po_from_requisition exige
--   status = 'approved'
-- pero el trigger nuevo (migración 043) avanza la requisición de
--   submitted → in_quotation
-- en cuanto se inserta la primera cotización.  En este nuevo flujo
-- (compras hace todo el ciclo sin un paso de "aprobación" formal),
-- el operador genera la OC directamente desde in_quotation.
--
-- Fix: relajar el status check para aceptar AMBOS 'approved' y
-- 'in_quotation' como puntos válidos de commit a OC.  También se
-- mejora el manejo de ítems no catalogados: en vez de fallar mudo
-- (po_lines.item_id es NOT NULL), levantar una excepción explícita
-- para que el operador sepa qué hacer.
-- ============================================================================

create or replace function public.generate_po_from_requisition(
  p_requisition_id uuid,
  p_supplier_id    uuid,
  p_quotation_id   uuid default null,
  p_warehouse_id   uuid default null,
  p_expected_date  date default null,
  p_payment_terms  text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user            uuid := auth.uid();
  v_org             uuid;
  v_status          public.requisition_status;
  v_folio           text;
  v_po_id           uuid;
  v_subtotal_mxn    numeric := 0;
  v_tax_mxn         numeric := 0;
  v_fx              numeric;
  v_free_count      int;
begin
  if not public.can_write_purchase(v_user) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Validate requisition + capture its status (we accept either of two phases).
  select organization_id, status into v_org, v_status
    from public.purchase_requisitions
   where id = p_requisition_id
     and deleted_at is null;

  if v_org is null then
    raise exception 'La requisición no existe o fue eliminada' using errcode = 'P0002';
  end if;
  if v_status not in ('approved', 'in_quotation') then
    raise exception 'Sólo se puede generar OC desde una requisición en cotización o aprobada (estado actual: %)', v_status
      using errcode = 'P0001';
  end if;

  -- Detect free-description lines.  po_lines.item_id is NOT NULL — no se
  -- puede generar una OC con ítems sin catalogar.  Mejor avisar claro.
  if p_quotation_id is not null then
    select count(*) into v_free_count
      from public.quotation_lines ql
      join public.requisition_lines rl on rl.id = ql.requisition_line_id
     where ql.quotation_id = p_quotation_id
       and rl.item_id is null;
  else
    select count(*) into v_free_count
      from public.requisition_lines rl
     where rl.requisition_id = p_requisition_id
       and rl.item_id is null;
  end if;
  if v_free_count > 0 then
    raise exception 'La requisición tiene % línea(s) de ítem no catalogado. Crea esos ítems en el inventario antes de generar la OC.', v_free_count
      using errcode = 'P0001';
  end if;

  v_folio := public.next_folio(v_org, 'purchase_order');

  -- Latest USD/MXN rate for MXN-equivalent totals.
  select rate into v_fx
    from public.fx_rates
   where organization_id = v_org
     and date <= current_date
     and currency_from = 'USD'
     and currency_to   = 'MXN'
   order by date desc, created_at desc
   limit 1;

  insert into public.purchase_orders (
    organization_id, folio, supplier_id, quotation_id, requisition_id,
    issue_date, expected_delivery_date, payment_terms,
    destination_warehouse_id, fx_rate, status, created_by
  ) values (
    v_org, v_folio, p_supplier_id, p_quotation_id, p_requisition_id,
    current_date, p_expected_date, p_payment_terms,
    p_warehouse_id, v_fx, 'draft', v_user
  ) returning id into v_po_id;

  if p_quotation_id is not null then
    insert into public.po_lines (po_id, item_id, quantity, unit_cost, currency, tax_pct)
    select v_po_id, rl.item_id, rl.quantity, ql.unit_cost, ql.currency, ql.tax_pct
      from public.quotation_lines ql
      join public.requisition_lines rl on rl.id = ql.requisition_line_id
     where ql.quotation_id = p_quotation_id
       and rl.item_id is not null;
  else
    insert into public.po_lines (po_id, item_id, quantity, unit_cost, currency, tax_pct)
    select v_po_id, rl.item_id, rl.quantity,
           coalesce(rl.estimated_unit_cost, 0),
           coalesce(rl.currency, 'MXN'::currency_code),
           16
      from public.requisition_lines rl
     where rl.requisition_id = p_requisition_id
       and rl.item_id is not null;
  end if;

  select coalesce(sum(
           case when currency = 'MXN' then quantity * unit_cost
                when currency = 'USD' then quantity * unit_cost * coalesce(v_fx, 1)
                else 0 end
         ), 0)
    into v_subtotal_mxn
    from public.po_lines where po_id = v_po_id;

  v_tax_mxn := round(v_subtotal_mxn * 0.16, 4);

  update public.purchase_orders
     set subtotal_mxn = v_subtotal_mxn,
         tax_mxn      = v_tax_mxn,
         total_mxn    = v_subtotal_mxn + v_tax_mxn
   where id = v_po_id;

  update public.purchase_requisitions
     set status = 'po_generated',
         updated_at = now()
   where id = p_requisition_id;

  return v_po_id;
end;
$$;

revoke all on function public.generate_po_from_requisition(uuid, uuid, uuid, uuid, date, text) from public;
grant execute on function public.generate_po_from_requisition(uuid, uuid, uuid, uuid, date, text) to authenticated;
