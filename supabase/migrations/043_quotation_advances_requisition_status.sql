-- ============================================================================
-- 043_quotation_advances_requisition_status.sql
--
-- Cuando se inserta una cotización contra una requisición en status
-- 'submitted', el status del parent debe avanzar automáticamente a
-- 'in_quotation'.  Antes el avance sólo ocurría en la RPC de outreach
-- (purchase_request_quotes), que ya no usamos.
--
-- Reglas:
--   - submitted  → in_quotation   (cuando aparece la 1ra cotización)
--   - approved sigue siendo aprobado (operador ya decidió pre-cotizaciones)
--   - po_generated, cancelled, rejected: no se tocan (estados terminales)
-- ============================================================================

create or replace function public.fn_advance_req_on_quotation()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.purchase_requisitions
     set status = 'in_quotation',
         updated_at = now()
   where id = new.requisition_id
     and status = 'submitted';
  return new;
end;
$$;

drop trigger if exists trg_advance_req_on_quotation on public.quotations;
create trigger trg_advance_req_on_quotation
  after insert on public.quotations
  for each row
  execute function public.fn_advance_req_on_quotation();

-- Catch-up: requisiciones que ya tienen cotizaciones pero quedaron en
-- 'submitted' (datos pre-trigger) — avanzar ahora.
update public.purchase_requisitions pr
   set status = 'in_quotation',
       updated_at = now()
 where pr.status = 'submitted'
   and exists (
     select 1 from public.quotations q
      where q.requisition_id = pr.id
   );
