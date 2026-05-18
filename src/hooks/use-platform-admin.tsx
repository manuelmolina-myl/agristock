/**
 * usePlatformAdmin — boolean check para el cockpit /plataforma.
 *
 * Llama al RPC `is_platform_admin()` (migración 067) que devuelve true
 * sólo si el user está en la tabla `platform_admins`. Es una capa por
 * encima del modelo org-scoped (user_roles), pensada para super_admins
 * de la plataforma SaaS que orquestan a todos los tenants.
 *
 * Cacheado por sesión vía TanStack Query — el resultado raramente cambia.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './use-auth'

export function usePlatformAdmin() {
  const { user, isLoading } = useAuth()
  const userId = user?.id

  return useQuery<boolean>({
    queryKey: ['platform-admin', userId],
    enabled: !!userId && !isLoading,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('is_platform_admin')
      if (error) return false
      return data === true
    },
  })
}
