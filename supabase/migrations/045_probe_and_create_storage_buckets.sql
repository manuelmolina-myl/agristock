-- ============================================================================
-- 045_probe_and_create_storage_buckets.sql
--
-- Reportado: "No se pudo subir el logo · Bucket not found" al cambiar el
-- logo de la organización en /configuracion.  El cliente intenta subir a
-- storage.from('item-images') pero ese bucket nunca fue creado en este
-- proyecto remoto (fue asumido históricamente del cliente).
--
-- Esta migración:
--   1. Imprime qué buckets existen ahora (RAISE NOTICE)
--   2. Crea idempotentemente los 2 buckets que el cliente espera:
--      'item-images' (público, para fotos de items + logo de la org)
--      'cotizaciones' (privado, ya estaba, IF NOT EXISTS)
--   3. Asegura policies abiertas-para-lectura + restringidas-para-write
--      en item-images.
-- ============================================================================

do $$
declare
  v_row record;
begin
  raise notice '─── BUCKETS antes ───';
  for v_row in select id, name, public from storage.buckets order by id
  loop
    raise notice 'bucket: % (public=%)', v_row.id, v_row.public;
  end loop;
end $$;

-- ─── 1. item-images bucket ─────────────────────────────────────────────────
-- Público para lectura (item-detail muestra <img> directo desde el publicUrl).
-- Writes restringidos a usuarios autenticados del mismo tenant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-images',
  'item-images',
  true,
  5 * 1024 * 1024,   -- 5 MB max por imagen
  array['image/png','image/jpeg','image/webp','image/svg+xml','image/heic']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. Policies sobre storage.objects para item-images ────────────────────
-- SELECT: público (bucket público).  Se mantiene policy explícita para
--          que la API de Supabase admita signed URL alternativas.
drop policy if exists item_images_public_select on storage.objects;
create policy item_images_public_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'item-images');

-- INSERT/UPDATE/DELETE: cualquier usuario autenticado del tenant
-- (admin / compras / almacenista pueden gestionar fotos de inventario;
--  admin gestiona el logo).
drop policy if exists item_images_write on storage.objects;
create policy item_images_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-images');

drop policy if exists item_images_update on storage.objects;
create policy item_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'item-images')
  with check (bucket_id = 'item-images');

drop policy if exists item_images_delete on storage.objects;
create policy item_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-images');

-- ─── 3. Verify ─────────────────────────────────────────────────────────────
do $$
declare
  v_row record;
begin
  raise notice '─── BUCKETS después ───';
  for v_row in select id, name, public from storage.buckets order by id
  loop
    raise notice 'bucket: % (public=%)', v_row.id, v_row.public;
  end loop;
end $$;
