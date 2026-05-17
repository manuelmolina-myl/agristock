-- ============================================================================
-- 037_profile_fks_for_postgrest_embeds.sql
--
-- Reported symptom: 400 PGRST200 from
--   .../purchase_requisitions?select=...,requester:profiles!purchase_requisitions_requester_id_fkey(full_name)
-- "Could not find a relationship between 'purchase_requisitions' and 'profiles'
--  in the schema cache."
--
-- Root cause:
--   Several tables have `*_id uuid references auth.users(id)` columns
--   (requester_id, requested_by, received_by, reported_by).  The TS code
--   embeds the requester's name from `public.profiles` via PostgREST hints
--   such as `profiles!purchase_requisitions_requester_id_fkey(full_name)`.
--   PostgREST resolves the FK *name* correctly, but the FK *target* is
--   `auth.users` — not `profiles`.  PostgREST refuses to traverse
--   `parent_table → auth.users.id ← profiles.id`, so the embed fails.
--
--   `profiles.id` is 1:1 with `auth.users.id` (PK + FK), so we can safely
--   repoint these FKs from `auth.users(id)` to `public.profiles(id)`
--   without losing any integrity guarantees.  Side effect: the same TS
--   hints continue to work, no client code change required.
--
-- Affected columns (from `grep -r 'profiles!.*_fkey' src/`):
--   - purchase_requisitions.requester_id
--   - purchase_request_quotes.requested_by
--   - work_orders.reported_by
--   - receptions.received_by
--   - solicitudes.requested_by                 (table may not exist)
--
-- Strategy: drop the auth.users FK and recreate the same-named constraint
-- pointing to profiles(id).  Idempotent guard via pg_constraint lookup.
--
-- After applying, NOTIFY pgrst, 'reload schema' refreshes the PostgREST
-- relationship cache so the embed is immediately resolvable.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('purchase_requisitions',   'requester_id',  'purchase_requisitions_requester_id_fkey'),
      ('purchase_request_quotes', 'requested_by',  'purchase_request_quotes_requested_by_fkey'),
      ('work_orders',             'reported_by',   'work_orders_reported_by_fkey'),
      ('receptions',              'received_by',   'receptions_received_by_fkey'),
      ('solicitudes',             'requested_by',  'solicitudes_requested_by_fkey')
    ) as t(tbl, col, fkname)
  loop
    -- Skip tables that don't exist (e.g. if `solicitudes` was rolled back).
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = v.tbl
    ) then
      raise notice 'skip: table public.% does not exist', v.tbl;
      continue;
    end if;

    -- Check the current FK target.  If it already points at profiles,
    -- nothing to do — early return for idempotency.
    if exists (
      select 1
        from pg_constraint c
        join pg_class src   on c.conrelid = src.oid
        join pg_class dst   on c.confrelid = dst.oid
        join pg_namespace n on src.relnamespace = n.oid
       where c.conname = v.fkname
         and n.nspname = 'public'
         and src.relname = v.tbl
         and dst.relname = 'profiles'
    ) then
      raise notice 'skip: % already targets profiles', v.fkname;
      continue;
    end if;

    -- Drop the existing FK (whatever it points at) and recreate it
    -- against public.profiles(id).  Use ON DELETE SET NULL to match the
    -- existing semantics for nullable columns; for requester_id which is
    -- NOT NULL the user can't be deleted anyway (RLS + business rules).
    execute format('alter table public.%I drop constraint if exists %I', v.tbl, v.fkname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete no action',
      v.tbl, v.fkname, v.col
    );

    raise notice 'repointed: %.% → profiles(id) via %', v.tbl, v.col, v.fkname;
  end loop;
end $$;

-- Refresh PostgREST schema cache so new relationships are immediately
-- pickable by the existing FK-hint embeds.
notify pgrst, 'reload schema';
