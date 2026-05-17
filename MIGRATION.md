# MIGRATION.md — AgriStock → Director de Servicios Generales

> **Documento operativo para Claude Code.** Describe cómo evolucionar el AgriStock actual (almacén + diésel) hacia plataforma integral para el **Director de Servicios Generales** (compras, CMMS, flotilla, combustible expandido, servicios externos, activos fijos).
>
> **Este documento convive con el `CLAUDE.md` existente.** No lo reemplaza. Lo extiende.
>
> **Regla de oro:** todo lo que ya existe en el schema se respeta como invariante. Solo se renombra cuando es necesario para el dominio nuevo. Se prefiere ALTER + ADD sobre DROP + recreate.

---

## 0. Contexto

### Estado actual (locked, no se toca)

Tablas existentes que se quedan como están (con extensiones aditivas):
- `organizations`, `profiles`
- `seasons`, `season_closures`
- `categories`, `units`, `suppliers`, `employees`, `adjustment_reasons`
- `crops_lots`, `warehouses`, `equipment`
- `items`, `item_stock`, `stock_movements`, `stock_movement_lines`
- `fx_rates`, `audit_log`
- `v_movements_no_cost`

### Invariantes preservadas

1. **Multi-tenant:** `organization_id` en todas las tablas nuevas.
2. **Soft delete:** `deleted_at` en todas las tablas nuevas (excepto inmutables como audit, movements).
3. **Audit log:** `audit_log` ya tiene la forma correcta; nuevos triggers apuntan a esa tabla.
4. **Moneda nativa atada al item:** `items.native_currency`. Las nuevas tablas (compras, CMMS) heredan este principio.
5. **Costos en `item_stock`:** sigue siendo la fuente de verdad (`avg_cost_native`, `avg_cost_mxn`).
6. **Vista filtrada `v_movements_no_cost`:** se mantiene; se crean equivalentes para compras (`v_purchase_orders_no_cost`).
7. **Migración via Supabase migrations:** archivos `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, forward-only.

### Decisiones globales tomadas

- **Sin datos productivos:** podemos hacer rename, drop, recreate sin dual-write ni compat.
- **Ritmo:** 7 sprints secuenciales, cada uno deployable en staging al cierre.
- **Lenguaje del schema:** se mantiene **inglés** (sigue tu convención actual: `purchase_orders`, `work_orders`, etc.). El frontend usa español visible.

---

## 1. Cambios estructurales transversales (Sprint 0)

Antes de tocar módulos nuevos, hay 4 ajustes a tablas existentes que habilitan todo lo demás.

### 1.1 Roles: de `profiles.role text` → tabla N:M

**Por qué:** un usuario puede ser Director Y aprobador. Un Coordinador de Compras puede ser temporalmente Auditor. Un solo string no escala.

```sql
-- Migration: 20260201000000_user_roles_table.sql

create type user_role as enum (
  'super_admin',
  'director_sg',
  'coordinador_compras',
  'coordinador_mantenimiento',
  'almacenista',
  'tecnico',
  'operador',
  'solicitante',
  'auditor'
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique(organization_id, user_id, role)
);

create index idx_user_roles_user_active on public.user_roles(user_id, role)
  where revoked_at is null;

alter table public.user_roles enable row level security;

-- Migrar datos existentes
insert into public.user_roles (organization_id, user_id, role)
  select organization_id, id,
    case lower(role)
      when 'admin'      then 'super_admin'::user_role
      when 'owner'      then 'director_sg'::user_role
      when 'controller' then 'director_sg'::user_role
      when 'warehouse'  then 'almacenista'::user_role
      else 'solicitante'::user_role  -- fallback seguro
    end
  from public.profiles
  where role is not null;

-- Función helper SECURITY DEFINER
create or replace function public.has_role(p_user_id uuid, p_role user_role)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = p_role and revoked_at is null
  );
$$;

create or replace function public.current_user_roles()
returns setof user_role
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select role from public.user_roles
  where user_id = auth.uid() and revoked_at is null;
$$;

-- Mantén profiles.role por ahora como cache (deprecated, no leer en RLS nuevas)
comment on column public.profiles.role is 'DEPRECATED — usa user_roles. Se elimina al final del Sprint 0.';
```

**Acción frontend:** reemplazar todo `profile.role === 'X'` por `usePermissions()` que llama a `current_user_roles()`. Eliminar `profiles.role` al cierre del Sprint 0 cuando no haya consumidores.

### 1.2 Settings configurables: thresholds escalonados

**Por qué:** `organizations.approval_threshold_mxn` es un solo número. Necesitas escalones por tipo (compras / salidas / OTs).

```sql
-- Migration: 20260201000100_organization_settings.sql

alter table public.organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Mover el threshold existente al jsonb
update public.organizations
set settings = jsonb_build_object(
  'approval_thresholds', jsonb_build_object(
    'purchase', jsonb_build_array(
      jsonb_build_object('max_mxn', coalesce(approval_threshold_mxn, 5000),  'role', 'coordinador_compras'),
      jsonb_build_object('max_mxn', coalesce(approval_threshold_mxn, 5000)*10, 'role', 'director_sg'),
      jsonb_build_object('max_mxn', null, 'role', 'director_sg', 'requires_note', true)
    ),
    'stock_exit', jsonb_build_array(
      jsonb_build_object('max_mxn', 5000,  'role', 'almacenista'),
      jsonb_build_object('max_mxn', null,  'role', 'director_sg')
    ),
    'work_order', jsonb_build_array(
      jsonb_build_object('max_mxn', 10000, 'role', 'coordinador_mantenimiento'),
      jsonb_build_object('max_mxn', null,  'role', 'director_sg')
    )
  ),
  'invoice_reconciliation_tolerance_pct', 2.0,
  'low_stock_alert_enabled', true,
  'low_fuel_alert_enabled', true
)
where settings = '{}'::jsonb;

-- Marcar columna vieja como deprecated; se elimina al final del Sprint 1
comment on column public.organizations.approval_threshold_mxn is 'DEPRECATED — usa settings->approval_thresholds.';

-- Helper: obtener umbral aplicable
create or replace function public.required_approval_role(
  p_org_id uuid, p_operation text, p_amount_mxn numeric
) returns user_role
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_thresholds jsonb;
  v_tier jsonb;
  v_max numeric;
begin
  select settings->'approval_thresholds'->p_operation into v_thresholds
    from public.organizations where id = p_org_id;
  if v_thresholds is null then
    raise exception 'No thresholds configured for %', p_operation;
  end if;

  for v_tier in select * from jsonb_array_elements(v_thresholds) loop
    v_max := (v_tier->>'max_mxn')::numeric;
    if v_max is null or p_amount_mxn <= v_max then
      return (v_tier->>'role')::user_role;
    end if;
  end loop;

  return 'director_sg'::user_role;
end;
$$;
```

### 1.3 Equipment: extensión para CMMS

**Por qué:** el `equipment` actual es básico. CMMS necesita estado, responsable, valor, número de serie.

```sql
-- Migration: 20260201000200_equipment_cmms_fields.sql

create type equipment_status as enum (
  'operational', 'in_maintenance', 'out_of_service', 'disposed'
);

create type equipment_kind as enum (
  'vehicle', 'machinery', 'implement', 'installation', 'irrigation_system', 'tool', 'other'
);

alter table public.equipment
  add column if not exists status equipment_status not null default 'operational',
  add column if not exists kind equipment_kind,
  add column if not exists serial_number text,
  add column if not exists engine_number text,
  add column if not exists location text,
  add column if not exists responsible_employee_id uuid references public.employees(id),
  add column if not exists acquisition_date date,
  add column if not exists acquisition_cost_native numeric(18,4),
  add column if not exists acquisition_currency char(3),
  add column if not exists insurance_policy text,
  add column if not exists insurance_expires_at date,
  add column if not exists documents jsonb default '[]'::jsonb,
  add column if not exists photos jsonb default '[]'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- El campo "type" actual se mapea a "kind"; migrar y luego deprecar
update public.equipment set kind = case lower(type)
  when 'tractor' then 'machinery'::equipment_kind
  when 'truck' then 'vehicle'::equipment_kind
  when 'vehicle' then 'vehicle'::equipment_kind
  when 'sprayer' then 'machinery'::equipment_kind
  else 'other'::equipment_kind
end where kind is null;

comment on column public.equipment.type is 'DEPRECATED — usa kind. Se elimina al cierre del Sprint 3 (CMMS).';

create index if not exists idx_equipment_status on public.equipment(organization_id, status)
  where deleted_at is null;
create index if not exists idx_equipment_kind on public.equipment(organization_id, kind);
```

### 1.4 Stock movements: extender enum/check de tipos

**Por qué:** los nuevos módulos generan tipos que no existen aún.

```sql
-- Migration: 20260201000300_stock_movement_types_extend.sql

-- Si tienes CHECK constraint en movement_type, drop y recreate con valores nuevos.
-- Si es text libre, solo agrega comentario con valores válidos.

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;

alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type in (
    -- Existentes (mantenlos exactamente como los usas hoy)
    'entry_initial', 'entry_purchase', 'entry_adjustment', 'entry_transfer', 'entry_return',
    'exit_consumption', 'exit_adjustment', 'exit_transfer', 'exit_disposal',
    -- Nuevos (sprints siguientes)
    'entry_reception',         -- desde recepción de OC (Sprint 2)
    'exit_work_order',         -- consumo en OT de mantenimiento (Sprint 3)
    'exit_external_service',   -- consumido por servicio externo (Sprint 5)
    'exit_fuel_dispensing'     -- dispensación de combustible (Sprint 4)
  ));

-- Agregar campos polimórficos para referencia al origen del movimiento
alter table public.stock_movements
  add column if not exists source_type text,  -- 'purchase_order' | 'work_order' | 'fuel_dispensing' | 'service_event' | null
  add column if not exists source_id uuid;

create index if not exists idx_movements_source
  on public.stock_movements(source_type, source_id)
  where source_type is not null;
```

---

## 2. Mapa de sprints

| Sprint | Duración | Entregable | Deployable |
|---|---|---|---|
| **0** | 1 semana | Refactor transversal: roles, settings, equipment fields, movement types | ✅ sin nuevos módulos visibles, pero base lista |
| **1** | 1.5 semanas | Catálogos faltantes + ajustes UI/permissions con `user_roles` | ✅ |
| **2** | 2 semanas | **Compras**: requisitions → quotations → POs → receptions → invoices | ✅ módulo completo |
| **3** | 2 semanas | **CMMS**: plans, work orders, parts, labor | ✅ módulo completo |
| **4** | 1.5 semanas | **Combustible expandido**: tanks, loads, dispensing | ✅ módulo completo |
| **5** | 1.5 semanas | **Flotilla**: logbook, assignments + **Servicios externos**: contracts, events | ✅ |
| **6** | 1 semana | **Activos fijos** + depreciación + **Reportes nuevos** | ✅ |
| **7** | 1 semana | **Cockpit del Director** + notificaciones + hardening | ✅ MVP cerrado |

**Total: ~10-11 semanas.**

---

## 3. Sprint 0 — Refactor transversal

### Migrations en orden

1. `20260201000000_user_roles_table.sql` (§1.1)
2. `20260201000100_organization_settings.sql` (§1.2)
3. `20260201000200_equipment_cmms_fields.sql` (§1.3)
4. `20260201000300_stock_movement_types_extend.sql` (§1.4)
5. `20260201000400_helper_functions.sql` — funciones utilitarias compartidas

```sql
-- 20260201000400_helper_functions.sql

-- Generador genérico de folios secuenciales por organización + año + tipo
create table if not exists public.folio_sequences (
  organization_id uuid not null references public.organizations(id),
  document_type text not null,
  year int not null,
  last_number int not null default 0,
  primary key (organization_id, document_type, year)
);

create or replace function public.next_folio(p_org uuid, p_type text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from now())::int;
  v_n int;
  v_prefix text;
begin
  insert into public.folio_sequences (organization_id, document_type, year, last_number)
    values (p_org, p_type, v_year, 1)
    on conflict (organization_id, document_type, year)
      do update set last_number = folio_sequences.last_number + 1
    returning last_number into v_n;

  v_prefix := case p_type
    when 'requisition'      then 'REQ'
    when 'quotation'        then 'COT'
    when 'purchase_order'   then 'OC'
    when 'reception'        then 'REC'
    when 'work_order'       then 'OT'
    when 'fuel_dispensing'  then 'CMB'
    when 'service_event'    then 'SRV'
    else upper(p_type)
  end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_n::text, 5, '0'));
end;
$$;

revoke all on function public.next_folio(uuid, text) from public;
grant execute on function public.next_folio(uuid, text) to authenticated;

-- Tipo genérico de moneda (3 letras ISO)
do $$ begin
  create domain currency_code as char(3) check (value in ('MXN', 'USD'));
exception when duplicate_object then null; end $$;
```

### Frontend changes (Sprint 0)

- `src/lib/permissions.ts`: reescribir `usePermissions()` para consultar `user_roles` vía RPC `current_user_roles()`.
- `src/lib/supabase/types.ts`: regenerar después de cada migration.
- Reemplazar TODOS los `profile.role === 'X'` por `can('module.action')`. Lista de claims a mapear:
  - `purchase.approve`, `purchase.create`, `purchase.read`
  - `stock_exit.approve`, `stock_exit.create`
  - `work_order.assign`, `work_order.close`
  - `costs.view` (solo roles que ven costos)
  - `settings.manage`
- Actualizar `app/(dashboard)/configuracion/usuarios/page.tsx`: UI para asignar/revocar roles desde `user_roles`.

### Tests de aceptación (Sprint 0)

- [ ] Migración corre limpia desde un dump del schema actual.
- [ ] Usuarios existentes mantienen acceso equivalente (mapeo de `profiles.role` → `user_roles` correcto).
- [ ] `has_role(uid, 'director_sg')` devuelve true para usuarios mapeados.
- [ ] `required_approval_role(org, 'purchase', 60000)` devuelve `director_sg`.
- [ ] `next_folio(org, 'purchase_order')` genera `OC-2026-00001`, segunda llamada `OC-2026-00002`.
- [ ] Frontend sigue funcionando con permisos resueltos vía `user_roles`.
- [ ] `profiles.role` queda en BD pero no se lee en ninguna policy ni componente.

### Drop al cierre

```sql
-- AL CIERRE DE SPRINT 0 (después de validar)
alter table public.profiles drop column role;
alter table public.organizations drop column approval_threshold_mxn;
```

---

## 4. Sprint 1 — Catálogos y permisos finalizados

### Nuevos catálogos

```sql
-- 20260208000000_new_catalogs.sql

create table public.failure_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  label text not null,
  severity text check (severity in ('low','medium','high','critical')),
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, code)
);

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  label text not null,  -- 'limpieza', 'jardinería', 'seguridad', 'fumigación', 'transporte', 'capacitación'
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, code)
);

-- RLS + audit triggers para ambas
alter table public.failure_types enable row level security;
alter table public.service_types enable row level security;

-- Políticas estándar (read para todos en la org, write para director_sg + coordinadores)
-- ... (template estándar)
```

### Acción Frontend

- Pantallas CRUD para `failure_types` y `service_types` en `/catalogos`.
- Actualizar `usePermissions()` con claims finales.
- Empezar a usar `next_folio` en lugar de generación cliente (si la había).

---

## 5. Sprint 2 — Módulo de Compras (full procurement)

### Migration: tablas de compras

```sql
-- 20260215000000_purchasing.sql

create type requisition_status as enum (
  'draft', 'submitted', 'in_quotation', 'approved', 'rejected', 'po_generated', 'cancelled'
);
create type requisition_priority as enum ('low','medium','high','urgent');
create type quotation_status as enum ('requested','received','selected','discarded');
create type po_status as enum (
  'draft','sent','confirmed','partially_received','received','closed','cancelled'
);
create type reception_status as enum ('draft','accepted','rejected_partial','rejected');
create type invoice_status as enum ('pending','reconciled','paid','cancelled','discrepancy');

create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  requester_id uuid not null references auth.users(id),
  request_date date not null default current_date,
  priority requisition_priority not null default 'medium',
  justification text,
  crop_lot_id uuid references public.crops_lots(id),
  equipment_id uuid references public.equipment(id),
  status requisition_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  estimated_total_mxn numeric(18,4),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, folio)
);

create table public.requisition_lines (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  item_id uuid references public.items(id),
  free_description text,           -- ítem nuevo no catalogado
  quantity numeric(14,4) not null check (quantity > 0),
  unit_id uuid references public.units(id),
  estimated_unit_cost numeric(18,4),
  currency currency_code,
  notes text,
  created_at timestamptz default now(),
  check (item_id is not null or free_description is not null)
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requisition_id uuid not null references public.purchase_requisitions(id),
  supplier_id uuid not null references public.suppliers(id),
  folio text not null,
  quotation_date date not null,
  status quotation_status not null default 'requested',
  pdf_url text,
  payment_terms text,
  delivery_days int,
  validity_days int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, folio)
);

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  requisition_line_id uuid not null references public.requisition_lines(id),
  unit_cost numeric(18,4) not null,
  currency currency_code not null,
  discount_pct numeric(5,2) default 0,
  tax_pct numeric(5,2) default 16,
  available boolean default true,
  notes text
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  supplier_id uuid not null references public.suppliers(id),
  quotation_id uuid references public.quotations(id),
  requisition_id uuid references public.purchase_requisitions(id),
  issue_date date not null default current_date,
  expected_delivery_date date,
  payment_terms text,
  delivery_location text,
  destination_warehouse_id uuid references public.warehouses(id),
  subtotal_mxn numeric(18,4),
  tax_mxn numeric(18,4),
  total_mxn numeric(18,4),
  subtotal_usd numeric(18,4),
  total_usd numeric(18,4),
  fx_rate numeric(12,6),
  status po_status not null default 'draft',
  pdf_url text,
  sent_to_supplier_at timestamptz,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, folio)
);

create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null,
  currency currency_code not null,
  tax_pct numeric(5,2) default 16,
  received_quantity numeric(14,4) not null default 0,
  notes text
);

create table public.receptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  po_id uuid not null references public.purchase_orders(id),
  reception_date date not null default current_date,
  warehouse_id uuid not null references public.warehouses(id),
  received_by uuid references auth.users(id),
  supplier_delivery_note text,
  delivery_note_url text,
  quality_notes text,
  status reception_status not null default 'draft',
  photos jsonb default '[]'::jsonb,
  stock_movement_id uuid references public.stock_movements(id),  -- link al movimiento generado
  created_at timestamptz default now(),
  unique(organization_id, folio)
);

create table public.reception_lines (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null references public.receptions(id) on delete cascade,
  po_line_id uuid not null references public.po_lines(id),
  item_id uuid not null references public.items(id),
  received_quantity numeric(14,4) not null check (received_quantity >= 0),
  accepted_quantity numeric(14,4) not null check (accepted_quantity >= 0),
  rejected_quantity numeric(14,4) generated always as (received_quantity - accepted_quantity) stored,
  rejection_reason text,
  supplier_lot text,
  expiry_date date,
  notes text
);

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  po_id uuid not null references public.purchase_orders(id),
  supplier_id uuid not null references public.suppliers(id),
  invoice_folio text not null,
  cfdi_uuid text,
  issue_date date not null,
  due_date date,
  subtotal numeric(18,4),
  tax numeric(18,4),
  total numeric(18,4),
  currency currency_code not null,
  pdf_url text,
  xml_url text,
  status invoice_status not null default 'pending',
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users(id),
  discrepancies jsonb,
  notes text,
  created_at timestamptz default now(),
  unique(cfdi_uuid),
  unique(organization_id, supplier_id, invoice_folio)
);

-- Índices
create index idx_req_org_status on public.purchase_requisitions(organization_id, status) where deleted_at is null;
create index idx_req_requester on public.purchase_requisitions(requester_id);
create index idx_quot_req on public.quotations(requisition_id);
create index idx_po_supplier on public.purchase_orders(supplier_id);
create index idx_po_org_status on public.purchase_orders(organization_id, status) where deleted_at is null;
create index idx_rec_po on public.receptions(po_id);
create index idx_inv_po on public.supplier_invoices(po_id);
create index idx_inv_cfdi on public.supplier_invoices(cfdi_uuid) where cfdi_uuid is not null;

-- RLS (template a aplicar por tabla)
alter table public.purchase_requisitions enable row level security;
-- ... políticas por rol
```

### RPC clave: aprobación de OC con generación de movimiento al recepcionar

```sql
-- 20260215000100_purchasing_rpcs.sql

create or replace function public.process_reception(
  p_po_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,  -- [{ po_line_id, received_qty, accepted_qty, rejection_reason, supplier_lot, expiry_date }]
  p_supplier_note text default null,
  p_quality_notes text default null,
  p_photos jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_user uuid := auth.uid();
  v_reception_id uuid;
  v_movement_id uuid;
  v_folio_rec text;
  v_folio_mov text;
  v_line jsonb;
  v_po_line record;
  v_item_currency char(3);
  v_total_native numeric := 0;
  v_total_mxn numeric := 0;
  v_fx numeric;
begin
  -- 1. Verificar OC válida
  select organization_id, fx_rate into v_org, v_fx
    from public.purchase_orders
    where id = p_po_id and status in ('sent','confirmed','partially_received')
    for update;
  if v_org is null then
    raise exception 'PO not found or not in receivable state';
  end if;

  -- 2. Permisos
  if not public.has_role(v_user, 'almacenista') and not public.has_role(v_user, 'director_sg') then
    raise exception 'Forbidden';
  end if;

  -- 3. Folios
  v_folio_rec := public.next_folio(v_org, 'reception');

  -- 4. Crear cabecera de recepción
  insert into public.receptions (organization_id, folio, po_id, warehouse_id, received_by,
    supplier_delivery_note, quality_notes, status, photos)
  values (v_org, v_folio_rec, p_po_id, p_warehouse_id, v_user,
    p_supplier_note, p_quality_notes, 'draft', p_photos)
  returning id into v_reception_id;

  -- 5. Crear movimiento de stock (header)
  insert into public.stock_movements (organization_id, season_id, movement_type, warehouse_id,
    document_number, status, posted_at, posted_by, source_type, source_id,
    fx_rate, fx_date, created_by)
  select v_org,
    (select id from public.seasons where organization_id = v_org and status = 'active' limit 1),
    'entry_reception', p_warehouse_id, v_folio_rec, 'posted', now(), v_user,
    'purchase_order', p_po_id,
    v_fx, current_date, v_user
  returning id into v_movement_id;

  -- 6. Procesar cada línea
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select pol.*, i.native_currency into v_po_line
      from public.po_lines pol
      join public.items i on i.id = pol.item_id
      where pol.id = (v_line->>'po_line_id')::uuid;

    if v_po_line is null then continue; end if;

    -- Línea de recepción
    insert into public.reception_lines (reception_id, po_line_id, item_id,
      received_quantity, accepted_quantity, rejection_reason, supplier_lot, expiry_date)
    values (v_reception_id, v_po_line.id, v_po_line.item_id,
      (v_line->>'received_qty')::numeric, (v_line->>'accepted_qty')::numeric,
      v_line->>'rejection_reason', v_line->>'supplier_lot', (v_line->>'expiry_date')::date);

    -- Si hay cantidad aceptada → línea de movimiento + actualizar saldo
    if (v_line->>'accepted_qty')::numeric > 0 then
      perform public.add_movement_line(
        v_movement_id,
        v_po_line.item_id,
        (v_line->>'accepted_qty')::numeric,
        v_po_line.unit_cost,
        v_po_line.currency::char(3),
        'reception'  -- destination_type
      );
    end if;

    -- Actualizar received_quantity en po_line
    update public.po_lines
      set received_quantity = received_quantity + (v_line->>'received_qty')::numeric
      where id = v_po_line.id;
  end loop;

  -- 7. Actualizar status de OC
  update public.purchase_orders
    set status = case
      when (select count(*) from public.po_lines
            where po_id = p_po_id and received_quantity < quantity) = 0
      then 'received'::po_status
      else 'partially_received'::po_status
    end,
    updated_at = now()
    where id = p_po_id;

  -- 8. Cerrar recepción
  update public.receptions set status = 'accepted', stock_movement_id = v_movement_id
    where id = v_reception_id;

  return v_reception_id;
end;
$$;
```

> **Nota:** `add_movement_line` debe existir como wrapper que calcula costo promedio ponderado y actualiza `item_stock`. Si no existe aún, se crea en la misma migration replicando la lógica que ya tienes en `stock_movement_lines` triggers o RPCs.

### Edge Functions

- `generate-po-pdf` — react-pdf, plantilla con logo de org, folio, líneas, totales, condiciones de pago.
- `send-po-to-supplier` — Resend + adjunto del PDF.

### Frontend (rutas nuevas)

- `/compras` — landing con tabs: Requisiciones | Cotizaciones | Órdenes | Recepciones | Facturas
- `/compras/requisiciones/[id]` — detalle + acciones según status
- `/compras/cotizaciones/comparar?req=<id>` — comparador lado a lado
- `/compras/oc/[id]` — detalle de OC con timeline
- `/compras/recepciones/nueva?po=<id>` — wizard de recepción móvil-friendly
- `/compras/facturas` — listado + conciliación

### Tests de aceptación (Sprint 2)

- [ ] Crear requisición → solicitar 2 cotizaciones → seleccionar → generar OC.
- [ ] OC requiere aprobación de `director_sg` si total > umbral (probar con 5K y 60K).
- [ ] PDF de OC se genera y se envía a proveedor.
- [ ] Recepción parcial actualiza `po.status = 'partially_received'`.
- [ ] Recepción completa actualiza `po.status = 'received'`.
- [ ] Movimiento de stock `entry_reception` se crea con `source_type='purchase_order'`.
- [ ] `item_stock.avg_cost_native` recalcula correctamente.
- [ ] Factura con CFDI UUID duplicado → rechazo.
- [ ] Discrepancia OC vs factura > 2% → flag automático.
- [ ] RLS: solicitante solo ve sus propias requisiciones.

---

## 6. Sprint 3 — CMMS (mantenimiento)

### Migration: tablas CMMS

```sql
-- 20260301000000_cmms.sql

create type wo_type as enum ('corrective','preventive','predictive','improvement','inspection');
create type wo_priority as enum ('low','medium','high','critical');
create type wo_status as enum (
  'reported','scheduled','assigned','in_progress','waiting_parts',
  'completed','closed','cancelled'
);
create type plan_trigger_type as enum ('hours','kilometers','calendar','usage_hours');

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  name text not null,
  trigger_type plan_trigger_type not null,
  interval_value numeric not null,
  interval_unit text not null,  -- 'hours','km','days','weeks','months'
  last_execution_value numeric,
  next_execution_value numeric not null,
  advance_warning numeric default 0,  -- generar OT N unidades antes de vencer
  default_checklist jsonb default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  equipment_id uuid not null references public.equipment(id),
  wo_type wo_type not null,
  priority wo_priority not null default 'medium',
  failure_description text,
  failure_type_id uuid references public.failure_types(id),
  maintenance_plan_id uuid references public.maintenance_plans(id),
  reported_by uuid references auth.users(id),
  reported_at timestamptz not null default now(),
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  status wo_status not null default 'reported',
  primary_technician_id uuid references public.employees(id),
  helper_technician_ids uuid[],
  estimated_hours numeric,
  actual_hours numeric,
  hours_meter_open numeric,
  hours_meter_close numeric,
  downtime_minutes int,
  solution_applied text,
  notes text,
  requires_external_service boolean default false,
  external_supplier_id uuid references public.suppliers(id),
  external_service_cost_mxn numeric(18,4),
  total_cost_mxn numeric(18,4),  -- calculado: parts + labor + external
  photos_before jsonb default '[]'::jsonb,
  photos_after jsonb default '[]'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, folio)
);

create table public.wo_checklist (
  id uuid primary key default gen_random_uuid(),
  wo_id uuid not null references public.work_orders(id) on delete cascade,
  task_description text not null,
  is_completed boolean default false,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  notes text,
  display_order int default 0
);

create table public.wo_parts (
  id uuid primary key default gen_random_uuid(),
  wo_id uuid not null references public.work_orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  requested_quantity numeric(14,4) not null,
  delivered_quantity numeric(14,4) default 0,
  stock_movement_line_id uuid references public.stock_movement_lines(id),
  total_cost_mxn numeric(18,4),
  status text not null default 'requested' check (status in ('requested','delivered','partially_delivered','returned'))
);

create table public.wo_labor (
  id uuid primary key default gen_random_uuid(),
  wo_id uuid not null references public.work_orders(id) on delete cascade,
  technician_id uuid not null references public.employees(id),
  work_date date not null,
  hours numeric(6,2) not null,
  hourly_rate_mxn numeric(10,2),
  total_mxn numeric(18,4) generated always as (hours * hourly_rate_mxn) stored,
  notes text
);

-- Índices
create index idx_wo_equipment on public.work_orders(equipment_id);
create index idx_wo_org_status on public.work_orders(organization_id, status) where deleted_at is null;
create index idx_wo_technician on public.work_orders(primary_technician_id);
create index idx_wo_scheduled on public.work_orders(scheduled_date) where status in ('scheduled','assigned');
create index idx_plans_equipment on public.maintenance_plans(equipment_id) where is_active;

-- Vista materializada para KPIs (refresh nightly via pg_cron)
create materialized view public.mv_maintenance_history as
select
  e.organization_id,
  e.id as equipment_id,
  e.code, e.name,
  count(*) filter (where wo.wo_type = 'corrective' and wo.status = 'closed') as corrective_count,
  count(*) filter (where wo.wo_type = 'preventive' and wo.status = 'closed') as preventive_count,
  avg(extract(epoch from (wo.completed_at - wo.started_at)) / 3600)
    filter (where wo.status = 'closed' and wo.started_at is not null and wo.completed_at is not null)
    as mttr_hours,
  sum(wo.total_cost_mxn) filter (where wo.status = 'closed') as total_cost_mxn_last_year
from public.equipment e
left join public.work_orders wo on wo.equipment_id = e.id
  and wo.created_at > now() - interval '1 year'
where e.deleted_at is null
group by e.organization_id, e.id, e.code, e.name;

create unique index on public.mv_maintenance_history(equipment_id);
```

### RPCs CMMS

- `create_corrective_wo(equipment_id, failure_type_id, description, priority, photos)` — folio + insert.
- `assign_wo(wo_id, technician_id, helpers[], scheduled_date)` — update + notification.
- `consume_part_in_wo(wo_id, item_id, qty, warehouse_id)` — crea `wo_parts` + line en `stock_movements` tipo `exit_work_order` + actualiza `item_stock`.
- `close_wo(wo_id, solution, photos_after, hours_meter_close)` — calcula `total_cost_mxn` (parts + labor + external), valida checklist completo.
- `generate_preventive_wos()` — pg_cron diario; lee `maintenance_plans` y crea OTs cuando `current_hours + advance_warning >= next_execution_value`.

### Frontend

- `/mantenimiento` — kanban con columnas por status.
- `/mantenimiento/ot/[id]` — detalle con tabs: General | Checklist | Refacciones | Mano de obra | Evidencia.
- `/equipos/[id]` — extender con tab "Historial mantenimiento".
- Móvil: levantamiento de falla rápido (foto + descripción + equipment scan).

### Tests de aceptación (Sprint 3)

- [ ] Operador levanta falla → OT en `reported`.
- [ ] Coordinador asigna técnico → status `assigned` + notificación.
- [ ] Técnico consume refacción → `stock_movements` con `source_type='work_order'` + `item_stock` decrementa.
- [ ] Plan preventivo a 250 hrs, equipo en 230 con advance_warning=20 → OT auto-creada.
- [ ] Cerrar OT sin checklist completo → warning bloqueante (override con motivo).
- [ ] `total_cost_mxn` se calcula correctamente al cerrar.
- [ ] MTBF y MTTR en vista materializada.

---

## 7. Sprint 4 — Combustible expandido

### Migration: tanques y dispensación

```sql
-- 20260315000000_fuel_management.sql

create type fuel_type as enum ('diesel','gasoline_regular','gasoline_premium');

create table public.fuel_tanks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  location text,
  fuel_type fuel_type not null,
  capacity_liters numeric(12,2) not null,
  current_level_liters numeric(12,2) not null default 0,
  min_level_alert numeric(12,2),
  current_avg_cost_mxn numeric(12,4) default 0,
  is_active boolean not null default true,
  last_physical_inventory_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, code)
);

create table public.tank_loads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  tank_id uuid not null references public.fuel_tanks(id),
  load_date timestamptz not null default now(),
  supplier_id uuid references public.suppliers(id),
  supplier_invoice_id uuid references public.supplier_invoices(id),
  liters numeric(12,2) not null check (liters > 0),
  unit_cost_mxn numeric(12,4) not null,
  total_mxn numeric(18,4) generated always as (liters * unit_cost_mxn) stored,
  received_by uuid references auth.users(id),
  level_before numeric(12,2),
  level_after numeric(12,2),
  evidence_urls jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now()
);

create table public.tank_dispensing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  tank_id uuid not null references public.fuel_tanks(id),
  dispensed_at timestamptz not null default now(),
  operator_employee_id uuid references public.employees(id),
  equipment_id uuid references public.equipment(id),
  liters numeric(12,2) not null check (liters > 0),
  hours_meter numeric,
  km_meter numeric,
  crop_lot_id uuid references public.crops_lots(id),
  unit_cost_mxn numeric(12,4) not null,  -- snapshot del costo del tanque al momento
  total_mxn numeric(18,4) generated always as (liters * unit_cost_mxn) stored,
  stock_movement_id uuid references public.stock_movements(id),
  evidence_urls jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now(),
  unique(organization_id, folio)
);

create index idx_tank_org on public.fuel_tanks(organization_id) where deleted_at is null;
create index idx_dispensing_equipment on public.tank_dispensing(equipment_id, dispensed_at desc);
create index idx_dispensing_lot on public.tank_dispensing(crop_lot_id);
create index idx_dispensing_operator on public.tank_dispensing(operator_employee_id);
```

### Triggers de saldo del tanque

```sql
create or replace function public.update_tank_level_on_load()
returns trigger language plpgsql as $$
begin
  -- Weighted average
  update public.fuel_tanks set
    current_level_liters = current_level_liters + new.liters,
    current_avg_cost_mxn = case
      when current_level_liters + new.liters > 0 then
        ((current_level_liters * current_avg_cost_mxn) + (new.liters * new.unit_cost_mxn))
        / (current_level_liters + new.liters)
      else new.unit_cost_mxn
    end,
    updated_at = now()
  where id = new.tank_id;
  return new;
end;
$$;

create trigger trg_tank_load_level
  after insert on public.tank_loads
  for each row execute function public.update_tank_level_on_load();

create or replace function public.update_tank_level_on_dispensing()
returns trigger language plpgsql as $$
begin
  -- Snapshot cost + decrement level
  new.unit_cost_mxn := coalesce(new.unit_cost_mxn, (select current_avg_cost_mxn from public.fuel_tanks where id = new.tank_id));

  update public.fuel_tanks set
    current_level_liters = current_level_liters - new.liters,
    updated_at = now()
  where id = new.tank_id;

  -- Si nivel < min_alert → registrar alerta (Sprint 7 implementa notifications)
  return new;
end;
$$;

create trigger trg_dispensing_level
  before insert on public.tank_dispensing
  for each row execute function public.update_tank_level_on_dispensing();
```

### RPCs

- `dispense_fuel(tank_id, equipment_id, liters, hours_meter, crop_lot_id, operator_id)` — valida nivel suficiente, crea registro, actualiza equipment.current_hours.
- `tank_physical_inventory(tank_id, real_level, notes)` — crea ajuste si hay discrepancia.

### Frontend

- `/combustible/tanques` — lista de tanques con nivel visual (barra).
- `/combustible/cargas` — registrar carga (form con vínculo opcional a factura).
- `/combustible/dispensar` — móvil-first, captura rápida: tanque → equipo → litros → horómetro.
- `/combustible/rendimiento` — KPI por equipo (l/hr, l/km, tendencia).

### Tests (Sprint 4)

- [ ] Carga de 1000 L a $24/L sobre tanque con 200 L a $22/L → nivel 1200 L, avg $23.67.
- [ ] Dispensar 50 L → nivel decrementa, `equipment.current_hours` actualiza si se pasa horómetro.
- [ ] Horómetro reportado < anterior → trigger requiere justificación.
- [ ] Inventario físico con diferencia genera ajuste auditable.

---

## 8. Sprint 5 — Flotilla + Servicios externos

### Flotilla

```sql
-- 20260322000000_fleet.sql

create table public.equipment_logbook (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  log_date date not null,
  operator_employee_id uuid not null references public.employees(id),
  hours_start numeric,
  hours_end numeric,
  km_start numeric,
  km_end numeric,
  hours_worked numeric generated always as (hours_end - hours_start) stored,
  km_traveled numeric generated always as (km_end - km_start) stored,
  crop_lot_id uuid references public.crops_lots(id),
  activity text,
  notes text,
  photos jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  unique(equipment_id, log_date, operator_employee_id)
);

create table public.equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  operator_employee_id uuid not null references public.employees(id),
  start_date date not null,
  end_date date,  -- null = vigente
  notes text,
  created_at timestamptz default now()
);

create index idx_logbook_eq_date on public.equipment_logbook(equipment_id, log_date desc);
create index idx_assignments_active on public.equipment_assignments(equipment_id) where end_date is null;
```

### Servicios externos

```sql
-- 20260322000100_external_services.sql

create type contract_frequency as enum ('one_time','weekly','biweekly','monthly','on_demand');
create type contract_status as enum ('active','paused','finished','cancelled');
create type service_event_status as enum ('scheduled','in_progress','completed','incident');

create table public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  service_type_id uuid not null references public.service_types(id),
  description text,
  start_date date not null,
  end_date date,
  total_amount_mxn numeric(18,4),
  currency currency_code not null default 'MXN',
  frequency contract_frequency not null,
  status contract_status not null default 'active',
  contract_file_url text,
  responsible_user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.service_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  contract_id uuid not null references public.service_contracts(id),
  scheduled_date date not null,
  execution_date date,
  status service_event_status not null default 'scheduled',
  event_amount_mxn numeric(18,4),
  validator_id uuid references auth.users(id),
  rating int check (rating between 1 and 5),
  notes text,
  evidence_urls jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index idx_contracts_supplier on public.service_contracts(supplier_id) where deleted_at is null;
create index idx_events_contract on public.service_events(contract_id, scheduled_date desc);
```

### Frontend

- `/flotilla/bitacora` — captura diaria móvil, una pantalla por equipo.
- `/flotilla/asignaciones` — tabla operador ↔ equipo con vigencias.
- `/servicios/contratos` — CRUD contratos.
- `/servicios/eventos` — calendario + validación de evento ejecutado.

### Tests (Sprint 5)

- [ ] Bitácora del día actualiza `equipment.current_hours`.
- [ ] Contrato mensual con fecha de inicio → eventos programados auto-generados por pg_cron.
- [ ] Evento validado con calificación + foto.

---

## 9. Sprint 6 — Activos fijos + Reportes nuevos

### Activos fijos

```sql
-- 20260329000000_fixed_assets.sql

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  description text not null,
  asset_category text,
  equipment_id uuid references public.equipment(id),  -- si también es mantenible
  acquisition_date date not null,
  acquisition_cost numeric(18,4) not null,
  currency currency_code not null,
  useful_life_months int not null,
  residual_value numeric(18,4) default 0,
  depreciation_method text default 'straight_line' check (depreciation_method in ('straight_line')),
  accumulated_depreciation_mxn numeric(18,4) default 0,
  book_value_mxn numeric(18,4),  -- calculado por job mensual
  location text,
  responsible_user_id uuid references auth.users(id),
  status text not null default 'in_use' check (status in ('in_use','stored','disposed','sold')),
  invoice_url text,
  primary_photo_url text,
  photos jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(organization_id, code)
);

create table public.depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fixed_assets(id),
  period_year int not null,
  period_month int not null,
  depreciation_amount_mxn numeric(18,4) not null,
  accumulated_after numeric(18,4) not null,
  book_value_after numeric(18,4) not null,
  ran_at timestamptz default now(),
  unique(asset_id, period_year, period_month)
);
```

### pg_cron jobs

```sql
-- Depreciación mensual día 1 a las 03:00 CDMX
select cron.schedule(
  'monthly_depreciation', '0 9 1 * *',
  $$ select public.run_monthly_depreciation(); $$
);

-- Refresh MV mantenimiento cada noche 02:00 CDMX
select cron.schedule(
  'refresh_maintenance_kpis', '0 8 * * *',
  $$ refresh materialized view concurrently public.mv_maintenance_history; $$
);

-- Generar OTs preventivas diariamente 09:00 CDMX
select cron.schedule(
  'generate_preventive_wos', '0 15 * * *',
  $$ select public.generate_preventive_wos(); $$
);
```

### Reportes nuevos (Edge Functions o vistas materializadas)

1. Compras por proveedor con SLA de entrega
2. Comparativo de cotizaciones (ahorro por elección)
3. MTBF / MTTR / Disponibilidad por equipo
4. Cumplimiento plan preventivo
5. Consumo combustible (tanque / equipo / lote / operador)
6. Rendimiento equipos (l/hr, l/km)
7. Servicios externos: gasto + calificación
8. Activos fijos: valor en libros

---

## 10. Sprint 7 — Cockpit del Director + Notificaciones + Hardening

### Notificaciones

```sql
-- 20260405000000_notifications.sql

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  type text not null,
  title text not null,
  body text,
  link text,
  severity text default 'info' check (severity in ('info','warning','critical')),
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type text not null,  -- 'low_stock','low_fuel','overdue_preventive','invoice_discrepancy','pending_approval'
  severity text not null,
  title text not null,
  description text,
  entity_type text,
  entity_id uuid,
  recipient_role_filter user_role[],
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  read_by jsonb default '[]'::jsonb
);

create index idx_notif_user_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index idx_alerts_org_active on public.alerts(organization_id) where resolved_at is null;
```

### Cockpit del Director — ruta `/inicio` (reemplaza/extiende la home actual)

Secciones (cada una en su propio query o RPC `dashboard_director_summary(org_id)`):

1. Alertas activas (chips coloreados, top 8)
2. Indicadores del día: salidas valorizadas, recepciones pendientes, OTs abiertas por prioridad, requisiciones esperando aprobación, combustible disponible global
3. Aprobaciones pendientes (con acción inline)
4. Gasto mensual por categoría (donut) + comparativo mes anterior
5. Top 5 equipos con más costo de mantenimiento del mes
6. Lotes: costo acumulado vs presupuesto
7. Top 10 ítems con rotación alta/baja

### Hardening

- [ ] Audit triggers en TODAS las nuevas tablas mutables
- [ ] RLS revisada con `security-auditor` por cada tabla nueva
- [ ] pgTAP para todas las RPCs financieras
- [ ] Backup test + restore drill
- [ ] Performance budgets verificados
- [ ] Manual del Director SG en español
- [ ] Onboarding tour (5 pasos)

---

## 11. Mapping de cambios — vista de una página

| Capa actual | Cambio | Sprint |
|---|---|---|
| `profiles.role` (text) | Migrar a `user_roles` (N:M, enum) | 0 |
| `organizations.approval_threshold_mxn` (numeric) | Mover a `settings` jsonb con tiers | 0 |
| `equipment` (campos básicos) | Agregar `status, kind, serial_number, responsible_employee_id, acquisition_*, photos` | 0 |
| `stock_movements.movement_type` (check) | Agregar 4 nuevos tipos + columnas `source_type/source_id` | 0 |
| `audit_log`, `fx_rates`, `seasons` | Sin cambios | — |
| `items`, `item_stock`, `stock_movement_lines` | Sin cambios estructurales (alimentados por nuevos source_type) | — |
| **Nuevo:** compras (9 tablas) | Agregar todo | 2 |
| **Nuevo:** CMMS (5 tablas + MV) | Agregar todo | 3 |
| **Nuevo:** combustible avanzado (3 tablas) | Agregar todo | 4 |
| **Nuevo:** flotilla (2 tablas) | Agregar todo | 5 |
| **Nuevo:** servicios externos (2 tablas) | Agregar todo | 5 |
| **Nuevo:** activos fijos (2 tablas) | Agregar todo | 6 |
| **Nuevo:** notificaciones + alertas (2 tablas) | Agregar todo | 7 |
| **Nuevo:** helpers transversales | `next_folio`, `has_role`, `required_approval_role`, `process_reception`, etc. | 0-7 |

---

## 12. Checklist de cierre del proyecto (post-Sprint 7)

- [ ] Todos los tests pgTAP pasando.
- [ ] Lighthouse score > 90 en `/inicio`.
- [ ] Manual de usuario por rol generado.
- [ ] Aviso de privacidad LFPDPPP firmado por counsel.
- [ ] Contrato B2B template listo (encargado/responsable).
- [ ] Backup drill ejecutado.
- [ ] pg_cron jobs corriendo en staging.
- [ ] DOF FIX sync funcionando.
- [ ] Resend integrado con templates.
- [ ] Onboarding completado para piloto con primer cliente.

---

## 13. Cómo usar este documento con Claude Code

1. **Pega este `MIGRATION.md` en la raíz del repo**, junto al `CLAUDE.md` actual.
2. **Instala los 15 subagentes** en `.claude/agents/`.
3. **Arranca cada sprint con `tech-lead`**:

   ```
   > usa tech-lead: ejecutemos Sprint 0 del MIGRATION.md.
     Quiero las 5 migraciones, tests pgTAP, regenerar types,
     y actualizar usePermissions() en frontend.
   ```

4. `tech-lead` invocará automáticamente a `database-architect`, `senior-developer`, `qa-engineer` y `frontend-engineer` en el orden correcto, y te entregará el sprint completo.

5. Al cierre de cada sprint, `code-reviewer` + `security-auditor` hacen barrida final antes de merge a `main`.

---

**Este documento es la fuente de verdad para la migración.** El `CLAUDE.md` original sigue gobernando convenciones de código y arquitectura existente. Donde haya conflicto, `MIGRATION.md` gana para tablas/módulos nuevos; `CLAUDE.md` gana para los existentes.
