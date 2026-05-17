-- ============================================================================
-- 060_diesel_tanks.sql — Combustible expandido (Sprint 4 del roadmap)
--
-- Antes:  el diesel se trackeaba como un item normal en stock_movement_lines.
-- Ahora: existe el concepto de TANQUE (estacionario o móvil) con su nivel
--        actual, recargas formales del proveedor, y dispensings al equipo.
--
-- Estructura:
--   • diesel_tanks       — registro de tanques (capacidad, nivel actual)
--   • diesel_loads       — recargas al tanque desde un proveedor
--   • stock_movement_lines.tank_id — link al tanque cuando se carga un equipo
--
-- RPCs:
--   • register_diesel_load(tank_id, liters, unit_cost, supplier_id?, folio?, notes?)
--   • adjust_diesel_tank(tank_id, new_level, reason)
--
-- View:
--   • diesel_tank_balance — nivel actual + capacidad + % + último load
-- ============================================================================

-- ─── 1. Tank types enum + diesel_tanks ──────────────────────────────────
do $$ begin
  create type diesel_tank_type as enum ('stationary', 'mobile');
exception when duplicate_object then null; end $$;

create table if not exists public.diesel_tanks (
  id                    uuid primary key default extensions.gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id),
  code                  text not null,
  name                  text not null,
  type                  diesel_tank_type not null default 'stationary',
  capacity_liters       numeric(12,2) not null check (capacity_liters > 0),
  current_level_liters  numeric(12,2) not null default 0 check (current_level_liters >= 0),
  alert_threshold_pct   numeric(5,2) not null default 20 check (alert_threshold_pct between 0 and 100),
  location              text,
  supplier_id           uuid references public.suppliers(id),
  last_load_at          timestamptz,
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  deleted_at            timestamptz,
  unique (organization_id, code)
);

create index if not exists idx_diesel_tanks_org on public.diesel_tanks(organization_id) where deleted_at is null;

create trigger trg_diesel_tanks_updated_at
  before update on public.diesel_tanks
  for each row execute function public.fn_set_updated_at();

alter table public.diesel_tanks enable row level security;

drop policy if exists dt_select on public.diesel_tanks;
create policy dt_select on public.diesel_tanks
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists dt_write on public.diesel_tanks;
create policy dt_write on public.diesel_tanks
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ─── 2. diesel_loads (recargas al tanque) ───────────────────────────────
create table if not exists public.diesel_loads (
  id                    uuid primary key default extensions.gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id),
  tank_id               uuid not null references public.diesel_tanks(id),
  supplier_id           uuid references public.suppliers(id),
  delivery_date         date not null default current_date,
  liters                numeric(12,2) not null check (liters > 0),
  unit_cost_mxn         numeric(10,4),
  total_cost_mxn        numeric(14,2) generated always as (liters * coalesce(unit_cost_mxn, 0)) stored,
  fuel_invoice_folio    text,
  notes                 text,
  registered_by         uuid references auth.users(id),
  created_at            timestamptz not null default now()
);

create index if not exists idx_diesel_loads_tank on public.diesel_loads(tank_id, delivery_date desc);
create index if not exists idx_diesel_loads_org on public.diesel_loads(organization_id);

alter table public.diesel_loads enable row level security;

drop policy if exists dl_select on public.diesel_loads;
create policy dl_select on public.diesel_loads
  for select to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists dl_insert on public.diesel_loads;
create policy dl_insert on public.diesel_loads
  for insert to authenticated
  with check (organization_id = public.auth_org_id());

-- ─── 3. tank_id en stock_movement_lines ─────────────────────────────────
-- Nullable para compatibilidad hacia atrás.  Las cargas nuevas a tractores
-- deberían setearlo; las históricas seguirán existiendo sin tank_id.
alter table public.stock_movement_lines
  add column if not exists tank_id uuid references public.diesel_tanks(id);

create index if not exists idx_sml_tank on public.stock_movement_lines(tank_id) where tank_id is not null;

-- ─── 4. View diesel_tank_balance ────────────────────────────────────────
-- Nivel actual computado: capacity_initial + sum(loads) - sum(dispensings).
-- Nota: usamos `current_level_liters` como cache para que el cliente no
-- recalcule cada vez; las RPCs lo mantienen sincronizado.
create or replace view public.diesel_tank_balance as
  select
    t.id,
    t.organization_id,
    t.code,
    t.name,
    t.type,
    t.capacity_liters,
    t.current_level_liters,
    t.alert_threshold_pct,
    t.location,
    t.supplier_id,
    s.name as supplier_name,
    t.last_load_at,
    t.is_active,
    round((t.current_level_liters / t.capacity_liters) * 100, 1) as fill_pct,
    case
      when t.current_level_liters / t.capacity_liters * 100 < t.alert_threshold_pct then 'low'
      when t.current_level_liters / t.capacity_liters * 100 < 50 then 'medium'
      else 'ok'
    end as level_status,
    -- Sum of dispensings in last 30 days for daily-avg trend
    coalesce((
      select sum(sml.diesel_liters)
        from public.stock_movement_lines sml
        join public.stock_movements sm on sm.id = sml.movement_id
       where sml.tank_id = t.id
         and sml.diesel_liters is not null
         and sm.posted_at >= now() - interval '30 days'
    ), 0) as dispensed_30d,
    coalesce((
      select sum(dl.liters)
        from public.diesel_loads dl
       where dl.tank_id = t.id
         and dl.delivery_date >= current_date - interval '30 days'
    ), 0) as loaded_30d
  from public.diesel_tanks t
  left join public.suppliers s on s.id = t.supplier_id
  where t.deleted_at is null;

grant select on public.diesel_tank_balance to authenticated;

-- ─── 5. RPC register_diesel_load ────────────────────────────────────────
-- Registra una recarga al tanque + actualiza el nivel atómicamente.
-- Valida que el nivel resultante no exceda la capacidad.
create or replace function public.register_diesel_load(
  p_tank_id           uuid,
  p_liters            numeric,
  p_unit_cost_mxn     numeric default null,
  p_supplier_id       uuid default null,
  p_fuel_invoice_folio text default null,
  p_delivery_date     date default null,
  p_notes             text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_tank public.diesel_tanks%rowtype;
  v_load_id uuid;
begin
  if v_user is null or v_org is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if p_liters is null or p_liters <= 0 then
    raise exception 'Litros debe ser mayor a 0' using errcode = 'P0001';
  end if;

  select * into v_tank
    from public.diesel_tanks
   where id = p_tank_id
     and organization_id = v_org
     and deleted_at is null
   for update;

  if v_tank.id is null then
    raise exception 'Tanque no encontrado' using errcode = 'P0002';
  end if;

  if (v_tank.current_level_liters + p_liters) > v_tank.capacity_liters then
    raise exception
      'El nivel resultante (% L) excede la capacidad del tanque (% L)',
      v_tank.current_level_liters + p_liters, v_tank.capacity_liters
      using errcode = 'P0001';
  end if;

  insert into public.diesel_loads
    (organization_id, tank_id, supplier_id, delivery_date, liters,
     unit_cost_mxn, fuel_invoice_folio, notes, registered_by)
  values
    (v_org, p_tank_id, p_supplier_id, coalesce(p_delivery_date, current_date),
     p_liters, p_unit_cost_mxn, p_fuel_invoice_folio, p_notes, v_user)
  returning id into v_load_id;

  update public.diesel_tanks
     set current_level_liters = current_level_liters + p_liters,
         last_load_at         = now(),
         updated_at           = now()
   where id = p_tank_id;

  return v_load_id;
end;
$$;

revoke all on function public.register_diesel_load(uuid, numeric, numeric, uuid, text, date, text) from public;
grant execute on function public.register_diesel_load(uuid, numeric, numeric, uuid, text, date, text) to authenticated;

-- ─── 6. RPC adjust_diesel_tank — ajuste manual del nivel ────────────────
create or replace function public.adjust_diesel_tank(
  p_tank_id    uuid,
  p_new_level  numeric,
  p_reason     text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_tank public.diesel_tanks%rowtype;
begin
  select exists (
    select 1 from public.user_roles
     where user_id = v_user
       and revoked_at is null
       and role::text = 'admin'
  ) into v_is_admin;

  if not coalesce(v_is_admin, false) then
    raise exception 'Sólo un admin puede ajustar el nivel del tanque' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Indica el motivo del ajuste' using errcode = 'P0001';
  end if;

  select * into v_tank
    from public.diesel_tanks
   where id = p_tank_id
     and organization_id = public.auth_org_id()
     and deleted_at is null
   for update;

  if v_tank.id is null then
    raise exception 'Tanque no encontrado' using errcode = 'P0002';
  end if;

  if p_new_level < 0 or p_new_level > v_tank.capacity_liters then
    raise exception 'Nivel inválido: debe estar entre 0 y % L', v_tank.capacity_liters
      using errcode = 'P0001';
  end if;

  update public.diesel_tanks
     set current_level_liters = p_new_level,
         notes = case
           when notes is null or notes = '' then
             'Ajuste ' || current_date::text || ': ' || p_reason
           else
             notes || E'\nAjuste ' || current_date::text || ': ' || p_reason
         end,
         updated_at = now()
   where id = p_tank_id;

  return p_tank_id;
end;
$$;

revoke all on function public.adjust_diesel_tank(uuid, numeric, text) from public;
grant execute on function public.adjust_diesel_tank(uuid, numeric, text) to authenticated;

-- ─── 7. Trigger: descontar tanque al dispensar a equipo ────────────────
-- Cuando se inserta un stock_movement_line con diesel_liters > 0 y tank_id,
-- decrementa el current_level_liters del tanque.  No bloquea si el tanque
-- quedaría negativo (sólo lo registra; el operador es responsable de
-- cuadrar después con adjust_diesel_tank).
create or replace function public.fn_diesel_tank_dispense()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.tank_id is not null
     and new.diesel_liters is not null
     and new.diesel_liters > 0 then
    update public.diesel_tanks
       set current_level_liters = greatest(current_level_liters - new.diesel_liters, 0),
           updated_at = now()
     where id = new.tank_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_diesel_tank_dispense on public.stock_movement_lines;
create trigger trg_diesel_tank_dispense
  after insert on public.stock_movement_lines
  for each row
  execute function public.fn_diesel_tank_dispense();
