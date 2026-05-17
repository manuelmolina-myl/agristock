-- ============================================================================
-- 017_helper_functions.sql — Sprint 0 §3 cierre
-- Cross-cutting helpers used by every subsequent sprint:
--   - folio_sequences table + next_folio() function (centralised folio gen)
--   - currency_code domain (3-char ISO, MXN | USD)
-- ============================================================================

-- ─── 1. Folio sequences (per org × document_type × year) ───────────────────
create table if not exists public.folio_sequences (
  organization_id uuid not null references public.organizations(id),
  document_type   text not null,
  year            int  not null,
  last_number     int  not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, document_type, year)
);

comment on table public.folio_sequences is
  'Centralised sequential folio generator. One row per (org, doc_type, year). '
  'Updated atomically by next_folio() via INSERT ... ON CONFLICT DO UPDATE.';

-- ─── 2. Generic folio generator ────────────────────────────────────────────
-- Returns a string like "OC-2026-00001". Prefix depends on document_type:
--   requisition     → REQ
--   quotation       → COT
--   purchase_order  → OC
--   reception       → REC
--   work_order      → OT
--   fuel_dispensing → CMB
--   service_event   → SRV
--   anything else   → UPPER(document_type)
create or replace function public.next_folio(
  p_org  uuid,
  p_type text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year   int := extract(year from now())::int;
  v_n      int;
  v_prefix text;
begin
  insert into public.folio_sequences (organization_id, document_type, year, last_number)
    values (p_org, p_type, v_year, 1)
    on conflict (organization_id, document_type, year)
      do update set
        last_number = folio_sequences.last_number + 1,
        updated_at  = now()
    returning last_number into v_n;

  v_prefix := case p_type
    when 'requisition'      then 'REQ'
    when 'quotation'        then 'COT'
    when 'purchase_order'   then 'OC'
    when 'reception'        then 'REC'
    when 'work_order'       then 'OT'
    when 'fuel_dispensing'  then 'CMB'
    when 'service_event'    then 'SRV'
    else upper(p_type)
  end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_n::text, 5, '0'));
end;
$$;

revoke all on function public.next_folio(uuid, text) from public;
grant execute on function public.next_folio(uuid, text) to authenticated;

-- ─── 3. RLS on folio_sequences ─────────────────────────────────────────────
-- Reads allowed (frontend may want to preview "next folio"); writes only via
-- next_folio() RPC.  Direct INSERT/UPDATE blocked.
alter table public.folio_sequences enable row level security;

drop policy if exists folio_sequences_select on public.folio_sequences;
create policy folio_sequences_select on public.folio_sequences
  for select
  using (organization_id = public.auth_org_id());

-- No INSERT/UPDATE/DELETE policies → blocked for direct mutations.
-- next_folio() is SECURITY DEFINER so it can mutate.

-- ─── 4. Currency code domain ───────────────────────────────────────────────
do $$ begin
  create domain currency_code as char(3)
    check (value in ('MXN', 'USD'));
exception when duplicate_object then null; end $$;

comment on domain currency_code is
  'ISO 4217 currency code constrained to MXN | USD. Use for all monetary '
  'columns in new tables.';
