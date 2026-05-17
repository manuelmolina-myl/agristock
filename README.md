# AgriStock

AgriStock is a multi-tenant SaaS for Mexican agricultural operations: inventory, fuel (diesel), purchasing, maintenance (CMMS), and reporting in a single PWA. UI is Spanish; code, schema, and docs are in English.

**Live:** https://agristock-seven.vercel.app

## Quick start

```bash
git clone <repo-url> agristock
cd agristock
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

App runs at `http://localhost:5173`.

## Required environment variables

In `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(Values come from the Supabase project linked to this repo.)

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production bundle + PWA assets |
| `npm run typecheck` | TypeScript only, no bundle |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the built `dist/` locally |
| `npx supabase db push --linked` | Apply pending migrations to the linked Supabase project |
| `vercel --prod --yes` | Manual production deploy (normally automatic on `main`) |

## Modules

- **Almacén** (`/almacen`) — inventory items, entries, exits, transfers between warehouses, diesel dispensing, lots.
- **Compras** (`/compras`) — requisitions, quotations & comparator, purchase orders, receptions, supplier invoices, supplier catalog.
- **Mantenimiento** (`/mantenimiento`) — work orders, equipment registry, preventive maintenance plans.
- **Configuración** (`/configuracion`) — catalogs, FX rates, audit log, season closeout.
- **Reportes** (`/reportes`) — built-in reports with PDF / XLSX export.

Roles (org-scoped, multi-role per user, stored in `user_roles`): `admin`, `almacenista`, `compras`, `mantenimiento`.

## Deployment

- **Frontend:** push to `main` → Vercel auto-deploys via GitHub integration. Manual deploys via `vercel --prod --yes`.
- **Database:** Supabase migrations live in `supabase/migrations/` (sequential, forward-only). Apply with `npx supabase db push --linked`. Not automated — run manually from the CLI against the linked project.

## Project structure

```
src/
  components/
    ui/         # primitives (Base UI + shadcn-style)
    custom/     # app-specific (KpiCard, PageHeader, MoneyDisplay, ...)
    layout/     # AppLayout, sidebar, header, mobile-nav
  hooks/        # use-auth, use-permissions, ...
  lib/          # database.types, errors, status-colors, constants
  pages/        # one folder per route group
supabase/
  migrations/   # 001 … 034
```

## AI-assistant context

If you're using Claude Code or another AI assistant in this repo, read `CLAUDE.md` at the repo root — it documents conventions, gotchas, and the architecture decisions that aren't obvious from the source alone.

## Tech stack

React 19 · TypeScript · Vite · Tailwind v4 · `@base-ui/react` · TanStack Query v5 · React Hook Form + Zod · Supabase (Postgres + Auth + Storage) · PWA · Vercel.
