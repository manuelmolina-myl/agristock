import { useAuth } from './use-auth'
import { ROLE_ROUTES } from '@/lib/constants'
import type { UserRole } from '@/lib/database.types'

/**
 * Returns the base path for the current user's role.
 * e.g., '/admin', '/gerente', '/almacenista', '/supervisor'
 */
export function useBasePath(): string {
  const { profile } = useAuth()
  if (!profile?.role) return '/admin'
  return ROLE_ROUTES[profile.role as UserRole] ?? '/admin'
}

/**
 * Returns whether the current user can see monetary values (costs, prices).
 * Almacenista should NOT see costs.
 */
export function useCanSeePrices(): boolean {
  const { profile } = useAuth()
  return profile?.role !== 'almacenista'
}
