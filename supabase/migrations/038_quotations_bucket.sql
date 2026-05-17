-- ============================================================================
-- 038_quotations_bucket.sql — Storage bucket para PDFs/imágenes de cotizaciones
--
-- Flujo objetivo:
--   1. Almacenista crea una requisición.
--   2. Admin/compras aprueba.
--   3. Compras captura hasta N cotizaciones de proveedores diferentes
--      (no obligatorio — pueden ser 1, 2, 3 …) cada una con su archivo PDF
--      o foto del documento del proveedor.
--   4. La compara y elige una para generar la OC.
--
-- Este migration crea:
--   • bucket `cotizaciones` (privado, RLS)
--   • policies sobre storage.objects que sólo permiten leer / escribir
--     archivos cuyo primer segmento de path es la organization_id del caller.
--
-- Layout de archivos:  cotizaciones/<organization_id>/<quotation_id>/<file>
--
-- La columna `quotations.pdf_url` ya existe (migración 020) — el cliente
-- guardará ahí el `signedUrl` o `publicUrl` después de subir.
-- ============================================================================

-- ─── 1. Bucket ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cotizaciones',
  'cotizaciones',
  false,                       -- privado: lectura via signedUrl
  10 * 1024 * 1024,            -- 10 MB por archivo (PDFs pueden ser pesados)
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. Policies sobre storage.objects ─────────────────────────────────────
-- Helper: tomar el primer segmento del path como organization_id.

drop policy if exists cotizaciones_select on storage.objects;
create policy cotizaciones_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cotizaciones'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

drop policy if exists cotizaciones_insert on storage.objects;
create policy cotizaciones_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cotizaciones'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and public.can_write_purchase(auth.uid())
  );

drop policy if exists cotizaciones_update on storage.objects;
create policy cotizaciones_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cotizaciones'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  )
  with check (
    bucket_id = 'cotizaciones'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and public.can_write_purchase(auth.uid())
  );

drop policy if exists cotizaciones_delete on storage.objects;
create policy cotizaciones_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cotizaciones'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and public.can_write_purchase(auth.uid())
  );
