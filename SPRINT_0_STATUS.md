# Sprint 0 — Status

> Refactor transversal: roles N:M, organization settings, equipment CMMS-ready, stock movement types, helpers.

**Fecha:** 2026-05-15
**Estado:** Migraciones + tipos + hook listos; pendiente aplicar a Supabase + barrido frontend.

---

## ✅ Entregado

### Migraciones (6 archivos, `supabase/migrations/`)

| Archivo | Propósito |
|---|---|
| `013_user_roles_table.sql` | Enum `user_role` (9 valores), tabla `user_roles` N:M, RLS, backfill desde `profiles.role`, helpers `has_role()` + `current_user_roles()`, `auth_role()` re-apuntado para compat legacy, audit trigger |
| `014_organization_settings.sql` | `organizations.settings jsonb` con tiers de aprobación escalonados (purchase / stock_exit / work_order), helper `required_approval_role()` |
| `015_equipment_cmms_fields.sql` | Enums `equipment_status` + `equipment_kind`, columnas CMMS (serial, photos, responsable, adquisición, póliza), backfill `type → kind`, índices |
| `016_stock_movement_types_extend.sql` | Extiende CHECK con 4 nuevos tipos (`entry_reception`, `exit_work_order`, `exit_fuel_dispensing`, `exit_external_service`), columnas polimórficas `source_type` + `source_id` |
| `017_helper_functions.sql` | Tabla `folio_sequences`, función `next_folio(org, type)` con prefijos REQ/COT/OC/REC/OT/CMB/SRV, domain `currency_code` (MXN \| USD), RLS |
| `018_sync_legacy_to_new.sql` | Triggers de sync transitorios: `profiles.role` → `user_roles` para nuevos signups; `equipment.type` → `equipment.kind` automático |

### Tests pgTAP

`supabase/tests/sprint_0_helpers.sql` — 13 casos:
- enum size, tabla existe, `has_role` true/false, `auth_role` función existe, `required_approval_role` tiers 5K + 60K, `next_folio` secuencial OC/REQ, equipment enums, `stock_movements` acepta nuevo tipo, `currency_code` rechaza EUR.

### Frontend

| Archivo | Cambio |
|---|---|
| `src/lib/database.types.ts` | Añadidos `UserRoleEnum` (9 valores), `PermissionClaim`, `EquipmentStatus`, `EquipmentKind`, `MovementSourceType`; tipos legacy preservados |
| `src/hooks/use-permissions.tsx` | **Nuevo hook**: `roles`, `hasRole`, `hasAnyRole`, `can(claim)`. Backed por RPC `current_user_roles()` con TanStack Query (`staleTime: 5min`). Mapa `CLAIM_ROLES` para 12 claims. |
| `src/pages/admin/inventario/items-page.tsx` | **Ejemplo de migración**: `profile.role === 'almacenista'` → `usePermissions().can('costs.view')`. Patrón a replicar en el resto del barrido. |

### Decisiones tomadas

1. **Filenames:** continuamos convención sequential (`013_*.sql` ... `018_*.sql`), no `YYYYMMDDHHMMSS_*` que asume MIGRATION.md (el repo ya tiene 001-012 sequential).
2. **Mapeo de roles** (basado en valores reales del repo, no los hipotéticos de MIGRATION.md):
   | Legacy `profiles.role` | Nuevo `user_roles` |
   |---|---|
   | `super_admin` | `super_admin` + `director_sg` (memory: el super_admin actual es org-admin) |
   | `admin` | `director_sg` (usado por `fn_handle_new_user` para nuevos signups) |
   | `gerente` | `director_sg` |
   | `supervisor` | `coordinador_compras` + `coordinador_mantenimiento` |
   | `almacenista` | `almacenista` |
3. **`solicitudes` y `purchase_requisitions` coexisten** — son flujos distintos (stock-exit interno vs procurement externo). Tu plan Sprint 2 agrega purchase_requisitions sin tocar solicitudes.
4. **`auth_role()` reapuntado a `user_roles`** devolviendo strings legacy (`gerente`, `almacenista`, `super_admin`, `supervisor`) — todas las RLS existentes en `001_schema.sql` siguen funcionando sin reescribirlas.
5. **`profiles.role` NO se elimina aún** — su drop está pendiente hasta cerrar el barrido frontend (movido a Sprint 1, no Sprint 0). El sync trigger (018) mantiene consistencia mientras tanto.
6. **`equipment.kind` derivado por trigger** desde `equipment.type` para nuevos inserts — preserva compat con código frontend legacy.
7. **`stock_movement_type` values reales** del repo: el actual tiene `exit_waste` + `exit_sale` (no `exit_disposal` como asumió MIGRATION.md). Conservé los reales y añadí los nuevos.

---

## ⚠️ Pendiente — no hecho en este turno

### 1. Aplicar migraciones a Supabase
```bash
# Local con Docker:
supabase db reset

# O remoto:
supabase db push --project-ref <tu-ref>
```
**Riesgo:** sin aplicar, no he probado las migraciones contra Postgres real. La sintaxis se verificó manualmente pero un `supabase start && supabase db reset` puede revelar errores.

### 2. Barrido completo del frontend (14 archivos restantes)
Lugares donde aún se lee `profile.role` (mapeo según `Explore` agent):

| Archivo | Líneas | Acción sugerida |
|---|---|---|
| `src/App.tsx` | 79-88 | `ROLE_ROUTES[profile.role]` para enrutado inicial → mantener legacy por ahora (el lookup sigue funcionando con `profile.role`) |
| `src/hooks/use-auth.tsx` | 135 | Return type `{ role: UserRole }` — actualizar a `UserRoleEnum[]` o conservar para back-compat |
| `src/hooks/use-base-path.ts` | 11-26 | Similar a App.tsx — base-path lookup, mantener legacy |
| `src/pages/landing-page.tsx` | 51-333 | Rendering UI por rol — actualizar a `usePermissions().hasAnyRole([...])` |
| `src/components/layout/protected-route.tsx` | 67-68 | `allowedRoles: UserRole[]` → migrar a claim-based `requiredClaim?: PermissionClaim` |
| `src/components/layout/app-sidebar.tsx` | 210, 257 | Mostrar etiqueta de rol — derivar de `usePermissions().roles[0]` con mapa de display |
| `src/components/layout/app-header.tsx` | 66, 201, 273 | Similar a sidebar |
| `src/components/layout/mobile-nav.tsx` | 30-31, 133 | Similar |
| `src/components/search/command-search.tsx` | 42 | Filtrado de comandos por rol |
| `src/pages/admin/configuracion/users-tab.tsx` | 102-183 | UI de gestión de usuarios — debe operar contra `user_roles` (insert/revoke), no contra `profiles.role` |

**Estimación:** ~4-6 horas de trabajo cuidadoso + regresión manual. Mejor abordar en Sprint 1 con tiempo dedicado para QA.

### 3. Drop legacy columns
Al cierre de Sprint 1 (post-barrido):
```sql
alter table public.profiles drop column role;
alter table public.organizations drop column approval_threshold_mxn;
alter table public.equipment drop column type;  -- después de Sprint 3 (CMMS)
```

### 4. Code review formal + security audit
Los subagentes `code-reviewer` y `security-auditor` no estaban disponibles como `subagent_type` en esta sesión. Hice un audit interno (ver §"Riesgos auditados internamente" abajo) y añadí migración 018 para los gaps encontrados. Recomendado: en próxima sesión, invocar explícitamente.

### 5. Sprints 1-7
~10-11 semanas de trabajo restante. Cada sprint subsiguiente arranca con `tech-lead` orquestando.

---

## 🔍 Riesgos auditados internamente (y mitigaciones aplicadas)

| Riesgo | Estado | Mitigación |
|---|---|---|
| `auth_role()` change rompe RLS existentes | ✅ Mitigado | Devuelve strings legacy (`gerente`, etc.), RLS no se reescribe |
| Nuevos signups no entran en `user_roles` | ✅ Mitigado | Migración 018 trigger `trg_sync_profile_role` |
| Nuevos `equipment` quedan con `kind = NULL` | ✅ Mitigado | Migración 018 trigger `trg_derive_equipment_kind` |
| `SECURITY DEFINER` sin `search_path` (vector de inyección) | ✅ Verificado | Todas las funciones tienen `set search_path = public, pg_temp` |
| `service_role` filtrado a cliente | ✅ Verificado | No tocado en este sprint; solo se usa `auth.uid()` |
| Pérdida de datos | ✅ Mitigado | Solo ALTER ADD + CREATE; no DROP en este sprint |
| `currency_code` domain inconsistente con código existente | ⚠️ Bajo | El código existente usa `Currency = 'MXN' \| 'USD'`. El domain DB es estrictamente `char(3)` con CHECK; tipos compatibles |
| `solicitudes` redundante con `purchase_requisitions` futura | ⚠️ A revisar Sprint 2 | Decisión: coexisten porque son flujos diferentes; revalidar con `senior-developer` antes de Sprint 2 |
| Sin tests automáticos corriendo en CI | ⚠️ Pendiente | Sprint 1 debería agregar GitHub Action que corra `supabase test db` |

---

## 🎯 Para Manuel — acciones inmediatas

1. **Revisar** los 6 archivos de migración (013-018). Especial atención al mapeo de roles (¿`supervisor` → ambos coordinadores está bien?).
2. **Aplicar localmente y correr tests pgTAP:**
   ```bash
   supabase start
   supabase db reset
   supabase test db
   ```
3. **Decidir si abrir el sprint 1 inmediatamente** (barrido frontend + dropping legacy) o pausar.
4. **Confirmar coexistencia `solicitudes` + `purchase_requisitions`** o decidir migración antes de Sprint 2.

---

## 📁 Archivos modificados/creados

```
A  MIGRATION.md
A  SPRINT_0_STATUS.md
A  supabase/migrations/013_user_roles_table.sql
A  supabase/migrations/014_organization_settings.sql
A  supabase/migrations/015_equipment_cmms_fields.sql
A  supabase/migrations/016_stock_movement_types_extend.sql
A  supabase/migrations/017_helper_functions.sql
A  supabase/migrations/018_sync_legacy_to_new.sql
A  supabase/tests/sprint_0_helpers.sql
A  src/hooks/use-permissions.tsx
M  src/lib/database.types.ts
M  src/pages/admin/inventario/items-page.tsx
A  .claude/agents/  (15 subagentes — instalados en pasos previos)
```
