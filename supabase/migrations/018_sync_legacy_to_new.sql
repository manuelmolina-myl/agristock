-- ============================================================================
-- 018_sync_legacy_to_new.sql — Sprint 0 hardening
-- Bridge layer that keeps the LEGACY columns and NEW model in sync during
-- the transition window. Removed at end of Sprint 1 once frontend fully cuts
-- over to user_roles + equipment.kind.
--
-- Concerns addressed:
--   A. New auth signups (via fn_handle_new_user from 010) inserted into
--      profiles but NOT into user_roles → new users have no role in the new
--      model. Fix: trigger on profiles INSERT that backfills user_roles.
--   B. New equipment rows inserted with `type` but not `kind` → kind stays
--      NULL. Fix: trigger that derives kind from type on insert/update.
-- ============================================================================

-- ─── A. profiles → user_roles sync ─────────────────────────────────────────
-- Maps the single legacy text value to one (or two) user_role enum values
-- consistent with the backfill in 013_user_roles_table.sql.
create or replace function public.sync_profile_role_to_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is null then
    return new;
  end if;

  case new.role
    when 'super_admin' then
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'super_admin') on conflict do nothing;
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'director_sg') on conflict do nothing;

    when 'admin' then
      -- 'admin' is in TS UserRole and used by fn_handle_new_user for new
      -- self-service org owners; treat as director_sg in the new model.
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'director_sg') on conflict do nothing;

    when 'gerente' then
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'director_sg') on conflict do nothing;

    when 'supervisor' then
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'coordinador_compras') on conflict do nothing;
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'coordinador_mantenimiento') on conflict do nothing;

    when 'almacenista' then
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'almacenista') on conflict do nothing;

    else
      -- Unknown legacy value; map to solicitante (least-privilege) so the
      -- user has at least one user_roles row and the frontend doesn't crash.
      insert into public.user_roles (organization_id, user_id, role)
      values (new.organization_id, new.id, 'solicitante') on conflict do nothing;
  end case;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_role on public.profiles;
create trigger trg_sync_profile_role
  after insert on public.profiles
  for each row execute function public.sync_profile_role_to_user_roles();

-- Also fire on role UPDATE so legacy admin UIs that still mutate profiles.role
-- stay consistent.  Use a separate trigger to scope to role changes only.
create or replace function public.sync_profile_role_update_to_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    -- Revoke prior user_roles rows that derived from the old legacy value,
    -- then re-grant via the INSERT-time mapping.  We revoke instead of delete
    -- so audit trail is preserved.
    update public.user_roles
       set revoked_at = now(), revoked_by = auth.uid()
     where user_id = new.id and revoked_at is null;

    perform public.sync_profile_role_to_user_roles_internal(new);
  end if;
  return new;
end;
$$;

-- Internal helper used by both INSERT trigger body and UPDATE trigger so we
-- don't duplicate the case statement.
create or replace function public.sync_profile_role_to_user_roles_internal(p_profile public.profiles)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_profile.role is null then return; end if;

  case p_profile.role
    when 'super_admin' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'super_admin') on conflict do nothing;
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'director_sg') on conflict do nothing;
    when 'admin' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'director_sg') on conflict do nothing;
    when 'gerente' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'director_sg') on conflict do nothing;
    when 'supervisor' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'coordinador_compras') on conflict do nothing;
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'coordinador_mantenimiento') on conflict do nothing;
    when 'almacenista' then
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'almacenista') on conflict do nothing;
    else
      insert into public.user_roles (organization_id, user_id, role)
      values (p_profile.organization_id, p_profile.id, 'solicitante') on conflict do nothing;
  end case;
end;
$$;

drop trigger if exists trg_sync_profile_role_update on public.profiles;
create trigger trg_sync_profile_role_update
  after update of role on public.profiles
  for each row execute function public.sync_profile_role_update_to_user_roles();

-- ─── B. equipment.type → equipment.kind derivation ────────────────────────
-- When equipment is created via legacy code (only `type` set), derive `kind`
-- using the same mapping used by 015_equipment_cmms_fields.sql backfill.
create or replace function public.derive_equipment_kind_from_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind is null and new.type is not null then
    new.kind := case lower(new.type)
      when 'tractor'   then 'machinery'::equipment_kind
      when 'implement' then 'implement'::equipment_kind
      when 'vehicle'   then 'vehicle'::equipment_kind
      when 'pump'      then 'irrigation_system'::equipment_kind
      when 'other'     then 'other'::equipment_kind
      else 'other'::equipment_kind
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_derive_equipment_kind on public.equipment;
create trigger trg_derive_equipment_kind
  before insert or update of type on public.equipment
  for each row execute function public.derive_equipment_kind_from_type();
