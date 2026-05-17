-- ============================================================================
-- 042_rewrite_can_write_purchase.sql
--
-- Diagnostic & fix.  La función can_write_purchase devuelve FALSE para
-- todos los usuarios incluso aquellos con user_roles ACTIVO y rol válido
-- (verificado en migration 041).  Posible causa: la búsqueda usa
-- `role::text in (...)` o el cast a enum dispara un fallback en el
-- planner de PostgREST.
--
-- Esta migración:
--   1. Drop+recrea can_write_purchase usando comparación TEXT explícita
--      contra el role::text (más robusto que `in ('admin'::user_role, ...)`)
--   2. Drop+recrea can_write_cmms con la misma técnica.
--   3. Reasegura grant execute to authenticated.
--   4. RAISE NOTICE inline para confirmar que ahora devuelve true.
-- ============================================================================

-- Use `create or replace` (NOT drop) because multiple RLS policies depend
-- on these functions and `drop function` would cascade-break them.
create or replace function public.can_write_purchase(p_user_id uuid)
returns boolean
language plpgsql security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_has boolean;
begin
  select exists (
    select 1
      from public.user_roles
     where user_id = p_user_id
       and revoked_at is null
       and role::text in ('admin', 'compras')
  ) into v_has;
  return coalesce(v_has, false);
end;
$$;

create or replace function public.can_write_cmms(p_user_id uuid)
returns boolean
language plpgsql security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_has boolean;
begin
  select exists (
    select 1
      from public.user_roles
     where user_id = p_user_id
       and revoked_at is null
       and role::text in ('admin', 'mantenimiento')
  ) into v_has;
  return coalesce(v_has, false);
end;
$$;

revoke all on function public.can_write_purchase(uuid) from public;
revoke all on function public.can_write_cmms(uuid)     from public;
grant execute on function public.can_write_purchase(uuid) to authenticated;
grant execute on function public.can_write_cmms(uuid)     to authenticated;

-- ─── Verify ────────────────────────────────────────────────────────────────
do $$
declare
  v_row record;
begin
  raise notice '─── CAN_WRITE_PURCHASE después del rewrite ───';
  for v_row in
    select u.email, public.can_write_purchase(u.id) as can
      from auth.users u
     order by u.email
  loop
    raise notice 'can_write_purchase(%): %', v_row.email, v_row.can;
  end loop;
end $$;

notify pgrst, 'reload schema';
