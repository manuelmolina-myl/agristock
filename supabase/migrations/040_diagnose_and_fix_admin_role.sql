-- ============================================================================
-- 040_diagnose_and_fix_admin_role.sql
--
-- Síntoma: admin reporta 42501 al insertar quotations.  La policy
-- `q_write` exige can_write_purchase(auth.uid()), que a su vez exige
-- una fila ACTIVA en user_roles con role IN ('admin', 'compras').
--
-- Hipótesis: el usuario que el cliente cree "admin" tiene en
-- profiles.role un valor distinto al esperado (p.ej. 'super_admin',
-- legacy de un schema viejo).  El sync trigger sync_profile_role_to_user_roles
-- castea profiles.role::user_role; si el valor no es un enum válido,
-- la inserción a user_roles falla silenciosamente o el trigger fue
-- evitado y el legado quedó.
--
-- Esta migración hace dos cosas:
--
-- 1. Normalizar profiles.role: cualquier valor desconocido pero que
--    "huele" a admin (super_admin, director, director_sg, owner)
--    pasa a 'admin'.  Logueo via RAISE NOTICE.
--
-- 2. Re-sembrar user_roles desde profiles.role para CADA profile, ahora
--    que la columna está saneada.  Mismo idempotencia ON CONFLICT DO
--    UPDATE SET revoked_at=null que 036.
-- ============================================================================

-- 1. Normalizar nombres de rol legacy a 'admin' en profiles.
do $$
declare
  v_renamed int;
begin
  update public.profiles
     set role = 'admin'
   where role in (
     'super_admin', 'superadmin',
     'director', 'director_sg', 'director-sg',
     'owner', 'org_admin', 'tenant_admin'
   );
  get diagnostics v_renamed = row_count;
  if v_renamed > 0 then
    raise notice 'normalize: % profile(s) renamed legacy role → admin', v_renamed;
  end if;
end $$;

-- 2. Forzar que CUALQUIER fila huérfana de user_roles para un usuario
--    cuya profiles.role coincida quede ACTIVA, y crear la que falte.
update public.user_roles ur
   set revoked_at = null,
       revoked_by = null
  from public.profiles p
 where ur.user_id = p.id
   and ur.organization_id = p.organization_id
   and ur.role::text = p.role
   and ur.revoked_at is not null
   and p.role in ('admin', 'compras', 'mantenimiento', 'almacenista');

-- 3. Insertar la fila que debería existir per profiles.role pero no
--    está en user_roles.  Conflict → reactivar.
insert into public.user_roles (organization_id, user_id, role)
select p.organization_id, p.id, p.role::user_role
  from public.profiles p
 where p.role in ('admin', 'compras', 'mantenimiento', 'almacenista')
   and p.organization_id is not null
on conflict (organization_id, user_id, role) do update
  set revoked_at = null, revoked_by = null;

-- 4. Sanity: refrescar el PostgREST schema cache.
notify pgrst, 'reload schema';
