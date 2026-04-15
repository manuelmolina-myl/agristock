import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'

import { useBasePath } from '@/hooks/use-base-path'
import { useSolicitudes } from '@/hooks/use-supabase-query'
import { formatRelativo, cn } from '@/lib/utils'
import {
  SOLICITUD_STATUS_LABELS,
  SOLICITUD_URGENCY_LABELS,
  DESTINATION_TYPE_LABELS,
} from '@/lib/constants'
import type { SolicitudStatus, SolicitudUrgency } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<SolicitudStatus, string> = {
  pendiente: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
  aprobada:  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
  rechazada: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
  entregada: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
}

const URGENCY_CLASSES: Record<SolicitudUrgency, string> = {
  baja:    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  normal:  'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
  alta:    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400',
  urgente: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SolicitudesAdminPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()

  const [statusFilter, setStatusFilter] = useState<'all' | SolicitudStatus>('all')
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | SolicitudUrgency>('all')

  const { data: solicitudes, isLoading } = useSolicitudes()

  const filtered = (solicitudes ?? []).filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (urgencyFilter !== 'all' && s.urgency !== urgencyFilter) return false
    return true
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Solicitudes de material"
        description="Solicitudes de todos los supervisores"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | SolicitudStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(SOLICITUD_STATUS_LABELS) as SolicitudStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SOLICITUD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v as 'all' | SolicitudUrgency)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Urgencia…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las urgencias</SelectItem>
            {(Object.keys(SOLICITUD_URGENCY_LABELS) as SolicitudUrgency[]).map((u) => (
              <SelectItem key={u} value={u}>
                {SOLICITUD_URGENCY_LABELS[u]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </CardContent>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<ClipboardList className="size-5" />}
                title="Sin solicitudes"
                description="No hay solicitudes que coincidan con los filtros."
              />
            </CardContent>
          </Card>
        ) : (
          filtered.map((s) => {
            const lineCount = s.lines?.length ?? 0
            const destLabel = s.destination_type
              ? DESTINATION_TYPE_LABELS[s.destination_type] ?? s.destination_type
              : 'Sin destino'
            const requesterName = s.requester?.full_name ?? '—'

            return (
              <Card
                key={s.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => navigate(`${basePath}/solicitudes/${s.id}`)}
              >
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{requesterName}</p>
                    <p className="text-xs text-muted-foreground">
                      {destLabel} ·{' '}
                      {lineCount > 0
                        ? `${lineCount} artículo${lineCount !== 1 ? 's' : ''}`
                        : 'Sin artículos'}{' '}
                      · {formatRelativo(s.created_at)}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('text-xs', URGENCY_CLASSES[s.urgency])}>
                    {SOLICITUD_URGENCY_LABELS[s.urgency]}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', STATUS_CLASSES[s.status])}>
                    {SOLICITUD_STATUS_LABELS[s.status]}
                  </Badge>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SolicitudesAdminPage
