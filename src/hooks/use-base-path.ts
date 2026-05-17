import { useAuth } from './use-auth'
import { ROLE_ROUTES_NEW } from '@/lib/constants'

/**
 * Returns the base path for the current user's primary role.
 * Uses the new UserRoleEnum sourced from user_roles (see 013_user_roles_table.sql).
 * Falls back to '/admin' if no role is yet loaded.
 */
export function useBasePath(): string {
  const { primaryRole } = useAuth()
  if (!primaryRole) return '/admin'
  return ROLE_ROUTES_NEW[primaryRole] ?? '/admin'
}

/**
 * Returns whether the current user can see monetary values (costs, prices).
 *
 * - Almacenista: only sees costs on entries (the entry capture flow needs
 *   unit_cost to be visible). Costs hidden everywhere else.
 * - admin / compras / mantenimiento: see all costs.
 *
 * @param context Dónde se va a mostrar el precio. 'entry' = entradas.
 */
export function useCanSeePrices(context: 'entry' | 'general' = 'general'): boolean {
  const { roles } = useAuth()
  const isAlmacenistaOnly = roles.length > 0 && roles.every((r) => r === 'almacenista')
  if (!isAlmacenistaOnly) return true
  return context === 'entry'
}
