-- 067_platform_admins.sql
--
-- Fundación del cockpit de plataforma (cross-tenant) para super_admin.
--
-- Diseño:
--   • Tabla `platform_admins` separada del modelo `user_roles` org-scoped.
--     Un platform_admin NO tiene organization_id — opera sobre TODAS las
--     organizaciones. Esto evita confundir admin (de una org) con
--     super_admin (de la plataforma).
--   • Helper `is_platform_admin()` SECURITY DEFINER → check booleano para
--     gateaer policies, RPCs y rutas /plataforma/*.
--   • Dos RPCs SECURITY DEFINER que rompen el aislamiento de
--     `auth_org_id()` SÓLO para platform admins:
--       - platform_overview(): un solo row con counters globales
--       - platform_orgs_summary(): tabla de orgs con métricas por tenant
--   • El usuario inicial (manuelmolina@mylproduce.com) se marca como
--     platform_admin en este mismo archivo para no quedar bloqueado.
--
-- Lo que NO hace esta migración:
--   • Impersonation (acceder a una org como otro user) — Fase 2 con audit
--   • Billing/plan management — fuera de scope
--   • RLS bypass automático en tablas de negocio — todo va vía RPCs

begin;

-- ─── 1. Tabla platform_admins ────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  granted_at   timestamptz not null default now(),
  granted_by   uuid references auth.users(id),
  notes        text
);

comment on table public.platform_admins is
  'Lista de usuarios con acceso al cockpit cross-tenant /plataforma. Independiente del modelo user_roles org-scoped.';

alter table public.platform_admins enable row level security;

-- Solo el propio platform_admin puede ver la tabla (evita filtración de
-- la lista de superusuarios a usuarios normales). El INSERT/DELETE se
-- hace por SQL directo (operación rara, no necesita endpoint público).
drop policy if exists pa_self_select on public.platform_admins;
create policy pa_self_select on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- ─── 2. Helper is_platform_admin() ───────────────────────────────────────
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

comment on function public.is_platform_admin() is
  'true si el usuario actual está en platform_admins. Úsalo para gatear policies, RPCs y rutas /plataforma/*.';

-- ─── 3. RPC platform_overview() — KPIs globales ──────────────────────────
create or replace function public.platform_overview()
returns table (
  orgs_total          bigint,
  orgs_active_30d     bigint,
  users_total         bigint,
  users_active_30d    bigint,
  movements_today     bigint,
  movements_30d       bigint,
  open_work_orders    bigint,
  pending_requisitions bigint,
  diesel_liters_30d   numeric,
  diesel_cost_30d_mxn numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.organizations)::bigint                       as orgs_total,
    (select count(distinct sm.organization_id)
       from public.stock_movements sm
      where sm.created_at >= now() - interval '30 days')::bigint              as orgs_active_30d,
    (select count(*) from public.profiles where is_active = true)::bigint     as users_total,
    (select count(distinct u.id)
       from auth.users u
      where u.last_sign_in_at >= now() - interval '30 days')::bigint          as users_active_30d,
    (select count(*) from public.stock_movements
      where created_at >= date_trunc('day', now()))::bigint                   as movements_today,
    (select count(*) from public.stock_movements
      where created_at >= now() - interval '30 days')::bigint                 as movements_30d,
    (select count(*) from public.work_orders
      where deleted_at is null
        and status in ('reported','scheduled','assigned','in_progress','waiting_parts'))::bigint
                                                                              as open_work_orders,
    (select count(*) from public.purchase_requisitions
      where deleted_at is null and status = 'submitted')::bigint              as pending_requisitions,
    coalesce((select sum(diesel_liters)
       from public.stock_movement_lines sml
       join public.stock_movements sm on sm.id = sml.movement_id
      where sml.diesel_liters is not null
        and sm.created_at >= now() - interval '30 days'), 0)                  as diesel_liters_30d,
    coalesce((select sum(dl.liters * coalesce(dl.unit_cost_mxn, 0))
       from public.diesel_loads dl
      where dl.delivery_date >= current_date - interval '30 days'), 0)        as diesel_cost_30d_mxn;
end;
$$;

revoke all on function public.platform_overview() from public;
grant execute on function public.platform_overview() to authenticated;

comment on function public.platform_overview() is
  'KPIs cross-tenant para el cockpit /plataforma. Sólo accesible para platform admins.';

-- ─── 4. RPC platform_orgs_summary() — tabla de orgs ──────────────────────
create or replace function public.platform_orgs_summary()
returns table (
  org_id              uuid,
  org_name            text,
  rfc                 text,
  base_currency       char(3),
  created_at          timestamptz,
  users_count         bigint,
  users_active_30d    bigint,
  items_count         bigint,
  equipment_count     bigint,
  open_work_orders    bigint,
  movements_30d       bigint,
  last_movement_at    timestamptz,
  diesel_liters_30d   numeric,
  active_tanks        bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select
    o.id                                                                       as org_id,
    o.name                                                                     as org_name,
    o.rfc,
    o.base_currency,
    o.created_at,
    coalesce((select count(*) from public.profiles p
              where p.organization_id = o.id and p.is_active = true), 0)::bigint  as users_count,
    coalesce((select count(distinct u.id)
              from auth.users u
              join public.profiles p on p.id = u.id
              where p.organization_id = o.id
                and u.last_sign_in_at >= now() - interval '30 days'), 0)::bigint   as users_active_30d,
    coalesce((select count(*) from public.items i
              where i.organization_id = o.id
                and i.deleted_at is null
                and i.is_active = true), 0)::bigint                            as items_count,
    coalesce((select count(*) from public.equipment e
              where e.organization_id = o.id
                and e.is_active = true), 0)::bigint                            as equipment_count,
    coalesce((select count(*) from public.work_orders wo
              where wo.organization_id = o.id
                and wo.deleted_at is null
                and wo.status in ('reported','scheduled','assigned','in_progress','waiting_parts')), 0)::bigint
                                                                                as open_work_orders,
    coalesce((select count(*) from public.stock_movements sm
              where sm.organization_id = o.id
                and sm.created_at >= now() - interval '30 days'), 0)::bigint    as movements_30d,
    (select max(sm.created_at) from public.stock_movements sm
      where sm.organization_id = o.id)                                          as last_movement_at,
    coalesce((select sum(sml.diesel_liters)
              from public.stock_movement_lines sml
              join public.stock_movements sm on sm.id = sml.movement_id
              where sm.organization_id = o.id
                and sml.diesel_liters is not null
                and sm.created_at >= now() - interval '30 days'), 0)            as diesel_liters_30d,
    coalesce((select count(*) from public.diesel_tanks t
              where t.organization_id = o.id
                and t.is_active = true
                and t.deleted_at is null), 0)::bigint                           as active_tanks
  from public.organizations o
  order by o.name asc;
end;
$$;

revoke all on function public.platform_orgs_summary() from public;
grant execute on function public.platform_orgs_summary() to authenticated;

comment on function public.platform_orgs_summary() is
  'Listado de organizaciones con métricas por tenant (users, items, OTs, movimientos, diésel). Cockpit /plataforma.';

-- ─── 5. Seed: marcar al usuario inicial como platform admin ──────────────
-- Identificamos por email para no codificar UUIDs. Si el email no existe
-- (entorno fresh) la inserción no hace nada.
insert into public.platform_admins (user_id, notes)
select u.id, 'Founding platform admin — seed migration 067'
  from auth.users u
 where u.email = 'manuelmolina@mylproduce.com'
on conflict (user_id) do nothing;

commit;
