/**
 * Historial de mantenimiento — lista de OTs completadas/cerradas ordenadas
 * por fecha de cierre.  Filtros: equipo, técnico, rango de fechas, tipo.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Wrench, Search, ChevronRight, CheckCircle2, Calendar,
  History as HistoryIcon,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { WOStatus, WOType } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface HistoryRow {
  id: string
  folio: string
  equipment_id: string
  wo_type: WOType
  status: WOStatus
  priority: string
  failure_description: string | null
  solution_applied: string | null
  reported_at: string
  completed_at: string | null
  total_cost_mxn: number | null
  downtime_minutes: number | null
  equipment: { code: string; name: string } | null
  technician: { full_name: string } | null
}

const TYPE_LABEL: Record<WOType, string> = {
  corrective: 'Correctivo',
  preventive: 'Preventivo',
  predictive: 'Predictivo',
  improvement: 'Mejora',
  inspection: 'Inspección',
}

const TYPE_TONE: Record<WOType, string> = {
  corrective:  'bg-destructive/10 text-destructive',
  preventive:  'bg-success/10 text-success',
  predictive:  'bg-usd/10 text-usd',
  improvement: 'bg-primary/10 text-primary',
  inspection:  'bg-muted text-muted-foreground',
}

const STATUS_LABEL: Record<WOStatus, string> = {
  reported: 'Reportada', scheduled: 'Programada', assigned: 'Asignada',
  in_progress: 'En proceso', waiting_parts: 'Esperando refacciones',
  completed: 'Completada', closed: 'Cerrada', cancelled: 'Cancelada',
}

export default function HistorialPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<WOType | 'all'>('all')

  const { data: rows = [], isLoading } = useQuery<HistoryRow[]>({
    queryKey: ['mantto-historial', { orgId: organization?.id }],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('work_orders')
        .select(`
          id, folio, equipment_id, wo_type, status, priority,
          failure_description, solution_applied,
          reported_at, completed_at, total_cost_mxn, downtime_minutes,
          equipment:equipment(code, name),
          technician:employees!work_orders_primary_technician_id_fkey(full_name)
        `)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .in('status', ['completed', 'closed'])
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as HistoryRow[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.wo_type !== typeFilter) return false
      if (q) {
        const haystack = [
          r.folio,
          r.equipment?.code ?? '',
          r.equipment?.name ?? '',
          r.technician?.full_name ?? '',
          r.failure_description ?? '',
          r.solution_applied ?? '',
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rows, search, typeFilter])

  const totalCost = useMemo(
    () => filtered.reduce((s, r) => s + (r.total_cost_mxn ?? 0), 0),
    [filtered],
  )

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Historial de mantenimiento"
        description="Órdenes de trabajo completadas y cerradas, ordenadas por fecha de cierre."
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, equipo, técnico o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter((v ?? 'all') as WOType | 'all')}>
          <SelectTrigger className="h-9 sm:w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="corrective">Correctivo</SelectItem>
            <SelectItem value="preventive">Preventivo</SelectItem>
            <SelectItem value="predictive">Predictivo</SelectItem>
            <SelectItem value="inspection">Inspección</SelectItem>
            <SelectItem value="improvement">Mejora</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span>
            <span className="font-semibold text-foreground">{filtered.length}</span> OT(s) en historial
            {search || typeFilter !== 'all' ? ' (filtradas)' : ''}
          </span>
          <span>
            Costo acumulado:{' '}
            <span className="font-mono tabular-nums font-semibold text-foreground">
              ${totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </span>
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="size-8 text-muted-foreground" strokeWidth={1.5} />}
          title={search || typeFilter !== 'all' ? 'Sin resultados' : 'Sin historial aún'}
          description={
            search || typeFilter !== 'all'
              ? 'Ajusta los filtros para ampliar la búsqueda.'
              : 'Conforme cierres OTs aparecerán aquí.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/mantenimiento/ordenes/${r.id}`, { state: { from: location.pathname } })}
              className="rounded-xl border border-border bg-card overflow-hidden text-left transition-colors hover:bg-muted/20 hover:border-foreground/20 cursor-pointer"
            >
              <div className="p-4 flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Wrench className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-medium">{r.folio}</span>
                    <Badge className={`text-[10px] px-1.5 ${TYPE_TONE[r.wo_type]}`}>
                      {TYPE_LABEL[r.wo_type]}
                    </Badge>
                    <Badge
                      className={`text-[10px] px-1.5 ${
                        r.status === 'closed' ? 'bg-success/15 text-success' : 'bg-usd/15 text-usd'
                      }`}
                    >
                      <CheckCircle2 className="size-2.5 mr-0.5" />
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {r.equipment ? `${r.equipment.code} — ${r.equipment.name}` : '—'}
                    {r.technician?.full_name && ` · técnico ${r.technician.full_name}`}
                  </div>
                  {r.failure_description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {r.failure_description}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0 flex items-start gap-2">
                  <div>
                    <div className="text-sm font-semibold font-mono tabular-nums">
                      ${(r.total_cost_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                      <Calendar className="size-2.5" />
                      {r.completed_at
                        ? <>
                            {format(new Date(r.completed_at), 'd MMM yyyy', { locale: es })}
                            <span className="opacity-70 ml-0.5">
                              ({formatDistanceToNow(new Date(r.completed_at), { addSuffix: true, locale: es })})
                            </span>
                          </>
                        : 'sin fecha'}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground mt-1" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
