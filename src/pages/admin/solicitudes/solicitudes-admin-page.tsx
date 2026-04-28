import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCheck, XCircle, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'

import { useBasePath } from '@/hooks/use-base-path'
import { useSolicitudes } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

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
  const { profile } = useAuth()

  const [statusFilter, setStatusFilter] = useState<'all' | SolicitudStatus>('all')
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | SolicitudUrgency>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'aprobar' | 'rechazar' | null>(null)
  const [processing, setProcessing] = useState(false)

  const { data: solicitudes, isLoading, refetch } = useSolicitudes()

  const filtered = (solicitudes ?? []).filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (urgencyFilter !== 'all' && s.urgency !== urgencyFilter) return false
    return true
  })

  // Only pendientes can be bulk-actioned
  const pendientes = filtered.filter((s) => s.status === 'pendiente')
  const allPendientesSelected = pendientes.length > 0 && pendientes.every((s) => selected.has(s.id))
  const selectedPendientes = pendientes.filter((s) => selected.has(s.id))

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAllPendientes() {
    if (allPendientesSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        pendientes.forEach((s) => next.delete(s.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        pendientes.forEach((s) => next.add(s.id))
        return next
      })
    }
  }

  async function handleBulkConfirm() {
    if (!bulkAction || selectedPendientes.length === 0) return
    setProcessing(true)
    try {
      const newStatus: SolicitudStatus = bulkAction === 'aprobar' ? 'aprobada' : 'rechazada'
      const ids = selectedPendientes.map((s) => s.id)
      const { error } = await db
        .from('solicitudes')
        .update({
          status: newStatus,
          reviewed_by: profile?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids)
      if (error) throw error
      toast.success(
        `${ids.length} solicitud${ids.length !== 1 ? 'es' : ''} ${newStatus === 'aprobada' ? 'aprobada' : 'rechazada'}${ids.length !== 1 ? 's' : ''}`
      )
      setSelected(new Set())
      refetch()
    } catch {
      toast.error('Error al procesar las solicitudes')
    } finally {
      setProcessing(false)
      setBulkAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Solicitudes de material"
        description="Solicitudes de todos los supervisores"
      />

      {/* Filters + select-all */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | SolicitudStatus)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Estado…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(SOLICITUD_STATUS_LABELS) as SolicitudStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{SOLICITUD_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v as 'all' | SolicitudUrgency)}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Urgencia…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las urgencias</SelectItem>
            {(Object.keys(SOLICITUD_URGENCY_LABELS) as SolicitudUrgency[]).map((u) => (
              <SelectItem key={u} value={u}>{SOLICITUD_URGENCY_LABELS[u]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {pendientes.length > 0 && (
          <button
            type="button"
            onClick={toggleAllPendientes}
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allPendientesSelected
              ? <CheckSquare className="size-3.5 text-primary" />
              : <Square className="size-3.5" />
            }
            {allPendientesSelected ? 'Deseleccionar' : 'Seleccionar'} pendientes ({pendientes.length})
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <Skeleton className="size-4 rounded" />
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
            const isPendiente = s.status === 'pendiente'
            const isSelected = selected.has(s.id)

            return (
              <Card
                key={s.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected
                    ? 'border-primary/60 bg-primary/5'
                    : 'hover:border-primary/40'
                )}
                onClick={() => navigate(`${basePath}/solicitudes/${s.id}`)}
              >
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  {/* Checkbox — only for pendientes */}
                  {isPendiente ? (
                    <div
                      onClick={(e) => toggleSelect(s.id, e)}
                      className="shrink-0"
                    >
                      <Checkbox checked={isSelected} />
                    </div>
                  ) : (
                    <div className="size-4 shrink-0" />
                  )}

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

      {/* ── Floating bulk action bar ───────────────────────────────────────── */}
      {selectedPendientes.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-background shadow-lg px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            {selectedPendientes.length} seleccionada{selectedPendientes.length !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setBulkAction('aprobar')}
          >
            <CheckCheck className="mr-1.5 size-3.5" />
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:text-destructive"
            onClick={() => setBulkAction('rechazar')}
          >
            <XCircle className="mr-1.5 size-3.5" />
            Rechazar
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground ml-1"
            onClick={() => setSelected(new Set())}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Bulk confirm dialog */}
      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'aprobar' ? '¿Aprobar solicitudes?' : '¿Rechazar solicitudes?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se {bulkAction === 'aprobar' ? 'aprobarán' : 'rechazarán'}{' '}
              <strong>{selectedPendientes.length}</strong> solicitud{selectedPendientes.length !== 1 ? 'es' : ''}.
              Esta acción puede deshacerse editando cada solicitud individualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkConfirm}
              disabled={processing}
              className={bulkAction === 'rechazar' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {processing ? 'Procesando…' : bulkAction === 'aprobar' ? 'Sí, aprobar' : 'Sí, rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default SolicitudesAdminPage
