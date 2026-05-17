-- ============================================================================
-- 053_cmms_foundation.sql
--
-- Base del módulo de Mantenimiento (CMMS profesional):
--
-- 1. service_requests — reportes de problema por cualquier usuario.
--    Diferente de work_orders: una request puede convertirse en una WO
--    cuando mantenimiento la triagea, o ser descartada como duplicado/
--    no-procede.
--
-- 2. wo_comments — hilo de discusión por OT (técnico ↔ admin ↔ supervisor).
--
-- 3. equipment.parent_id — jerarquía de activos (tractor → motor →
--    arranque) opcional, simple self-FK.  Permite analizar fallas
--    recurrentes por sub-componente.
--
-- 4. equipment.criticality — campo para priorización de fallas
--    (low / medium / high / critical).  Critical equipment se prioriza
--    automáticamente.
--
-- 5. RPC create_wo_from_service_request — convierte request → WO,
--    archivando la request.
-- ============================================================================

-- ─── 1. Asset hierarchy + criticality ─────────────────────────────────────
do $$ begin
  create type equipment_criticality as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

alter table public.equipment
  add column if not exists parent_id    uuid references public.equipment(id),
  add column if not exists criticality  equipment_criticality not null default 'medium',
  add column if not exists location     text,
  add column if not exists qr_code      text,
  add column if not exists notes        text;

create index if not exists idx_equipment_parent on public.equipment(parent_id);
create index if not exists idx_equipment_criticality on public.equipment(organization_id, criticality);

-- ─── 2. service_requests ─────────────────────────────────────────────────
do $$ begin
  create type service_request_status as enum (
    'open',         -- recién reportada, sin triagear
    'triaged',      -- mantenimiento la revisó pero aún no crea WO
    'converted',    -- ya se generó una WO desde esta request
    'duplicate',    -- duplicado de otra request abierta
    'rejected'      -- no procede (no es un problema real, no era fallo, etc.)
  );
exception when duplicate_object then null; end $$;

create table if not exists public.service_requests (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id),
  folio              text not null,
  equipment_id       uuid references public.equipment(id),
  reported_by        uuid not null references auth.users(id),
  reported_at        timestamptz not null default now(),
  description        text not null check (length(trim(description)) > 0),
  urgency            wo_priority not null default 'medium',
  status             service_request_status not null default 'open',
  triaged_by         uuid references auth.users(id),
  triaged_at         timestamptz,
  triage_notes       text,
  converted_wo_id    uuid references public.work_orders(id),
  photos             jsonb default '[]'::jsonb,
  location_hint      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  deleted_at         timestamptz,
  unique (organization_id, folio)
);

create index if not exists idx_sr_org_status on public.service_requests(organization_id, status);
create index if not exists idx_sr_equipment on public.service_requests(equipment_id);

create trigger trg_sr_updated_at
  before update on public.service_requests
  for each row execute function public.fn_set_updated_at();

alter table public.service_requests enable row level security;

-- Cualquier usuario autenticado puede reportar (insert) y leer las de su org.
-- Sólo mantenimiento/admin puede triagear o convertir (update).
drop policy if exists sr_select on public.service_requests;
create policy sr_select on public.service_requests
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists sr_insert on public.service_requests;
create policy sr_insert on public.service_requests
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and reported_by = auth.uid()
  );

drop policy if exists sr_update on public.service_requests;
create policy sr_update on public.service_requests
  for update to authenticated
  using (
    organization_id = public.auth_org_id()
    and public.can_write_cmms(auth.uid())
  )
  with check (
    organization_id = public.auth_org_id()
    and public.can_write_cmms(auth.uid())
  );

-- ─── 3. wo_comments ──────────────────────────────────────────────────────
create table if not exists public.wo_comments (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  wo_id           uuid not null references public.work_orders(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_wo_comments_wo on public.wo_comments(wo_id, created_at);

alter table public.wo_comments enable row level security;

drop policy if exists wc_select on public.wo_comments;
create policy wc_select on public.wo_comments
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists wc_insert on public.wo_comments;
create policy wc_insert on public.wo_comments
  for insert to authenticated
  with check (
    organization_id = public.auth_org_id()
    and user_id = auth.uid()
  );

drop policy if exists wc_delete on public.wo_comments;
create policy wc_delete on public.wo_comments
  for delete to authenticated
  using (
    organization_id = public.auth_org_id()
    and user_id = auth.uid()
  );

-- ─── 4. RPCs para service_requests ───────────────────────────────────────
-- next_folio para service_requests reusa la lógica existente con un tipo
-- string distinto.

-- Triage: mantenimiento revisa, opcionalmente agrega notas.
create or replace function public.triage_service_request(
  p_request_id uuid,
  p_notes      text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso para triagear' using errcode = '42501';
  end if;

  update public.service_requests
     set status        = 'triaged',
         triaged_by    = v_user,
         triaged_at    = now(),
         triage_notes  = coalesce(p_notes, triage_notes),
         updated_at    = now()
   where id = p_request_id
     and organization_id = public.auth_org_id()
     and status = 'open';

  if not found then
    raise exception 'Request no encontrada o ya fue triagada' using errcode = 'P0002';
  end if;

  return p_request_id;
end;
$$;

revoke all on function public.triage_service_request(uuid, text) from public;
grant execute on function public.triage_service_request(uuid, text) to authenticated;

-- Convertir request → WO.  Crea la WO y deja la request marcada.
create or replace function public.convert_service_request_to_wo(
  p_request_id uuid,
  p_wo_type    text default 'corrective',
  p_priority   text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_sr   public.service_requests%rowtype;
  v_folio text;
  v_wo_id uuid;
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;

  select * into v_sr
    from public.service_requests
   where id = p_request_id
     and organization_id = v_org;

  if v_sr.id is null then
    raise exception 'Request no encontrada' using errcode = 'P0002';
  end if;
  if v_sr.status in ('converted', 'duplicate', 'rejected') then
    raise exception 'Esta request ya fue procesada (estado: %)', v_sr.status using errcode = 'P0001';
  end if;
  if v_sr.equipment_id is null then
    raise exception 'La request no tiene equipo asignado. Edita la request antes de convertir.' using errcode = 'P0001';
  end if;

  v_folio := public.next_folio(v_org, 'work_order');

  insert into public.work_orders (
    organization_id, folio, equipment_id, wo_type, priority,
    failure_description, reported_by, status
  ) values (
    v_org,
    v_folio,
    v_sr.equipment_id,
    p_wo_type::wo_type,
    coalesce(nullif(p_priority, '')::wo_priority, v_sr.urgency),
    v_sr.description,
    v_sr.reported_by,
    'reported'
  )
  returning id into v_wo_id;

  update public.service_requests
     set status          = 'converted',
         converted_wo_id = v_wo_id,
         updated_at      = now()
   where id = p_request_id;

  return v_wo_id;
end;
$$;

revoke all on function public.convert_service_request_to_wo(uuid, text, text) from public;
grant execute on function public.convert_service_request_to_wo(uuid, text, text) to authenticated;

-- Descartar request (duplicado o no procede).
create or replace function public.reject_service_request(
  p_request_id uuid,
  p_reason     text,
  p_as_duplicate boolean default false
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.can_write_cmms(v_user) then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Indica el motivo' using errcode = 'P0001';
  end if;

  update public.service_requests
     set status       = case when p_as_duplicate then 'duplicate'::service_request_status else 'rejected'::service_request_status end,
         triaged_by   = v_user,
         triaged_at   = now(),
         triage_notes = p_reason,
         updated_at   = now()
   where id = p_request_id
     and organization_id = public.auth_org_id()
     and status in ('open', 'triaged');

  if not found then
    raise exception 'Request no encontrada o ya procesada' using errcode = 'P0002';
  end if;

  return p_request_id;
end;
$$;

revoke all on function public.reject_service_request(uuid, text, boolean) from public;
grant execute on function public.reject_service_request(uuid, text, boolean) to authenticated;
