/**
 * RoleManagerDialog — granular user_roles management.
 *
 * Lets an admin view all user_roles enum values currently granted to a user
 * and toggle them on/off independently of the legacy profiles.role mapping.
 *
 * Used from users-tab.tsx via the "Roles" button next to each profile row.
 *
 * RLS guard: only super_admin and director_sg can mutate user_roles (per the
 * policies in 013_user_roles_table.sql).  The dialog hides the actions for
 * users without the claim.
 */
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Shield, Check, X, Loader2 } from 'lucide-react'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ROLE_LABELS_NEW } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import type { UserRoleEnum, Profile } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface UserRoleRow {
  id: string
  role: UserRoleEnum
  granted_at: string
  revoked_at: string | null
}

const ALL_ROLES: UserRoleEnum[] = ['admin', 'compras', 'mantenimiento', 'almacenista']

const ROLE_DESCRIPTIONS: Record<UserRoleEnum, string> = {
  admin:         'Acceso total. Aprueba compras grandes, ve costos completos, gestiona usuarios y catálogos.',
  compras:       'Crea solicitudes, cotizaciones y OCs. Aprueba compras dentro del umbral. Maneja proveedores y facturas.',
  mantenimiento: 'Crea y asigna órdenes de trabajo, gestiona equipos y planes preventivos, consume refacciones del almacén.',
  almacenista:   'Recibe material contra OC, registra entradas/salidas/traspasos, controla diésel. Sin acceso a costos.',
}

interface Props {
  open: boolean
  profile: Profile | null
  onClose: () => void
}

export function RoleManagerDialog({ open, profile, onClose }: Props) {
  const qc = useQueryClient()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const canManage = can('users.manage')

  const { data: rows = [], isLoading } = useQuery<UserRoleRow[]>({
    queryKey: ['user_roles', 'for-user', profile?.id, organization?.id],
    enabled: open && !!profile?.id && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('user_roles')
        .select('id, role, granted_at, revoked_at')
        .eq('user_id', profile!.id)
        .eq('organization_id', organization!.id)
        .order('granted_at', { ascending: false })
      if (error) throw error
      return data as UserRoleRow[]
    },
  })

  const activeRoles = useMemo(
    () => new Set(rows.filter((r) => r.revoked_at == null).map((r) => r.role)),
    [rows],
  )

  const grant = useMutation({
    mutationFn: async (role: UserRoleEnum) => {
      if (!profile?.id || !organization?.id) throw new Error('No context')
      // Reactivate an existing-but-revoked row, otherwise insert.
      const existing = rows.find((r) => r.role === role)
      if (existing) {
        const { error } = await db.from('user_roles')
          .update({ revoked_at: null, revoked_by: null })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('user_roles').insert({
          organization_id: organization.id,
          user_id: profile.id,
          role,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_roles'] })
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo conceder el rol')
      toast.error(title, { description })
    },
  })

  const revoke = useMutation({
    mutationFn: async (role: UserRoleEnum) => {
      const existing = rows.find((r) => r.role === role && r.revoked_at == null)
      if (!existing) return
      const { error } = await db.from('user_roles')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_roles'] }),
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo revocar el rol')
      toast.error(title, { description })
    },
  })

  const isBusy = grant.isPending || revoke.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4" />
            Roles de {profile?.full_name ?? 'usuario'}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground -mt-1 mb-2">
          Activa solo los roles que este usuario realmente necesita. Un usuario puede tener varios.
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {ALL_ROLES.map((r) => {
              const active = activeRoles.has(r)
              return (
                <div
                  key={r}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ROLE_LABELS_NEW[r]}</span>
                      {active && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-success">
                          <Check className="size-3" /> activo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ROLE_DESCRIPTIONS[r]}
                    </p>
                  </div>
                  <Button
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    disabled={!canManage || isBusy}
                    onClick={() => {
                      if (active) revoke.mutate(r)
                      else grant.mutate(r)
                    }}
                    className="shrink-0 h-7 px-3 text-xs"
                  >
                    {active ? 'Revocar' : 'Conceder'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            {isBusy && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Cerrar
          </Button>
        </DialogFooter>

        {!canManage && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
            <X className="size-3.5" />
            Solo Director / Super Admin puede modificar roles.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
