/**
 * ServiceRequestsPage — listado de solicitudes de servicio (reportes de
 * problema). Cualquier usuario autenticado puede ver y abrir una nueva;
 * sólo mantenimiento/admin (can_write_cmms) puede triagear / convertir.
 *
 * Filtros sincronizados a URL search params (status, equipment) para
 * deep-linking desde el dashboard de mantto. Default status = 'open'.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, MessageSquareWarning, Tractor, MapPin, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { WOPriority } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { NuevaSolicitudDialog } from './nueva-solicitud-dialog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type ServiceRequestStatus = 'open' | 'triaged' | 'converted' | 'duplicate' | 'rejected'
type StatusFilter = ServiceRequestStatus | 'all'

interface ServiceRequestRow {
  id: string
  folio: string
  reported_at: string
  status: ServiceRequestStatus
  urgency: WOPriority
  description: string
  location_hint: string | null
  equipment_id: string | null
  equipment: { code: string; name: string } | null
  reporter: { full_name: string } | null
}

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  open:       'Abierta',
  triaged:    'Triagada',
  converted:  'Convertida a OT',
  duplicate:  'Duplicada',
  rejected:   'Rechazada',
}
const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  open:       'bg-warning/15 text-warning',
  triaged:    'bg-usd/15 text-usd',
  converted:  'bg-success/15 text-success',
  duplicate:  'bg-muted text-muted-foreground',
  rejected:   'bg-destructive/15 text-destructive',
}
const URGENCY_LABEL: Record<WOPriority, string> = {
  low:      'Baja',
  medium:   'Normal',
  high:     'Alta',
  critical: 'Crítica',
}
const URGENCY_TONE: Record<WOPriority, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-usd/15 text-usd',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/15 text-destructive',
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'open',      label: 'Abiertas' },
  { value: 'triaged',   label: 'Triagadas' },
  { value: 'converted', label: 'Convertidas' },
  { value: 'duplicate', label: 'Duplicadas' },
  { value: 'rejected',  label: 'Rechazadas' },
  { value: 'all',       label: 'Todas' },
]

function isStatusFilter(v: string | null): v is StatusFilter {
  return v === 'open' || v === 'triaged' || v === 'converted' || v === 'duplicate' || v === 'rejected' || v === 'all'
}

export default function ServiceRequestsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const [params, setParams] = useSearchParams()

  const initialStatus: StatusFilter = isStatusFilter(params.get('status')) ? params.get('status') as StatusFilter : 'open'
  const initialEquipment = params.get('equipment') ?? 'all'

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus)
  const [equipmentFilter, setEquipmentFilter] = useState<string>(initialEquipment)
  const [newOpen, setNewOpen] = useState(params.get('new') === '1')

  // Sync local state → URL (replace, no history spam)
  useEffect(() => {
    const next = new URLSearchParams(params)
    if (statusFilter === 'open') next.delete('status')
    else next.set('status', statusFilter)
    if (equipmentFilter === 'all') next.delete('equipment')
    else next.set('equipment', equipmentFilter)
    if (!newOpen) next.delete('new')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, equipmentFilter, newOpen])

  // Catálogo de equipos para el filtro
  const { data: equipos = [] } = useQuery<Array<{ id: string; code: string; name: string }>>({
    queryKey: ['equipment-for-sr-filter', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  // Listado de solicitudes
  const { data: requests = [], isLoading } = useQuery<ServiceRequestRow[]>({
    queryKey: ['service-requests', organization?.id, statusFilter, equipmentFilter],
    enabled: !!organization?.id,
    staleTime: 15_000,
    queryFn: async () => {
      let q = db
        .from('service_requests')
        .select(`
          id, folio, reported_at, status, urgency, description, location_hint, equipment_id,
          equipment:equipment!service_requests_equipment_id_fkey(code, name),
          reporter:profiles!service_requests_reported_by_fkey(full_name)
        `)
        .is('deleted_at', null)
        .order('reported_at', { ascending: false })
        .limit(200)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (equipmentFilter !== 'all') q = q.eq('equipment_id', equipmentFilter)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ServiceRequestRow[]
    },
  })

  const openCount = useMemo(
    () => requests.filter((r) => r.status === 'open').length,
    [requests],
  )

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Solicitudes de servicio"
        description="Reportes de problemas pendientes de triage por mantenimiento."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            Nueva solicitud
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={equipmentFilter} onValueChange={(v) => setEquipmentFilter(v ?? 'all')}>
          <SelectTrigger className="h-9 sm:w-64"><SelectValue placeholder="Equipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los equipos</SelectItem>
            {equipos.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                <span className="font-mono text-[11px] mr-1.5 text-muted-foreground">{e.code}</span>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {statusFilter === 'open' && openCount > 0 && (
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {openCount} pendiente{openCount === 1 ? '' : 's'} de triage
          </div>
        )}
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning className="size-6 text-muted-foreground" strokeWidth={1.5} />}
          title={
            statusFilter === 'open'
              ? 'No hay solicitudes pendientes'
              : statusFilter === 'all'
                ? 'Sin solicitudes registradas'
                : `Sin solicitudes ${STATUS_LABEL[statusFilter].toLowerCase()}`
          }
          description={
            statusFilter === 'open'
              ? '¡Nada que triagear por ahora! Usa "Nueva solicitud" para reportar un problema.'
              : 'Ajusta los filtros o reporta un problema con "Nueva solicitud".'
          }
          action={{ label: 'Nueva solicitud', onClick: () => setNewOpen(true) }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/mantenimiento/solicitudes/${r.id}`, { state: { from: location.pathname + location.search } })}
              className="rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-foreground/20 hover:shadow-sm group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{r.folio}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${URGENCY_TONE[r.urgency]}`}>
                      {URGENCY_LABEL[r.urgency]}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    <Tractor className="size-3 shrink-0" />
                    {r.equipment ? (
                      <>
                        <span className="font-mono">{r.equipment.code}</span>
                        <span>·</span>
                        <span className="truncate">{r.equipment.name}</span>
                      </>
                    ) : (
                      <span className="italic">Sin equipo</span>
                    )}
                    {r.location_hint && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {r.location_hint}
                        </span>
                      </>
                    )}
                  </div>

                  <p
                    className="mt-1.5 text-sm text-foreground/90 line-clamp-2"
                    title={r.description}
                  >
                    {r.description}
                  </p>

                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>
                      {r.reporter?.full_name ?? '—'}
                      {' · '}
                      {formatDistanceToNow(new Date(r.reported_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <NuevaSolicitudDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
