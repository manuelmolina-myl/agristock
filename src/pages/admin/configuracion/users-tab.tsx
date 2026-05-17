import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Mail, UserCheck, UserX, Shield } from 'lucide-react'
import { RoleManagerDialog } from './role-manager-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS_NEW } from '@/lib/constants'
import { formatSupabaseError } from '@/lib/errors'
import type { UserRoleEnum } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Profile } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const inviteSchema = z.object({
  email:     z.string().email('Email inválido'),
  full_name: z.string().min(2, 'Nombre muy corto'),
  role:      z.enum(['admin', 'compras', 'mantenimiento', 'almacenista']),
})

type InviteValues = z.infer<typeof inviteSchema>

// The invite stores its `role` in user_meta_data; trigger 010 inserts it
// into profiles.role; trigger 018 syncs that into user_roles via the
// new sync_profile_role_to_user_roles function (migration 026).
const INVITABLE_ROLES: { value: InviteValues['role']; label: string; hint: string }[] = [
  { value: 'admin',         label: 'Administrador',  hint: 'Acceso total — aprueba todo, gestiona usuarios y catálogos.' },
  { value: 'compras',       label: 'Compras',        hint: 'Solicitudes, cotizaciones, OCs, facturas y proveedores.' },
  { value: 'mantenimiento', label: 'Mantenimiento',  hint: 'Órdenes de trabajo, equipos, refacciones y planes preventivos.' },
  { value: 'almacenista',   label: 'Almacenista',    hint: 'Inventario, entradas, salidas, traspasos y diésel.' },
]

const ROLE_COLORS: Record<UserRoleEnum, string> = {
  admin:         'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  compras:       'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  mantenimiento: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  almacenista:   'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

export function UsersTab() {
  const { organization, profile: currentProfile } = useAuth()
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null)
  const [rolesTarget, setRolesTarget] = useState<Profile | null>(null)

  const { data: profiles = [], isLoading } = useQuery<Profile[]>({
    queryKey: ['profiles-all', organization?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('organization_id', organization?.id)
        .order('full_name')
      if (error) throw error
      return data as Profile[]
    },
    enabled: !!organization?.id,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'almacenista' },
  })

  const roleValue = watch('role')

  const onInvite = async (values: InviteValues) => {
    if (!organization) return
    try {
      // Use Supabase admin inviteUserByEmail
      const { error } = await supabase.auth.admin.inviteUserByEmail(values.email, {
        data: {
          full_name:       values.full_name,
          role:            values.role,
          organization_id: organization.id,
        },
      })
      if (error) throw error
      toast.success('Invitación enviada', { description: `Se envió un correo a ${values.email}` })
      qc.invalidateQueries({ queryKey: ['profiles-all'] })
      reset()
      setInviteOpen(false)
    } catch (err) {
      // inviteUserByEmail requires service_role key — show instructions
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('not authorized') || msg.includes('admin')) {
        toast.error('Requiere configuración adicional', {
          description: 'La función de invitación por email requiere una Edge Function con service_role key. Contacta al soporte.',
          duration: 6000,
        })
      } else {
        const { title, description } = formatSupabaseError(err, 'No se pudo invitar al usuario')
        toast.error(title, { description })
      }
    }
  }

  const handleToggleActive = async (p: Profile, newActive: boolean) => {
    try {
      const { error } = await db.from('profiles').update({ is_active: newActive }).eq('id', p.id)
      if (error) throw error
      toast.success(newActive ? `${p.full_name} reactivado` : `${p.full_name} desactivado`)
      qc.invalidateQueries({ queryKey: ['profiles-all'] })
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo actualizar el usuario')
      toast.error(title, { description })
    } finally {
      setDeactivateTarget(null)
    }
  }

  const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {profiles.length} usuario{profiles.length !== 1 ? 's' : ''} en tu organización
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" />
          Invitar usuario
        </Button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
          {profiles.map((p) => {
            const isCurrentUser = p.id === currentProfile?.id
            const colorClass    = ROLE_COLORS[p.role as UserRoleEnum] ?? 'bg-muted text-muted-foreground'
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
              >
                {/* Avatar */}
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials(p.full_name)}</AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.full_name}</p>
                    {isCurrentUser && (
                      <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">Tú</span>
                    )}
                    {!p.is_active && (
                      <span className="text-[10px] rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive">Inactivo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}>
                      <Shield className="size-2.5" />
                      {ROLE_LABELS_NEW[p.role as UserRoleEnum] ?? p.role}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {!isCurrentUser && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Gestionar roles individuales"
                      onClick={() => setRolesTarget(p)}
                    >
                      <Shield className="size-3.5" />
                      <span className="hidden sm:inline">Roles</span>
                    </Button>
                    {p.is_active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Desactivar usuario"
                        onClick={() => setDeactivateTarget(p)}
                      >
                        <UserX className="size-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-success"
                        title="Reactivar usuario"
                        onClick={() => handleToggleActive(p, true)}
                      >
                        <UserCheck className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-4" />
              Invitar usuario
            </DialogTitle>
          </DialogHeader>
          <form id="invite-form" onSubmit={handleSubmit(onInvite)} className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ifull">Nombre completo</Label>
              <Input id="ifull" {...register('full_name')} className="h-9" aria-invalid={!!errors.full_name} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iemail">Correo electrónico</Label>
              <Input id="iemail" type="email" {...register('email')} className="h-9" placeholder="usuario@empresa.com" aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <Select value={roleValue} onValueChange={(v) => setValue('role', v as InviteValues['role'])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Hint for the selected role */}
            {(() => {
              const sel = INVITABLE_ROLES.find((r) => r.value === roleValue)
              return sel ? (
                <div className="rounded-lg bg-accent/40 border border-border p-3 text-xs text-foreground">
                  <p className="font-medium text-foreground mb-0.5">{sel.label}</p>
                  <p className="text-muted-foreground">{sel.hint}</p>
                </div>
              ) : null
            })()}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              El usuario recibirá un correo con un enlace para establecer su contraseña y acceder a AgriStock.
              Puedes ajustar roles individuales (solo Compras, solo Mantenimiento) después de que ingrese.
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviteOpen(false); reset() }}>Cancelar</Button>
            <Button type="button" onClick={handleSubmit(onInvite)} disabled={isSubmitting} className="gap-1.5">
              <Mail className="size-4" />
              {isSubmitting ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <RoleManagerDialog
        open={!!rolesTarget}
        profile={rolesTarget}
        onClose={() => setRolesTarget(null)}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar a {deactivateTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario ya no podrá iniciar sesión. Puedes reactivarlo en cualquier momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateTarget && handleToggleActive(deactivateTarget, false)}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
