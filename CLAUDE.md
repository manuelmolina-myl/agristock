# CLAUDE.md — AgriStock v2

Context for Claude Code sessions joining this project mid-flight. Keep tight, load-bearing.

## Stack
- React 19 + TypeScript + Vite + Tailwind (v4)
- `@base-ui/react` (Select, Dialog with Portal)
- TanStack Query v5, React Hook Form + Zod, sonner toasts
- Supabase (Postgres 15+ + Auth + Storage), PWA via `vite-plugin-pwa`
- Vercel hosting (`agristock-seven.vercel.app`), GitHub `main` auto-deploys
- Misc: Recharts, jsPDF + jspdf-autotable, xlsx, framer-motion, zustand, Sentry

## Architecture
- **Module-based routing** (not role-based): `/almacen`, `/compras`, `/mantenimiento`, `/configuracion`, `/reportes`.
  - Legacy role routes (`/admin/*`, `/almacenista/*`, `/supervisor/*`, `/gerente/*`) still wired in `src/App.tsx` during the transition — don't delete yet.
- **Roles** (simplified to 4): `admin`, `almacenista`, `compras`, `mantenimiento`.
  - Storage: `user_roles` table (org-scoped, revocable, multi-role per user).
  - The `profiles.role` column is **legacy** but still read by `use-auth` — don't drop it.
- **Multi-tenant** via `organization_id` on every business table + RLS using the `auth_org_id()` SECURITY DEFINER helper.
  - Tenant isolation is the foundation; never bypass it.

## Code conventions
- Path alias: `@/` → `src/`
- Primitives live in `@/components/ui/*`; app-specific in `@/components/custom/*` (`KpiCard`, `PageHeader`, `MoneyDisplay`, `EmptyState`, `CurrencyBadge`, `SeasonBadge`, `StockIndicator`).
- **Errors:** always use `formatSupabaseError` from `@/lib/errors`. Never `err instanceof Error ? err.message : 'Error'` — Supabase returns plain objects, not `Error` instances.
- **Status colors:** use helpers in `@/lib/status-colors`, not inline Tailwind palette (`bg-red-50`, etc.). Semantic tokens only:
  - `bg-destructive/10`, `text-success`, `bg-warning`, `text-usd` (info/blue accent).
- **Forms inside Dialog:** use `<Button type="button" onClick={handleSubmit(onSubmit)}>`. The `form="id"` pattern does **not** resolve inside `Dialog.Portal`.

## Supabase migrations
- Path: `supabase/migrations/`. Forward-only, sequential numbering (currently up to `034_drop_legacy_columns.sql`).
- pgcrypto: always prefix with `extensions.crypt()`, `extensions.gen_salt()`. The CLI `search_path` doesn't include `extensions`.
- Apply with: `npx supabase db push --linked` (or add `--include-all` for a full sweep).
- `src/lib/database.types.ts` is **hand-maintained**, not auto-generated. Update it when schema changes.

## Build & deploy
- Build: `npm run build` (TS check + Vite bundle + PWA gen). Must pass before any push.
- Production deploy: pushing to `main` auto-deploys via Vercel GitHub integration, or `vercel --prod --yes` from CLI.
- Migration deploy: `npx supabase db push --linked` against the linked project.

## Things that bit us (recurring gotchas)
- **Base UI `Select` needs an `items` prop on `<Select.Root>`** for the trigger to render labels instead of raw UUIDs. Use `extractSelectItems()` + the Context registry in `@/components/ui/select`.
- **`sync_profile_role_to_user_roles` trigger** uses `ON CONFLICT ... DO UPDATE SET revoked_at = null` (not `DO NOTHING`), otherwise stale revoked rows block role grants.
- **RPCs `process_reception`, `create_corrective_wo`, `required_approval_role`** reference the 4 current roles (`admin`, `compras`, `mantenimiento`, `almacenista`). The 9-role enum is gone.
- **TanStack Query v5 keys:** prefer `['scope', { orgId, ... }]` for surgical invalidation; don't use flat positional filter args.

## Skills + agents in this repo
- `.claude/agents/` ships subagents: `tech-lead`, `senior-developer`, `database-architect`, `frontend-engineer`, `ui-designer`, `qa-engineer`, `security-auditor`, `code-reviewer`, `bug-hunter`, `performance-engineer`, `devops-engineer`, `integration-specialist`, `compliance-officer`, `product-strategist`, `docs-writer`. Dispatch them when a task fits their description. Orchestrator pattern: parallel agents for independent file partitions.
- `.claude/skills/` ships `frontend-design`, `vercel-react-best-practices`, `web-design-guidelines`, `find-skills`. Apply when designing UI or auditing.

## What NOT to do
- Don't use the 9-role enum (`director_sg`, `supervisor_campo`, `coordinador_compras`, etc.) — gone since migration `024_simplify_roles_to_4.sql`.
- Don't introduce new generic toast messages — always `formatSupabaseError`.
- Don't push `--force` to `main`.
- Don't disable RLS to debug — write a `SECURITY DEFINER` helper instead.
- Don't add hardcoded color classes when a semantic token exists.
- Don't auto-generate `database.types.ts` over the hand-maintained file.

## Quick reference
- Routing: `src/App.tsx`
- Auth/roles hook: `src/hooks/use-auth.tsx`, `src/hooks/use-permissions.tsx`
- Types: `src/lib/database.types.ts`
- Errors / colors: `src/lib/errors.ts`, `src/lib/status-colors.ts`
- Constants (route maps): `src/lib/constants.ts`
- Migrations: `supabase/migrations/001_*.sql` … `034_*.sql`
- Sprint history: `MIGRATION.md`, `SPRINT_0_STATUS.md`
