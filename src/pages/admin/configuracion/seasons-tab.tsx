import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Calendar, CheckCircle, Clock, Archive, Lock } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Season, SeasonStatus } from '@/lib/database.types'
import { formatFechaCorta } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const seasonSchema = z.object({
  name:       z.string().min(2, 'Nombre muy corto'),
  start_date: z.string().min(1, 'Requerido'),
  end_date:   z.string().min(1, 'Requerido'),
}).refine((d) => d.end_date >= d.start_date, {
  path: ['end_date'],
  message: 'Fecha de fin debe ser igual o posterior a inicio',
})

type SeasonValues = z.infer<typeof seasonSchema>

const STATUS_CONFIG: Record<SeasonStatus, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active:   { label: 'Activa',     icon: CheckCircle, variant: 'default' },
  planning: { label: 'Planeación', icon: Clock,       variant: 'secondary' },
  closing:  { label: 'Cierre',     icon: Archive,     variant: 'outline' },
  closed:   { label: 'Cerrada',    icon: Lock,        variant: 'outline' },
}

export function SeasonsTab() {
  const { organization } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: seasons = [], isLoading } = useQuery<Season[]>({
    queryKey: ['seasons-all', organization?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('seasons')
        .select('*')
        .eq('organization_id', organization?.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Season[]
    },
    enabled: !!organization?.id,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SeasonValues>({
    resolver: zodResolver(seasonSchema),
    defaultValues: {
      name:       `Temporada ${new Date().getFullYear()}`,
      start_date: `${new Date().getFullYear()}-01-01`,
      end_date:   `${new Date().getFullYear()}-12-31`,
    },
  })

  const hasActive = seasons.some((s) => s.status === 'active')

  const onSubmit = async (values: SeasonValues) => {
    if (!organization) return
    try {
      const { error } = await db.from('seasons').insert({
        organization_id: organization.id,
        name:       values.name,
        start_date: values.start_date,
        end_date:   values.end_date,
        status:     'planning',
      })
      if (error) throw error
      toast.success('Temporada creada')
      qc.invalidateQueries({ queryKey: ['seasons-all'] })
      reset()
      setOpen(false)
    } catch (err) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'Intenta de nuevo' })
    }
  }

  const handleActivate = async (season: Season) => {
    if (hasActive) {
      toast.error('Ya existe una temporada activa. Ciérrala primero.')
      return
    }
    try {
      const { error } = await db.from('seasons').update({ status: 'active' }).eq('id', season.id)
      if (error) throw error
      toast.success(`Temporada "${season.name}" activada`)
      qc.invalidateQueries({ queryKey: ['seasons-all'] })
    } catch (err) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'Intenta de nuevo' })
    }
  }

  const handleArchive = async (season: Season) => {
    try {
      const newStatus: SeasonStatus = season.status === 'active' ? 'closing' : 'closed'
      const { error } = await db.from('seasons').update({ status: newStatus }).eq('id', season.id)
      if (error) throw error
      toast.success(`Temporada "${season.name}" → ${STATUS_CONFIG[newStatus].label}`)
      qc.invalidateQueries({ queryKey: ['seasons-all'] })
    } catch (err) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'Intenta de nuevo' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {seasons.length} temporada{seasons.length !== 1 ? 's' : ''} registrada{seasons.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Nueva temporada
        </Button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : seasons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Calendar className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">Sin temporadas</p>
          <p className="text-xs text-muted-foreground">Crea tu primera temporada para comenzar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {seasons.map((s) => {
            const cfg  = STATUS_CONFIG[s.status as SeasonStatus] ?? STATUS_CONFIG.planning
            const Icon = cfg.icon
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFechaCorta(s.start_date)} – {formatFechaCorta(s.end_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                  {s.status === 'planning' && !hasActive && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleActivate(s)}>
                      Activar
                    </Button>
                  )}
                  {(s.status === 'active' || s.status === 'closing') && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleArchive(s)}>
                      {s.status === 'active' ? 'Iniciar cierre' : 'Cerrar'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create season dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva temporada</DialogTitle>
          </DialogHeader>
          <form id="season-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sname">Nombre</Label>
              <Input id="sname" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sstart">Inicio</Label>
                <Input id="sstart" type="date" {...register('start_date')} className="h-9 text-sm" aria-invalid={!!errors.start_date} />
                {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send">Fin</Label>
                <Input id="send" type="date" {...register('end_date')} className="h-9 text-sm" aria-invalid={!!errors.end_date} />
                {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">La temporada se crea en estado Planeación. Puedes activarla cuando estés listo.</p>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="season-form" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear temporada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
