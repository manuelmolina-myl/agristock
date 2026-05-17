-- ============================================================================
-- 055_service_request_profile_fks.sql
--
-- Continuación del trabajo de 037_profile_fks_for_postgrest_embeds.sql para
-- las columnas user-referenciales de `service_requests` (migración 053):
--
--   - service_requests.reported_by → public.profiles(id)
--   - service_requests.triaged_by  → public.profiles(id)
--
-- Motivo: el frontend de Mantenimiento embebe el nombre del reportador y
-- del triager vía hints PostgREST (`profiles!service_requests_reported_by_fkey`).
-- Como las FKs apuntan a `auth.users`, PostgREST no las resuelve y devuelve
-- PGRST200. `profiles.id` es 1:1 con `auth.users.id`, así que podemos
-- repuntar las FKs sin perder integridad referencial.
--
-- Idempotente: si la FK ya apunta a profiles, no se hace nada.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('service_requests', 'reported_by', 'service_requests_reported_by_fkey'),
      ('service_requests', 'triaged_by',  'service_requests_triaged_by_fkey')
    ) as t(tbl, col, fkname)
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = v.tbl
    ) then
      raise notice 'skip: table public.% does not exist', v.tbl;
      continue;
    end if;

    -- Si ya apunta a profiles, nada que hacer.
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

    execute format('alter table public.%I drop constraint if exists %I', v.tbl, v.fkname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete no action',
      v.tbl, v.fkname, v.col
    );

    raise notice 'repointed: %.% → profiles(id) via %', v.tbl, v.col, v.fkname;
  end loop;
end $$;

notify pgrst, 'reload schema';
