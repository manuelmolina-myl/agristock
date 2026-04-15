import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, CheckCircle, PackageCheck, Clock } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

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

export function SupervisorDashboardPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { profile, activeSeason } = useAuth()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const { data: solicitudes, isLoading } = useSolicitudes(
    profile?.id ? { requested_by: profile.id } : undefined,
  )

  const pendientes = useMemo(
    () => (solicitudes ?? []).filter((s) => s.status === 'pendiente'),
    [solicitudes],
  )
  const aprobadasMes = useMemo(
    () =>
      (solicitudes ?? []).filter(
        (s) => s.status === 'aprobada' && new Date(s.created_at) >= monthStart,
      ),
    [solicitudes],
  )
  const entregadasMes = useMemo(
    () =>
      (solicitudes ?? []).filter(
        (s) => s.status === 'entregada' && new Date(s.created_at) >= monthStart,
      ),
    [solicitudes],
  )

  const recent = useMemo(() => (solicitudes ?? []).slice(0, 10), [solicitudes])

  const seasonName = activeSeason?.name ?? '—'

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Mis solicitudes"
        description={`Temporada: ${seasonName}`}
        actions={
          <Button onClick={() => navigate(`${basePath}/solicitudes/nueva`)} size="sm">
            <Plus className="mr-1.5 size-4" />
            Nueva solicitud
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
            <Clock className="size-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              <p className="text-3xl font-bold">{pendientes.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aprobadas (mes)</CardTitle>
            <CheckCircle className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              <p className="text-3xl font-bold">{aprobadasMes.length}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregadas (mes)</CardTitle>
            <PackageCheck className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              <p className="text-3xl font-bold">{entregadasMes.length}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent solicitudes */}
      <Card>
        <CardHeader className="flex items-center justify-between border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="size-4 text-muted-foreground" />
            Solicitudes recientes
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => navigate(`${basePath}/solicitudes`)}
          >
            Ver todas
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="Sin solicitudes"
              description="Crea tu primera solicitud de materiales."
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => {
                const lineCount = s.lines?.length ?? 0
                const destLabel = s.destination_type
                  ? DESTINATION_TYPE_LABELS[s.destination_type] ?? s.destination_type
                  : 'Sin destino'
                return (
                  <li
                    key={s.id}
                    className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`${basePath}/solicitudes/${s.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{destLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {lineCount > 0 ? `${lineCount} artículo${lineCount !== 1 ? 's' : ''}` : 'Sin artículos'} · {formatRelativo(s.created_at)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', URGENCY_CLASSES[s.urgency])}
                    >
                      {SOLICITUD_URGENCY_LABELS[s.urgency]}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', STATUS_CLASSES[s.status])}
                    >
                      {SOLICITUD_STATUS_LABELS[s.status]}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SupervisorDashboardPage
