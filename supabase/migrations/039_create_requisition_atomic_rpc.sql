-- ============================================================================
-- 039_create_requisition_atomic_rpc.sql
--
-- Problema: el cliente actual (`useCreateRequisition`) hace dos inserts
-- separados (parent + lines) que NO son atómicos en Supabase REST.  Si el
-- segundo falla (RLS, validation, etc.) el parent queda huérfano con cero
-- líneas, rompiendo el comparador y el dashboard counter.
--
-- Fix: RPC `create_requisition` que recibe el payload completo y hace
-- ambos inserts dentro de una transacción.  El cliente lo invoca via
-- supabase.rpc(...) y obtiene rollback automático si cualquier paso falla.
--
-- Adicionalmente: limpieza de requisiciones huérfanas (cero líneas) que
-- quedaron del bug histórico — si están aún en draft/submitted y tienen
-- 0 lines, se soft-deletean (deleted_at = now).  Conservamos las que ya
-- avanzaron a otros status por si tuvieran lines borradas por separado.
-- ============================================================================

create or replace function public.create_requisition(
  p_input jsonb
) returns public.purchase_requisitions
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_org           uuid := public.auth_org_id();
  v_user          uuid := auth.uid();
  v_folio         text;
  v_estimated     numeric(18,4) := 0;
  v_line          jsonb;
  v_req           public.purchase_requisitions;
begin
  if v_org is null or v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Validate at least one line.
  if jsonb_typeof(p_input->'lines') <> 'array' or jsonb_array_length(p_input->'lines') = 0 then
    raise exception 'La requisición debe tener al menos una línea' using errcode = 'P0001';
  end if;

  -- Generate folio.
  select public.next_folio(v_org, 'requisition') into v_folio;

  -- Compute estimated total (MXN; USD is left at-face for approximation).
  for v_line in select * from jsonb_array_elements(p_input->'lines') loop
    v_estimated := v_estimated +
      coalesce((v_line->>'estimated_unit_cost')::numeric, 0) *
      coalesce((v_line->>'quantity')::numeric, 0);
  end loop;

  -- Insert parent.
  insert into public.purchase_requisitions (
    organization_id, folio, requester_id, priority, justification,
    crop_lot_id, equipment_id, notes, estimated_total_mxn, status
  )
  values (
    v_org,
    v_folio,
    v_user,
    coalesce(p_input->>'priority', 'medium')::requisition_priority,
    p_input->>'justification',
    nullif(p_input->>'crop_lot_id', '')::uuid,
    nullif(p_input->>'equipment_id', '')::uuid,
    p_input->>'notes',
    nullif(v_estimated, 0),
    'submitted'
  )
  returning * into v_req;

  -- Insert lines.  If any line fails, the whole transaction rolls back.
  insert into public.requisition_lines (
    requisition_id, item_id, free_description, quantity, unit_id,
    estimated_unit_cost, currency, notes
  )
  select
    v_req.id,
    nullif(l->>'item_id', '')::uuid,
    case when nullif(l->>'item_id', '') is null then l->>'free_description' else null end,
    (l->>'quantity')::numeric,
    nullif(l->>'unit_id', '')::uuid,
    nullif(l->>'estimated_unit_cost', '')::numeric,
    coalesce(l->>'currency', 'MXN')::currency_code,
    l->>'notes'
  from jsonb_array_elements(p_input->'lines') l;

  return v_req;
end;
$$;

revoke all on function public.create_requisition(jsonb) from public;
grant execute on function public.create_requisition(jsonb) to authenticated;

comment on function public.create_requisition(jsonb) is
  'Atomic creation of a purchase requisition + lines.  Replaces the two-step client mutation that was leaving parents orphaned on RLS failures.  Rolls back the entire operation if any line insert fails.';

-- ─── Cleanup históricos huérfanos ──────────────────────────────────────────
-- Soft-delete requisiciones que tengan 0 líneas Y estén en estados tempranos
-- (draft, submitted) — son producto del bug pre-036.  Las que avanzaron a
-- in_quotation/approved/po_generated quedan tal cual: si tenían lines que
-- alguien borró por separado, eso es otro tipo de problema.
update public.purchase_requisitions pr
   set deleted_at = now()
 where pr.deleted_at is null
   and pr.status in ('draft', 'submitted')
   and not exists (
     select 1 from public.requisition_lines rl
      where rl.requisition_id = pr.id
   );
