-- ============================================================================
-- 027_supplier_currencies_multi.sql
--
-- Suppliers can transact in MXN, USD, or both (some import from US and also
-- bill locally). The schema enforced a single currency via
--   default_currency char(3) check (... in ('MXN','USD'))
-- which forced operators to duplicate suppliers or pick the wrong code.
--
-- This migration:
--   1. Adds `currencies char(3)[]` containing every currency the supplier
--      accepts.  At least one must be present.
--   2. Backfills from the existing `default_currency`.
--   3. Keeps `default_currency` as the *preferred* currency (used to
--      pre-select the dropdown when creating a quotation/PO) — value must
--      now be present in `currencies`.
--   4. Adds a CHECK and a small trigger to keep `default_currency` ∈ `currencies`.
-- ============================================================================

-- 1. Add the array column.
alter table public.suppliers
  add column if not exists currencies char(3)[] not null default array['MXN']::char(3)[];

-- 2. Backfill from default_currency where the row still has the seed default.
update public.suppliers
   set currencies = array[default_currency]::char(3)[]
 where (currencies is null or currencies = array['MXN']::char(3)[])
   and default_currency is not null;

-- 3. Constraints.
-- 3a. Allowed values inside the array.
do $$ begin
  alter table public.suppliers
    add constraint suppliers_currencies_values_check
    check (
      array_length(currencies, 1) >= 1
      and currencies <@ array['MXN','USD']::char(3)[]
    );
exception when duplicate_object then null;
end $$;

-- 3b. default_currency, if set, must be a member of currencies.
create or replace function public.fn_supplier_default_currency_check()
returns trigger
language plpgsql
as $$
begin
  if new.default_currency is not null
     and new.currencies is not null
     and not (new.default_currency = any(new.currencies)) then
    -- Auto-correct rather than reject so legacy clients keep working.
    new.default_currency := new.currencies[1];
  end if;
  -- Empty currencies array — default to whichever default_currency holds, or MXN.
  if new.currencies is null or array_length(new.currencies, 1) = 0 then
    new.currencies := array[coalesce(new.default_currency, 'MXN')]::char(3)[];
  end if;
  return new;
end;
$$;

drop trigger if exists trg_suppliers_currency_consistency on public.suppliers;
create trigger trg_suppliers_currency_consistency
  before insert or update on public.suppliers
  for each row execute function public.fn_supplier_default_currency_check();

-- 4. Index for filtering "suppliers that sell USD" lookups.
create index if not exists idx_suppliers_currencies_gin
  on public.suppliers using gin (currencies)
  where deleted_at is null;
