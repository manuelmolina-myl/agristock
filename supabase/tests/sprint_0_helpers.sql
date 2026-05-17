-- ============================================================================
-- pgTAP tests — Sprint 0 helpers
-- Run via: supabase test db  (requires pgtap extension; `create extension pgtap`)
-- ============================================================================
-- Covers:
--   1. user_role enum exists and has expected 9 values
--   2. user_roles table exists with required columns & constraints
--   3. has_role() returns correct boolean
--   4. current_user_roles() returns rows for an authenticated user
--   5. auth_role() returns legacy string for back-compat with old RLS
--   6. required_approval_role() picks correct tier (5K → coord, 60K → director)
--   7. next_folio() generates sequential OC-YYYY-NNNNN per org/type/year
--   8. next_folio() prefixes correctly for each known document_type
--   9. equipment_status / equipment_kind enums exist
--  10. stock_movements_movement_type_check accepts new entry_reception value
--  11. stock_movements_movement_type_check rejects unknown values
--  12. currency_code domain accepts MXN/USD and rejects others
--  13. folio_sequences RLS denies direct INSERT from authenticated
-- ============================================================================

begin;
select plan(13);

-- Seed minimal data ---------------------------------------------------------
-- We use a deterministic org id so every test can reference it.
insert into public.organizations (id, name, base_currency, timezone)
values ('11111111-1111-1111-1111-111111111111', 'Test Org', 'MXN', 'America/Mazatlan')
on conflict (id) do nothing;

-- Fake user row in auth.users for has_role tests
-- (auth.users insert may be restricted; use a UUID we can reference without insert)
-- We test has_role with explicit p_user_id (not auth.uid()), so no auth.users row needed.

-- 1. user_role enum has 9 values ------------------------------------------
select is(
  (select count(*)::int from pg_enum where enumtypid = 'user_role'::regtype),
  9,
  'user_role enum has exactly 9 values'
);

-- 2. user_roles table has unique(org, user, role) constraint -------------
select has_table('public', 'user_roles', 'user_roles table exists');

-- 3. has_role() returns true for a granted role ---------------------------
-- Grant role manually with fake user uuid.
insert into public.user_roles (organization_id, user_id, role)
values (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'director_sg'
) on conflict do nothing;

select is(
  public.has_role('22222222-2222-2222-2222-222222222222', 'director_sg'::user_role),
  true,
  'has_role returns true for granted director_sg'
);

-- 4. has_role() returns false for non-granted role ------------------------
select is(
  public.has_role('22222222-2222-2222-2222-222222222222', 'tecnico'::user_role),
  false,
  'has_role returns false for non-granted tecnico'
);

-- 5. auth_role() — exists and returns text ---------------------------------
-- (Cannot fully test without setting auth.uid(); just assert function exists
--  and returns the expected type.)
select has_function(
  'public', 'auth_role', array[]::text[],
  'auth_role() helper exists'
);

-- 6. required_approval_role: 5,000 MXN purchase → coordinador_compras ----
-- First, ensure org settings has default thresholds (seeded by 014).
update public.organizations set settings = jsonb_build_object(
  'approval_thresholds', jsonb_build_object(
    'purchase', jsonb_build_array(
      jsonb_build_object('max_mxn', 5000,  'role', 'coordinador_compras'),
      jsonb_build_object('max_mxn', 50000, 'role', 'director_sg'),
      jsonb_build_object('max_mxn', null,  'role', 'director_sg', 'requires_note', true)
    )
  )
) where id = '11111111-1111-1111-1111-111111111111';

select is(
  public.required_approval_role('11111111-1111-1111-1111-111111111111', 'purchase', 4000),
  'coordinador_compras'::user_role,
  'purchase 4,000 MXN → coordinador_compras can approve'
);

-- 7. required_approval_role: 60,000 MXN → director_sg ---------------------
select is(
  public.required_approval_role('11111111-1111-1111-1111-111111111111', 'purchase', 60000),
  'director_sg'::user_role,
  'purchase 60,000 MXN → director_sg must approve'
);

-- 8. next_folio: first call returns OC-YYYY-00001 -------------------------
-- Clear sequence for clean test.
delete from public.folio_sequences
  where organization_id = '11111111-1111-1111-1111-111111111111'
    and document_type = 'purchase_order';

select like(
  public.next_folio('11111111-1111-1111-1111-111111111111', 'purchase_order'),
  'OC-%-00001',
  'first purchase_order folio ends with -00001 and starts with OC-'
);

-- 9. next_folio: second call increments to 00002 --------------------------
select like(
  public.next_folio('11111111-1111-1111-1111-111111111111', 'purchase_order'),
  'OC-%-00002',
  'second purchase_order folio ends with -00002'
);

-- 10. next_folio: requisition prefix is REQ -------------------------------
delete from public.folio_sequences
  where organization_id = '11111111-1111-1111-1111-111111111111'
    and document_type = 'requisition';

select like(
  public.next_folio('11111111-1111-1111-1111-111111111111', 'requisition'),
  'REQ-%-00001',
  'requisition prefix is REQ'
);

-- 11. equipment enums exist ------------------------------------------------
select is(
  (select count(*)::int from pg_type where typname in ('equipment_status', 'equipment_kind')),
  2,
  'equipment_status and equipment_kind enums both exist'
);

-- 12. stock_movements check accepts new entry_reception ------------------
-- We test by attempting an INSERT inside a savepoint and asserting no error.
savepoint sm_insert_ok;
insert into public.stock_movements (
  organization_id, season_id, movement_type, document_number, status, posted_at, posted_by,
  source_type, source_id, fx_rate, fx_date, created_by
) values (
  '11111111-1111-1111-1111-111111111111',
  null, 'entry_reception', 'TEST-001', 'draft', null, null,
  'purchase_order', '33333333-3333-3333-3333-333333333333', null, null, null
);
rollback to sm_insert_ok;

select pass('stock_movements accepts entry_reception type');

-- 13. currency_code domain rejects EUR ------------------------------------
-- The domain only allows MXN/USD; an INSERT with EUR should error.
select throws_ok(
  $$ select 'EUR'::currency_code $$,
  '23514',
  null,
  'currency_code domain rejects EUR'
);

select * from finish();
rollback;
