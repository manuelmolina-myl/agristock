import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, ArrowRight, Download, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

import { EmptyState } from '@/components/custom/empty-state'
import { DateRangeFilter } from '@/components/custom/date-range-filter'
import { AmountRangeFilter } from '@/components/custom/amount-range-filter'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePurchaseOrders, useSuppliersLite } from '@/features/compras/hooks'
import { exportToCsv } from '@/lib/csv-export'
import type { POStatus } from '@/lib/database.types'

const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Borrador',
  pending_signature: 'Pendiente de firma',
  sent: 'Firmada',
  confirmed: 'Confirmada',
  partially_received: 'Recepción parcial',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
}

const PO_STATUS_VARIANT: Record<POStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  pending_signature: 'secondary',
  sent: 'secondary',
  confirmed: 'secondary',
  partially_received: 'secondary',
  received: 'default',
  closed: 'default',
  cancelled: 'destructive',
}

const VALID_PO_STATUSES: ReadonlyArray<POStatus> = [
  'draft', 'pending_signature', 'sent', 'confirmed',
  'partially_received', 'received', 'closed', 'cancelled',
]

function parseStatusParam(raw: string | null): POStatus | 'all' {
  if (!raw) return 'all'
  return (VALID_PO_STATUSES as ReadonlyArray<string>).includes(raw)
    ? (raw as POStatus)
    : 'all'
}

interface Props {
  onOpenDetail: (id: string) => void
}

export function OcTab({ onOpenDetail }: Props) {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')

  // All filter state is deep-linkable via the URL — refresh-safe and shareable.
  const status   = parseStatusParam(params.get('status'))
  const supplier = params.get('supplier') ?? 'all'
  const from     = params.get('from') ?? ''
  const to       = params.get('to')   ?? ''
  const min      = params.get('min')  ?? ''
  const max      = params.get('max')  ?? ''

  // Sync changes back into the URL.  `replace: true` keeps history clean.
  const updateParam = (key: string, value: string, defaultValue = '') => {
    const next = new URLSearchParams(params)
    if (!value || value === defaultValue) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const resetFilters = () => setParams({}, { replace: true })

  const minNum = min ? Number(min) : undefined
  const maxNum = max ? Number(max) : undefined

  const { data: rows = [], isLoading } = usePurchaseOrders({
    search: search.trim() || undefined,
    status,
    supplier_id: supplier === 'all' ? undefined : supplier,
    from: from || undefined,
    to: to || undefined,
    min_mxn: Number.isFinite(minNum) ? minNum : undefined,
    max_mxn: Number.isFinite(maxNum) ? maxNum : undefined,
  })
  const { data: suppliers = [] } = useSuppliersLite()

  const hasActiveFilters =
    status !== 'all' || supplier !== 'all' || !!from || !!to || !!min || !!max

  // Pre-warm the search field when navigating directly via `?folio=`.
  useEffect(() => {
    const f = params.get('folio')
    if (f && !search) setSearch(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleExportCsv() {
    if (rows.length === 0) {
      toast.info('Sin datos para exportar')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    exportToCsv({
      filename: `ordenes-compra-${today}.csv`,
      headers: [
        'folio', 'fecha_emision', 'proveedor', 'rfc', 'total_mxn', 'status',
        'fecha_entrega_esperada', 'fecha_firma', 'fecha_cancelacion', 'motivo_cancelacion',
      ],
      rows: rows.map((po) => [
        po.folio,
        po.issue_date,
        po.supplier?.name ?? '',
        po.supplier?.rfc ?? '',
        po.total_mxn ?? '',
        PO_STATUS_LABEL[po.status],
        po.expected_delivery_date ?? '',
        po.approved_at ?? '',
        po.cancelled_at ?? '',
        po.cancellation_reason ?? '',
      ]),
    })
    toast.success(`Exportadas ${rows.length} OC`)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Top row: search + status + actions ── */}
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
        <Select
          value={status}
          onValueChange={(v) => updateParam('status', v ?? 'all', 'all')}
        >
          <SelectTrigger className="h-9 sm:w-52">
            <SelectValue placeholder="Estatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="partially_received">Recepción parcial</SelectItem>
            <SelectItem value="received">Recibida</SelectItem>
            <SelectItem value="closed">Cerrada</SelectItem>
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

      {/* ── Advanced filters: date range, amount range, supplier ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <DateRangeFilter
          label="Fecha de emisión"
          from={from}
          to={to}
          onFromChange={(v) => updateParam('from', v)}
          onToChange={(v) => updateParam('to', v)}
        />
        <AmountRangeFilter
          label="Total (MXN)"
          min={min}
          max={max}
          onMinChange={(v) => updateParam('min', v)}
          onMaxChange={(v) => updateParam('max', v)}
          placeholder="MXN"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Proveedor</span>
          <Select
            value={supplier}
            onValueChange={(v) => updateParam('supplier', v ?? 'all', 'all')}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin órdenes de compra"
          description={
            hasActiveFilters
              ? 'Ningún resultado coincide con los filtros aplicados.'
              : 'Las OCs aprobadas aparecerán aquí. Genera una desde una requisición aprobada.'
          }
        />
      ) : (
        <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
          {rows.map((po) => (
            <button
              key={po.id}
              type="button"
              onClick={() => onOpenDetail(po.id)}
              className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{po.folio}</span>
                  <Badge variant={PO_STATUS_VARIANT[po.status]} className="text-[10px]">
                    {PO_STATUS_LABEL[po.status]}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground truncate">
                  {po.supplier?.name ?? '—'} · emisión {format(new Date(po.issue_date), 'd MMM', { locale: es })}
                  {po.warehouse?.name && ` · destino ${po.warehouse.name}`}
                </div>
              </div>

              {po.total_mxn != null && (
                <div className="hidden sm:block text-right shrink-0">
                  <div className="text-sm font-medium tabular-nums">
                    ${po.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">MXN incl. IVA</div>
                </div>
              )}

              <ArrowRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
