import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, FileText, AlertCircle, CheckCircle2, XCircle, Clock, ArrowRight, Download, RotateCcw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

import { EmptyState } from '@/components/custom/empty-state'
import { RequisitionLifecycle } from '@/components/custom/requisition-lifecycle'
import { DateRangeFilter } from '@/components/custom/date-range-filter'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRequisitions } from '@/features/compras/hooks'
import { exportToCsv } from '@/lib/csv-export'
import type { RequisitionStatus, RequisitionPriority } from '@/lib/database.types'

const VALID_STATUSES: ReadonlyArray<RequisitionStatus> = [
  'draft',
  'submitted',
  'in_quotation',
  'approved',
  'rejected',
  'po_generated',
  'cancelled',
]

const VALID_PRIORITIES: ReadonlyArray<RequisitionPriority> = [
  'low', 'medium', 'high', 'urgent',
]

function parseStatusParam(raw: string | null): RequisitionStatus | 'all' {
  if (!raw) return 'all'
  return (VALID_STATUSES as ReadonlyArray<string>).includes(raw)
    ? (raw as RequisitionStatus)
    : 'all'
}

function parsePriorityParam(raw: string | null): RequisitionPriority | 'all' {
  if (!raw) return 'all'
  return (VALID_PRIORITIES as ReadonlyArray<string>).includes(raw)
    ? (raw as RequisitionPriority)
    : 'all'
}

const STATUS_LABEL: Record<RequisitionStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  in_quotation: 'En cotización',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  po_generated: 'OC generada',
  cancelled: 'Cancelada',
}

const PRIORITY_LABEL: Record<RequisitionPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const STATUS_VARIANT: Record<RequisitionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  submitted: 'secondary',
  in_quotation: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  po_generated: 'default',
  cancelled: 'outline',
}

const STATUS_ICON: Record<RequisitionStatus, React.ElementType> = {
  draft: FileText,
  submitted: Clock,
  in_quotation: AlertCircle,
  approved: CheckCircle2,
  rejected: XCircle,
  po_generated: CheckCircle2,
  cancelled: XCircle,
}

interface Props {
  onOpenDetail: (id: string) => void
}

export function RequisicionesTab({ onOpenDetail }: Props) {
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  // Seed initial state from the URL so deep-links from the dashboard KPI,
  // the cockpit, and the notification bell open the list pre-filtered to
  // the same set used to compute the count (avoids a count-vs-list mismatch).
  const [status, setStatus] = useState<RequisitionStatus | 'all'>(() =>
    parseStatusParam(params.get('status')),
  )
  const [priority, setPriority] = useState<RequisitionPriority | 'all'>(() =>
    parsePriorityParam(params.get('priority')),
  )
  const from = params.get('from') ?? ''
  const to   = params.get('to')   ?? ''

  // Keep state in sync with the URL — e.g. navigating from another KPI while
  // the tab is already mounted should still re-filter the list.
  useEffect(() => {
    const nextStatus   = parseStatusParam(params.get('status'))
    const nextPriority = parsePriorityParam(params.get('priority'))
    if (nextStatus !== status) setStatus(nextStatus)
    if (nextPriority !== priority) setPriority(nextPriority)
    // We intentionally depend on the raw params so React Router updates
    // re-trigger the effect; `status`/`priority` are excluded to avoid feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const updateParam = (key: string, value: string, defaultValue = '') => {
    const next = new URLSearchParams(params)
    if (!value || value === defaultValue) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const handleStatusChange = (value: string | null) => {
    const next = parseStatusParam(value)
    setStatus(next)
    updateParam('status', next, 'all')
  }

  const handlePriorityChange = (value: string | null) => {
    const next = parsePriorityParam(value)
    setPriority(next)
    updateParam('priority', next, 'all')
  }

  const resetFilters = () => {
    setStatus('all')
    setPriority('all')
    setParams({}, { replace: true })
  }

  const { data: rows = [], isLoading } = useRequisitions({
    search: search.trim() || undefined,
    status,
    priority: priority === 'all' ? undefined : priority,
    from: from || undefined,
    to: to || undefined,
  })

  const hasActiveFilters =
    status !== 'all' || priority !== 'all' || !!from || !!to

  function handleExportCsv() {
    if (rows.length === 0) {
      toast.info('Sin datos para exportar')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    exportToCsv({
      filename: `requisiciones-${today}.csv`,
      headers: [
        'folio', 'fecha_solicitud', 'status', 'prioridad', 'requester',
        'lote', 'equipo', 'justificacion', 'total_estimado_mxn',
      ],
      rows: rows.map((r) => [
        r.folio,
        r.request_date,
        STATUS_LABEL[r.status],
        PRIORITY_LABEL[r.priority],
        r.requester?.full_name ?? '',
        r.crop_lot?.name ?? '',
        r.equipment?.name ?? '',
        r.justification ?? '',
        r.estimated_total_mxn ?? '',
      ]),
    })
    toast.success(`Exportadas ${rows.length} requisiciones`)
  }

  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
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
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-9 sm:w-52">
            <SelectValue placeholder="Estatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="submitted">Enviada</SelectItem>
            <SelectItem value="in_quotation">En cotización</SelectItem>
            <SelectItem value="approved">Aprobada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
            <SelectItem value="po_generated">OC generada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={handleExportCsv}
          disabled={isLoading || rows.length === 0}
        >
          <Download className="size-3.5" />
          Exportar CSV
        </Button>
      </div>

      {/* ── Advanced filters: date range + priority ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <DateRangeFilter
          label="Fecha de solicitud"
          from={from}
          to={to}
          onFromChange={(v) => updateParam('from', v)}
          onToChange={(v) => updateParam('to', v)}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Prioridad</span>
          <Select value={priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            <RotateCcw className="size-3.5" />
            Limpiar filtros
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin requisiciones aún"
          description={
            hasActiveFilters
              ? 'Ningún resultado coincide con los filtros aplicados.'
              : 'Crea una requisición de compra para iniciar el flujo de procurement.'
          }
        />
      ) : (
        <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
          {rows.map((r) => {
            const Icon = STATUS_ICON[r.status]
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenDetail(r.id)}
                className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 text-left transition-colors"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{r.folio}</span>
                    <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.priority === 'urgent' && (
                      <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {r.requester?.full_name ?? '—'} ·{' '}
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es })}
                    {r.crop_lot?.name && ` · ${r.crop_lot.name}`}
                    {r.equipment?.name && ` · ${r.equipment.name}`}
                  </div>
                  <div className="mt-2 hidden sm:block">
                    <RequisitionLifecycle status={r.status} compact />
                  </div>
                </div>

                {r.estimated_total_mxn != null && (
                  <div className="hidden sm:block text-right shrink-0">
                    <div className="text-sm font-medium tabular-nums">
                      ${r.estimated_total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">estimado MXN</div>
                  </div>
                )}

                <ArrowRight className="size-4 text-muted-foreground shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
