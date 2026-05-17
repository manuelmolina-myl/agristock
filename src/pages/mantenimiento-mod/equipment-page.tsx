import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Tractor, AlertOctagon, CheckCircle2, Wrench, XCircle,
  ArrowRight, Clock, TrendingDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { EquipmentStatus, EquipmentKind } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface EquipmentRow {
  id: string
  code: string
  name: string
  kind: EquipmentKind | null
  status: EquipmentStatus
  brand: string | null
  model: string | null
  current_hours: number | null
  current_km: number | null
  is_active: boolean
}

interface MaintHistory {
  equipment_id: string
  corrective_count: number
  preventive_count: number
  open_count: number
  mttr_hours: number | null
  total_cost_mxn_last_year: number | null
  last_closed_at: string | null
}

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  operational:    'Operativo',
  in_maintenance: 'En mantto.',
  out_of_service: 'Fuera de servicio',
  disposed:       'Dado de baja',
}
const STATUS_ICON: Record<EquipmentStatus, React.ElementType> = {
  operational:    CheckCircle2,
  in_maintenance: Wrench,
  out_of_service: AlertOctagon,
  disposed:       XCircle,
}
const STATUS_TONE: Record<EquipmentStatus, string> = {
  operational:    'bg-success/15 text-success',
  in_maintenance: 'bg-warning/15 text-warning',
  out_of_service: 'bg-destructive/15 text-destructive',
  disposed:       'bg-muted text-muted-foreground',
}

const KIND_LABEL: Partial<Record<EquipmentKind, string>> = {
  vehicle:           'Vehículo',
  machinery:         'Maquinaria',
  implement:         'Implemento',
  installation:      'Instalación',
  irrigation_system: 'Riego',
  tool:              'Herramienta',
  other:             'Otro',
}

export default function EquipmentPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | 'all'>('all')

  const { data: equipment = [], isLoading } = useQuery<EquipmentRow[]>({
    queryKey: ['equipment-list', organization?.id],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name, kind, status, brand, model, current_hours, current_km, is_active')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return (data ?? []) as EquipmentRow[]
    },
  })

  const { data: history = [] } = useQuery<MaintHistory[]>({
    queryKey: ['mv-maint-history-list', organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('mv_maintenance_history')
        .select('equipment_id, corrective_count, preventive_count, open_count, mttr_hours, total_cost_mxn_last_year, last_closed_at')
      if (error) throw error
      return data ?? []
    },
  })

  const historyMap = useMemo(() => {
    const m = new Map<string, MaintHistory>()
    for (const h of history) m.set(h.equipment_id, h)
    return m
  }, [history])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipment.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.brand ?? '').toLowerCase().includes(q) ||
        (e.model ?? '').toLowerCase().includes(q)
      )
    })
  }, [equipment, search, statusFilter])

  // Summary tile counts
  const counts = useMemo(() => ({
    total: equipment.length,
    operational: equipment.filter((e) => e.status === 'operational').length,
    inMaint: equipment.filter((e) => e.status === 'in_maintenance').length,
    outOfService: equipment.filter((e) => e.status === 'out_of_service').length,
  }), [equipment])

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Equipos"
        description={`${counts.total} en flotilla · ${counts.operational} operativos · ${counts.inMaint} en mantenimiento · ${counts.outOfService} fuera de servicio.`}
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código, marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EquipmentStatus | 'all')}>
          <SelectTrigger className="h-9 sm:w-52"><SelectValue placeholder="Estatus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="operational">Operativos</SelectItem>
            <SelectItem value="in_maintenance">En mantenimiento</SelectItem>
            <SelectItem value="out_of_service">Fuera de servicio</SelectItem>
            <SelectItem value="disposed">Dados de baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' ? 'Sin resultados' : 'Sin equipos'}
          description={search || statusFilter !== 'all' ? 'Ajusta los filtros.' : 'Agrega equipos desde el módulo de configuración para empezar.'}
          icon={<Tractor className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((eq) => {
            const StatusIcon = STATUS_ICON[eq.status]
            const stats = historyMap.get(eq.id)
            return (
              <button
                key={eq.id}
                type="button"
                onClick={() => navigate(`/mantenimiento/equipos/${eq.id}`)}
                className="rounded-xl border border-border bg-card overflow-hidden text-left transition-all hover:border-foreground/20 hover:shadow-sm group"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{eq.name}</h3>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[eq.status]}`}>
                          <StatusIcon className="size-2.5" strokeWidth={2.5} />
                          {STATUS_LABEL[eq.status]}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{eq.code}</div>
                      {(eq.brand || eq.model) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {[eq.brand, eq.model].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {eq.kind && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {KIND_LABEL[eq.kind] ?? eq.kind}
                      </Badge>
                    )}
                  </div>

                  {/* Meter readings */}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {eq.current_hours != null && (
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="size-3" strokeWidth={1.75} />
                        {Number(eq.current_hours).toLocaleString('es-MX')} hrs
                      </span>
                    )}
                    {eq.current_km != null && (
                      <span className="font-mono tabular-nums">
                        {Number(eq.current_km).toLocaleString('es-MX')} km
                      </span>
                    )}
                  </div>
                </div>

                {/* KPI footer from mv_maintenance_history */}
                {stats && (stats.corrective_count + stats.preventive_count + stats.open_count) > 0 && (
                  <div className="border-t bg-muted/20 px-4 py-2 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-3">
                      {stats.open_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-warning font-medium">
                          <Wrench className="size-3" strokeWidth={1.75} />
                          {stats.open_count} abiertas
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {stats.corrective_count} corr · {stats.preventive_count} prev
                      </span>
                    </div>
                    {stats.total_cost_mxn_last_year != null && stats.total_cost_mxn_last_year > 0 && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <TrendingDown className="size-3" strokeWidth={1.75} />
                        ${stats.total_cost_mxn_last_year.toLocaleString('es-MX')}/año
                      </span>
                    )}
                  </div>
                )}

                {stats?.last_closed_at && (
                  <div className="px-4 py-1.5 text-[10px] text-muted-foreground border-t flex items-center justify-between">
                    <span>Último cierre {formatDistanceToNow(new Date(stats.last_closed_at), { addSuffix: true, locale: es })}</span>
                    <ArrowRight className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
