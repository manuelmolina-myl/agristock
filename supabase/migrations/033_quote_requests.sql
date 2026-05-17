-- ============================================================================
-- 033_quote_requests.sql — "Solicitar cotización a proveedor"
--
-- Until now the procurement flow jumped straight from approved requisition to
-- a manually-entered `quotations` row (with prices). There was no audit trail
-- of *which* suppliers Compras reached out to, *when*, or *who declined*.
--
-- This migration adds a lightweight outreach record:
--   purchase_request_quotes (one row per supplier×requisition outreach)
--
-- An eventual "received" outreach is linked one-to-one with a `quotations`
-- row when Compras captures the prices the supplier sent back (we expose a
-- nullable FK `quotation_id` for that future bridge). For now, the comparator
-- just surfaces "pending" outreach so the operator knows which suppliers were
-- asked but haven't responded yet.
--
-- Design choice — separate table vs extending `quotations`:
--   Extending would require making `quotations.folio` nullable and adding
--   `status='pending_response'` to a status enum that today implies
--   prices-have-been-captured. That dilutes the semantics of `quotations`,
--   which is a heavyweight entity with required folio + lines. Outreach
--   records are far lighter (~7 fields, no lines) and many can exist without
--   ever resulting in a quotations row (declined, expired, ghosted).
--   We therefore keep them separate.
-- ============================================================================

-- ─── Outreach status ────────────────────────────────────────────────────────
-- Note: we use a CHECK on a text column (not a Postgres enum) so future
-- statuses can be added without an ALTER TYPE that locks the table.
-- Allowed values:
--   pending     -- outreach sent, awaiting response
--   responded   -- supplier sent back a quotation (quotation_id is set)
--   declined    -- supplier explicitly declined to quote
--   expired     -- considered stale; the system does NOT auto-expire (no
--                  cron) — Compras flips this manually when relevant.
--
-- IMPORTANT: "expired" requires a TTL we'd implement via a scheduled job.
-- Today there is no such job, so rows stay 'pending' indefinitely. This
-- matches existing UX where outreach state is meaningful but not enforced.

-- ─── Table ──────────────────────────────────────────────────────────────────
create table if not exists public.purchase_request_quotes (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  purchase_request_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  supplier_id         uuid not null references public.suppliers(id),
  requested_by        uuid not null references auth.users(id),
  requested_at        timestamptz not null default now(),
  responded_at        timestamptz,
  status              text not null default 'pending'
                        check (status in ('pending', 'responded', 'declined', 'expired')),
  notes               text,
  quotation_id        uuid references public.quotations(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  -- One outreach per supplier per requisition. Compras can re-trigger by
  -- changing the status, not by spamming the supplier.
  unique (purchase_request_id, supplier_id)
);

create index if not exists idx_prq_request
  on public.purchase_request_quotes(purchase_request_id);
create index if not exists idx_prq_supplier
  on public.purchase_request_quotes(supplier_id);
create index if not exists idx_prq_org_status
  on public.purchase_request_quotes(organization_id, status);

create trigger trg_prq_updated_at
  before update on public.purchase_request_quotes
  for each row execute function public.fn_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.purchase_request_quotes enable row level security;

-- Read: anyone in the org can read (transparency for almacenista who created
-- the requisition).
drop policy if exists prq_select on public.purchase_request_quotes;
create policy prq_select on public.purchase_request_quotes for select
  using (organization_id = public.auth_org_id());

-- Write: only roles that can drive purchasing (admin / coord_compras / etc.)
drop policy if exists prq_write on public.purchase_request_quotes;
create policy prq_write on public.purchase_request_quotes for all
  using (
    organization_id = public.auth_org_id()
    and public.can_write_purchase(auth.uid())
  )
  with check (
    organization_id = public.auth_org_id()
    and public.can_write_purchase(auth.uid())
  );

-- ─── Audit trigger (reuse audit_simple_catalog) ─────────────────────────────
drop trigger if exists trg_audit_prq on public.purchase_request_quotes;
create trigger trg_audit_prq
  after insert or update or delete on public.purchase_request_quotes
  for each row execute function public.audit_simple_catalog();

-- ─── RPC: create_quote_requests ─────────────────────────────────────────────
-- Inserts one outreach row per supplier in a single transaction. Skips
-- suppliers that already have an outreach for this requisition (idempotent).
-- Returns the rows that were actually inserted.
create or replace function public.create_quote_requests(
  p_request_id  uuid,
  p_supplier_ids uuid[],
  p_notes       text default null
)
returns setof public.purchase_request_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_status requisition_status;
begin
  if p_supplier_ids is null or array_length(p_supplier_ids, 1) is null then
    raise exception 'Selecciona al menos un proveedor' using errcode = '22023';
  end if;

  -- Authorization: must be allowed to drive purchasing.
  if not public.can_write_purchase(v_user) then
    raise exception 'No autorizado para solicitar cotizaciones' using errcode = '42501';
  end if;

  -- Validate the requisition exists, is in the user's org, and is in a state
  -- where soliciting quotes makes sense.
  select organization_id, status
    into v_org, v_status
    from public.purchase_requisitions
   where id = p_request_id
     and deleted_at is null
   for update;

  if v_org is null then
    raise exception 'Requisición no encontrada' using errcode = 'P0002';
  end if;
  if v_org <> public.auth_org_id() then
    raise exception 'Requisición fuera de tu organización' using errcode = '42501';
  end if;
  if v_status not in ('submitted', 'in_quotation', 'approved') then
    raise exception 'No se pueden pedir cotizaciones en estado %', v_status;
  end if;

  -- If the requisition was 'submitted', flip it to 'in_quotation' to surface
  -- the new phase in the UI. 'approved' stays as-is (operator may want to
  -- shop around even after approval).
  if v_status = 'submitted' then
    update public.purchase_requisitions
       set status = 'in_quotation'
     where id = p_request_id;
  end if;

  -- Insert one row per supplier; skip duplicates via the unique constraint.
  return query
    insert into public.purchase_request_quotes (
      organization_id, purchase_request_id, supplier_id,
      requested_by, requested_at, status, notes
    )
    select v_org, p_request_id, s_id, v_user, now(), 'pending', p_notes
      from unnest(p_supplier_ids) as s_id
     where exists (
       select 1 from public.suppliers
        where id = s_id
          and organization_id = v_org
          and deleted_at is null
     )
    on conflict (purchase_request_id, supplier_id) do nothing
    returning *;
end;
$$;

revoke all on function public.create_quote_requests(uuid, uuid[], text) from public;
grant execute on function public.create_quote_requests(uuid, uuid[], text) to authenticated;

comment on table public.purchase_request_quotes is
  'Outreach log: which suppliers were asked to quote a given requisition, and what happened.';
comment on function public.create_quote_requests(uuid, uuid[], text) is
  'Bulk-creates pending quote-request rows for the given suppliers on a requisition. Idempotent: re-asking the same supplier is a no-op.';
