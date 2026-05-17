/**
 * TanStack Query hooks for the notification center MVP.
 *
 * Backed by the SECURITY DEFINER RPC `public.get_user_notifications` defined
 * in migration 035.  The RPC internally filters by `auth_org_id()` and the
 * caller's roles, so we only need to pass the user id (which the RPC uses
 * defensively but does not trust).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatSupabaseError } from '@/lib/errors'

export type NotificationKind =
  | 'requisition_pending'
  | 'quotes_ready'
  | 'wo_open'
  | 'low_stock'

export interface NotificationRow {
  kind: NotificationKind
  title: string
  subtitle: string | null
  link_path: string
  created_at: string
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string | undefined, orgId: string | undefined) =>
    ['notifications', { userId, orgId }] as const,
}

/**
 * Subscribes to the user's pending notifications.  Polls every 60s.
 *
 * Returns an empty array (not `undefined`) when there's no authenticated user
 * yet so consumers can render straight against `.length` without nullish
 * checks scattered through the UI.
 */
export function useNotifications() {
  const { user, organization } = useAuth()
  const userId = user?.id
  const orgId = organization?.id

  return useQuery<NotificationRow[]>({
    queryKey: notificationKeys.list(userId, orgId),
    enabled: !!userId && !!orgId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_user_notifications', {
        p_user_id: userId,
        p_limit: 20,
      })
      if (error) {
        const { description } = formatSupabaseError(error, 'No se pudieron cargar las notificaciones')
        throw new Error(description)
      }
      return (data ?? []) as NotificationRow[]
    },
  })
}
