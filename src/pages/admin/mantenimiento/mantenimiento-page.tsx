import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wrench, Search, AlertCircle, Clock, CheckCircle2, XCircle, Pause } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/custom/empty-state'

import { useWorkOrders } from '@/features/mantenimiento/hooks'
import { usePermissions } from '@/hooks/use-permissions'
import type { WOStatus, WOPriority, WOType } from '@/lib/database.types'

import { NuevaOrdenDialog } from './nueva-orden-dialog'

// Status columns shown in the kanban view (in operational order).
//
// Tones map onto the semantic palette: warning for not-yet-started work,
// usd (info/blue) for scheduled/assigned, primary for active in-progress,
// destructive for blocked (waiting on parts), success for completed.
const COLUMNS: Array<{ key: WOStatus; label: string; tone: string }> = [
  { key: 'reported',      label: 'Reportadas',       tone: 'border-warning/30 bg-warning/10' },
  { key: 'scheduled',     label: 'Programadas',      tone: 'border-usd/30 bg-usd/10' },
  { key: 'assigned',      label: 'Asignadas',        tone: 'border-primary/30 bg-primary/10' },
  { key: 'in_progress',   label: 'En proceso',       tone: 'border-primary/30 bg-primary/10' },
  { key: 'waiting_parts', label: 'Espera refacción', tone: 'border-destructive/30 bg-destructive/10' },
  { key: 'completed',     label: 'Completadas',      tone: 'border-success/30 bg-success/10' },
]

const PRIORITY_LABEL: Record<WOPriority, string> = {
  low: 'Baja', medium: 'Normal', high: 'Alta', critical: 'Crítica',
}

const PRIORITY_TONE: Record<WOPriority, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-usd/15 text-usd',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const TYPE_LABEL: Record<WOType, string> = {
  corrective: 'Correctivo', preventive: 'Preventivo', predictive: 'Predictivo',
  improvement: 'Mejora',    inspection: 'Inspección',
}

const STATUS_ICON: Record<WOStatus, React.ElementType> = {
  reported:      AlertCircle,
  scheduled:     Clock,
  assigned:      Wrench,
  in_progress:   Wrench,
  waiting_parts: Pause,
  completed:     CheckCircle2,
  closed:        CheckCircle2,
  cancelled:     XCircle,
}

export default function MantenimientoPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<WOPriority | 'all'>('all')
  const [type, setType] = useState<WOType | 'all'>('all')
  const [newOpen, setNewOpen] = useState(false)

  const { data: rows = [], isLoading } = useWorkOrders({
    search: search.trim() || undefined,
    priority,
    type,
  })

  // Group rows by status for the kanban columns.
  const grouped = useMemo(() => {
    const map = new Map<WOStatus, typeof rows>()
    COLUMNS.forEach((c) => map.set(c.key, []))
    rows.forEach((wo) => {
      const list = map.get(wo.status)
      if (list) list.push(wo)
    })
    return map
  }, [rows])

  const totalOpen = useMemo(
    () => rows.filter((r) => !['closed', 'cancelled'].includes(r.status)).length,
    [rows],
  )

  const canCreate = can('work_order.create')

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="Mantenimiento"
        description={`${totalOpen} ${totalOpen === 1 ? 'orden abierta' : 'órdenes abiertas'} · Reporta fallas, asigna técnicos y consume refacciones del almacén.`}
        actions={
          canCreate && (
            <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
              Reportar falla
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={priority} onValueChange={(v) => setPriority(v as WOPriority | 'all')}>
          <SelectTrigger className="h-9 sm:w-44"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            <SelectItem value="critical">Crítica</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Normal</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as WOType | 'all')}>
          <SelectTrigger className="h-9 sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="corrective">Correctivo</SelectItem>
            <SelectItem value="preventive">Preventivo</SelectItem>
            <SelectItem value="predictive">Predictivo</SelectItem>
            <SelectItem value="improvement">Mejora</SelectItem>
            <SelectItem value="inspection">Inspección</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex flex-col gap-2">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin órdenes de trabajo"
          description="Cuando se reporte una falla o se ejecute un mantenimiento preventivo, aparecerá aquí."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.key) ?? []
            return (
              <div key={col.key} className="flex flex-col gap-2 min-w-0">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
                </div>

                <div className={`rounded-lg border min-h-[80px] p-1.5 flex flex-col gap-1.5 ${col.tone}`}>
                  {items.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground/60 px-2 py-3 text-center">Vacío</div>
                  ) : (
                    items.map((wo) => {
                      const Icon = STATUS_ICON[wo.status]
                      return (
                        <button
                          key={wo.id}
                          type="button"
                          onClick={() => navigate(`/mantenimiento/ordenes/${wo.id}`)}
                          className="rounded-md bg-card border border-border/60 hover:border-border hover:shadow-sm transition-all text-left p-2.5 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-medium truncate">{wo.folio}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${PRIORITY_TONE[wo.priority]}`}>
                              {PRIORITY_LABEL[wo.priority]}
                            </span>
                          </div>

                          <div className="text-xs font-medium truncate">
                            {wo.equipment?.code} — {wo.equipment?.name}
                          </div>

                          {wo.failure_description && (
                            <div className="text-[11px] text-muted-foreground line-clamp-2">
                              {wo.failure_description}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[9px] gap-0.5">
                              <Icon className="size-2.5" strokeWidth={2} />
                              {TYPE_LABEL[wo.wo_type]}
                            </Badge>
                            {wo.scheduled_date && (
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {format(new Date(wo.scheduled_date), 'd MMM', { locale: es })}
                              </span>
                            )}
                          </div>

                          {wo.primary_technician?.full_name && (
                            <div className="text-[10px] text-muted-foreground truncate border-t border-border/60 pt-1 mt-0.5">
                              {wo.primary_technician.full_name}
                            </div>
                          )}

                          {!wo.primary_technician?.full_name && wo.reporter?.full_name && (
                            <div className="text-[10px] text-muted-foreground truncate border-t border-border/60 pt-1 mt-0.5">
                              Reportó: {wo.reporter.full_name}
                              {' · '}
                              {formatDistanceToNow(new Date(wo.created_at), { addSuffix: false, locale: es })}
                            </div>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NuevaOrdenDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
