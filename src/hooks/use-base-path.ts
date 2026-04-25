import { useAuth } from './use-auth'
import { ROLE_ROUTES } from '@/lib/constants'
import type { UserRole } from '@/lib/database.types'

/**
 * Returns the base path for the current user's role.
 * e.g., '/admin', '/almacenista', '/supervisor'
 */
export function useBasePath(): string {
  const { profile } = useAuth()
  if (!profile?.role) return '/admin'
  return ROLE_ROUTES[profile.role as UserRole] ?? '/admin'
}

/**
 * Returns whether the current user can see monetary values (costs, prices).
 *
 * - Almacenista: ve costos SOLO en entradas (necesario para operación).
 *   No ve costos en salidas, traspasos, reportes, inventario, ni lotes.
 * - Otros roles: ven todos los costos.
 *
 * @param context Dónde se va a mostrar el precio. 'entry' = entradas.
 */
export function useCanSeePrices(context: 'entry' | 'general' = 'general'): boolean {
  const { profile } = useAuth()
  if (profile?.role !== 'almacenista') return true
  return context === 'entry'
}
