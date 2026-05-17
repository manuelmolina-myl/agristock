/**
 * usePermissions — claim-based authorization for the new user_roles model.
 *
 * Backed by the Postgres RPC `current_user_roles()` (013_user_roles_table.sql)
 * which returns the set of `user_role` enum values granted to auth.uid(),
 * sorted from highest to lowest privilege.
 *
 * Returned API:
 *   - roles: UserRoleEnum[]               every role the user holds
 *   - isLoading: boolean                  query in-flight
 *   - hasRole(role): boolean              exact role membership
 *   - hasAnyRole(roles): boolean          OR-combine roles
 *   - can(claim): boolean                 permission check via CLAIM_ROLES map
 *
 * Legacy `profile.role` continues to work; this hook is additive.
 * Consumers should prefer `can(claim)` over inspecting individual roles.
 */
import { useMemo } from 'react'
import type { UserRoleEnum, PermissionClaim } from '@/lib/database.types'
import { useAuth } from './use-auth'

// Claim → roles that grant the claim.  Backend RLS + RPCs are independently
// authoritative; this is a UX affordance map (hides buttons the user can't use).
const CLAIM_ROLES: Record<PermissionClaim, UserRoleEnum[]> = {
  'costs.view':         ['admin', 'compras', 'mantenimiento'],
  'settings.manage':    ['admin'],
  'users.manage':       ['admin'],

  'purchase.create':    ['admin', 'compras'],
  'purchase.read':      ['admin', 'compras', 'almacenista'],
  'purchase.approve':   ['admin', 'compras'],

  'stock_exit.create':  ['admin', 'almacenista'],
  'stock_exit.approve': ['admin', 'almacenista'],

  'work_order.create':  ['admin', 'mantenimiento'],
  'work_order.assign':  ['admin', 'mantenimiento'],
  'work_order.close':   ['admin', 'mantenimiento'],

  'audit.read':         ['admin'],
}

export interface UsePermissionsResult {
  roles: UserRoleEnum[]
  isLoading: boolean
  hasRole: (role: UserRoleEnum) => boolean
  hasAnyRole: (roles: UserRoleEnum[]) => boolean
  can: (claim: PermissionClaim) => boolean
}

export function usePermissions(): UsePermissionsResult {
  // Roles are loaded by useAuth() via the current_user_roles() RPC inside
  // fetchUserData (see use-auth.tsx). Reading from context avoids a redundant
  // round-trip and keeps a single source of truth for auth-derived state.
  const { roles, isLoading } = useAuth()

  return useMemo(
    () => ({
      roles,
      isLoading,
      hasRole: (role: UserRoleEnum) => roles.includes(role),
      hasAnyRole: (rolesToCheck: UserRoleEnum[]) =>
        rolesToCheck.some((r) => roles.includes(r)),
      can: (claim: PermissionClaim) => {
        const allowed = CLAIM_ROLES[claim]
        if (!allowed) return false
        return allowed.some((r) => roles.includes(r))
      },
    }),
    [roles, isLoading],
  )
}
