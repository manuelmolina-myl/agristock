-- ============================================================================
-- 036_fix_requisition_lines_rls.sql — Fix 42501 on requisition_lines INSERT
--
-- Reported symptom (3rd recurrence):
--   "new row violates row-level security policy for table requisition_lines"
--   when creating a new purchase requisition from the UI.
--
-- Root cause:
--   The client (`useCreateRequisition` in src/features/compras/hooks.ts) inserts
--   the parent `purchase_requisitions` row with `status = 'submitted'` so that
--   it shows up in the admin/compras inbox right away.  The RLS policy
--   `rl_write` on `requisition_lines` (defined in migration 020 and NEVER
--   updated by 025/026/032) reads:
--
--     can_write_purchase(auth.uid())
--       OR (pr.requester_id = auth.uid() AND pr.status = 'draft')
--
--   Because the parent is `'submitted'` (not `'draft'`) at the moment the
--   child lines are inserted in the same logical operation, the requester-
--   fallback evaluates to FALSE.  The user therefore must be admin/compras
--   for the line insert to succeed.  Meanwhile the parent `pr_insert` policy
--   only checks `requester_id = auth.uid()`, so it always succeeds — leaving
--   an inconsistent privilege gate: any org member can create a parent, but
--   only admin/compras can attach lines to it.  Combined with stale
--   `user_roles` rows (revoked by the legacy-role cleanup in migration 025
--   and only repaired going forward by the trigger in 032), even admin users
--   intermittently fail this check.
--
-- Fix:
--   1. Rewrite `rl_write` so the requester fallback applies regardless of
--      parent status.  Rationale: lines are physically owned by the parent
--      (FK ON DELETE CASCADE).  If you are allowed to read/own the parent,
--      you are allowed to manage its lines.  Status-based locking belongs
--      on the parent (`pr_update`), not on its dependent rows.
--   2. Belt-and-suspenders: idempotently re-grant a non-revoked `user_roles`
--      row for every profile that still has a legacy `profiles.role` value.
--      Migration 032's trigger only fires on FUTURE profile updates;
--      historical revoked rows from migration 025's mass cleanup remain.
--
-- This migration is idempotent and safe to re-run.
-- ============================================================================

-- ─── 1. Rewrite requisition_lines write policy ──────────────────────────────
drop policy if exists rl_write on public.requisition_lines;

create policy rl_write on public.requisition_lines for all
  using (
    exists (
      select 1 from public.purchase_requisitions pr
       where pr.id = requisition_id
         and pr.organization_id = public.auth_org_id()
         and (
           public.can_write_purchase(auth.uid())
           or pr.requester_id = auth.uid()
         )
    )
  )
  with check (
    exists (
      select 1 from public.purchase_requisitions pr
       where pr.id = requisition_id
         and pr.organization_id = public.auth_org_id()
         and (
           public.can_write_purchase(auth.uid())
           or pr.requester_id = auth.uid()
         )
    )
  );

-- ─── 2. Reactivate stale user_roles rows from profiles.role ────────────────
-- This is a no-op on a clean install; on an upgrade path where 025 revoked
-- a row that 026's backfill couldn't restore (because the user got their
-- enum role re-inserted with `ON CONFLICT DO NOTHING`, leaving the old
-- revoked row in place), this will clear the revoked flag.
update public.user_roles ur
   set revoked_at = null,
       revoked_by = null
  from public.profiles p
 where ur.user_id = p.id
   and ur.organization_id = p.organization_id
   and ur.role::text = p.role
   and ur.revoked_at is not null
   and p.role in ('admin', 'compras', 'mantenimiento', 'almacenista');

-- And insert any missing rows that should exist per profiles.role but don't.
insert into public.user_roles (organization_id, user_id, role)
select p.organization_id, p.id, p.role::user_role
  from public.profiles p
 where p.role in ('admin', 'compras', 'mantenimiento', 'almacenista')
   and p.organization_id is not null
on conflict (organization_id, user_id, role) do update
  set revoked_at = null, revoked_by = null;

-- ─── 3. Sanity grant — keep helper accessible to authenticated role ─────────
-- The helper is SECURITY DEFINER so the search_path matters more than the
-- grant, but we re-assert here to avoid surprises on a fresh-rebuilt DB.
grant execute on function public.can_write_purchase(uuid) to authenticated;

comment on policy rl_write on public.requisition_lines is
  'Write access to requisition_lines: org-scoped, AND either (a) caller can_write_purchase, OR (b) caller is the requester of the parent. Status check removed in 036 — see migration header for rationale.';
