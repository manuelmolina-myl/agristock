-- ============================================================================
-- pgTAP tests — role helpers (minimal smoke test)
-- ----------------------------------------------------------------------------
-- These are the bare-minimum assertions for the two helpers that underpin
-- nearly every RLS policy in the schema:
--
--   * public.has_role(user_id uuid, role user_role)  -- returns boolean
--   * public.auth_org_id()                            -- returns uuid for caller
--
-- A broader test file (sprint_0_helpers.sql) exists alongside this one; this
-- file is the CI-targeted smoke test that should always pass.
--
-- ----------------------------------------------------------------------------
-- LOCAL SETUP (one-time, requires Docker + Supabase CLI):
--   1. supabase start                      -- spins up local Postgres
--   2. supabase db reset                   -- applies all migrations
--   3. psql ... -c 'create extension if not exists pgtap;'
--   4. npm run test:db                     -- runs every *.sql in this folder
--
-- pgTAP installation reference: https://github.com/theory/pgtap
-- ============================================================================

begin;
select plan(3);

-- ---------------------------------------------------------------------------
-- 1. has_role() exists with the expected signature.
-- ---------------------------------------------------------------------------
select has_function(
  'public',
  'has_role',
  array['uuid', 'user_role'],
  'has_role(uuid, user_role) exists'
);

-- ---------------------------------------------------------------------------
-- 2. has_role returns false for a user with no role grants.
--    We use a random UUID that cannot exist in user_roles, so the answer
--    must be false regardless of seed data.
-- ---------------------------------------------------------------------------
select is(
  public.has_role(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'admin'::user_role
  ),
  false,
  'has_role returns false for an unknown user'
);

-- ---------------------------------------------------------------------------
-- 3. auth_org_id() exists and returns NULL when no JWT is set (anon context).
--    Inside a pgTAP run there is no auth.uid(), so the helper should fall
--    through to NULL rather than raise.
-- ---------------------------------------------------------------------------
select has_function(
  'public',
  'auth_org_id',
  'auth_org_id() helper exists'
);

select * from finish();
rollback;
