import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import {
  Plus,
  ArrowLeftRight,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react'
import { useList } from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { formatFechaCorta, formatHora } from '@/lib/utils'

import type { StockMovement } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { DataTable } from '@/components/shared/data-table'
import { createColumnHelper } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferMovement = StockMovement & {
  warehouse?: { id: string; name: string; code: string }
  counterpart_warehouse?: { id: string; name: string; code: string }
  lines_count?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    draft:     'bg-muted text-muted-foreground border-muted-foreground/20',
    posted:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  }
  const labels: Record<string, string> = {
    draft: 'Borrador', posted: 'Registrado', cancelled: 'Cancelado',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${classes[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  )
}

const colHelper = createColumnHelper<TransferMovement>()

// ─── Main component ───────────────────────────────────────────────────────────

export default function TraspasosPage() {
  const navigate   = useNavigate()
  const basePath   = useBasePath()
  const { activeSeason } = useAuth()

  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const [filterWh,     setFilterWh]     = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterFrom,   setFilterFrom]   = useState<string>('')
  const [filterTo,     setFilterTo]     = useState<string>('')
  const activeFilterCount = [filterWh, filterStatus, filterFrom, filterTo].filter(v => v !== 'all' && v !== '').length

  // Fetch exit_transfer movements with both warehouse joins
  const { data: rawMovements = [], isLoading } = useList<TransferMovement>(
    'stock_movements',
    {
      select: '*, warehouse:warehouses!stock_movements_warehouse_id_fkey(id, name, code), counterpart_warehouse:warehouses!stock_movements_counterpart_warehouse_id_fkey(id, name, code)',
      filters: activeSeason?.id ? { season_id: activeSeason.id, movement_type: 'exit_transfer' } : { movement_type: 'exit_transfer' },
      enabled: !!activeSeason?.id,
    }
  )

  const movements = useMemo(() => {
    return rawMovements
      .filter((m) => filterWh     === 'all' || m.warehouse_id === filterWh)
      .filter((m) => filterStatus === 'all' || m.status       === filterStatus)
      .filter((m) => {
        if (!filterFrom && !filterTo) return true
        const d = m.created_at.slice(0, 10)
        if (filterFrom && d < filterFrom) return false
        if (filterTo   && d > filterTo)   return false
        return true
      })
  }, [rawMovements, filterWh, filterStatus, filterFrom, filterTo])

  const warehouses = useMemo(() => {
    const map = new Map<string, string>()
    rawMovements.forEach((m) => {
      if (m.warehouse) map.set(m.warehouse.id, `${m.warehouse.code} – ${m.warehouse.name}`)
    })
    return Array.from(map.entries())
  }, [rawMovements])

  const columns = [
    colHelper.accessor('document_number', {
      header: 'Folio',
      cell: (info) => (
        <span className="font-mono text-xs text-foreground">
          {info.getValue() ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    }),
    colHelper.accessor('warehouse_id', {
      header: 'Origen → Destino',
      cell: (info) => {
        const row = info.row.original
        const origin = row.warehouse
          ? `${row.warehouse.code} – ${row.warehouse.name}`
          : '—'
        const dest = row.counterpart_warehouse
          ? `${row.counterpart_warehouse.code} – ${row.counterpart_warehouse.name}`
          : '—'
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{origin}</span>
            <ArrowLeftRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span>{dest}</span>
          </div>
        )
      },
    }),
    colHelper.accessor('transport_notes', {
      header: 'Notas transporte',
      cell: (info) => (
        <span className="text-xs text-muted-foreground line-clamp-1 max-w-[160px]">
          {info.getValue() ?? '—'}
        </span>
      ),
    }),
    colHelper.accessor('status', {
      header: 'Estado',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    colHelper.accessor('created_at', {
      header: 'Fecha',
      cell: (info) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">{formatFechaCorta(info.getValue())}</span>
          <span className="text-[11px] text-muted-foreground">{formatHora(info.getValue())}</span>
        </div>
      ),
    }),
    colHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()} />}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/traspasos/${row.id}`) }}>
                Ver detalle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        title="Traspasos"
        description="Movimientos entre almacenes"
        actions={
          <Button size="sm" onClick={() => navigate(`${basePath}/traspasos/nuevo`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo traspaso
          </Button>
        }
      />

      {/* Filters */}
      <div>
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted md:hidden"
        >
          <SlidersHorizontal className="size-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activeFilterCount}</Badge>
          )}
        </button>
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${filtersOpen ? 'mt-3' : 'hidden md:grid'}`}>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Almacén origen</Label>
            <Select value={filterWh} onValueChange={(v) => setFilterWh(v ?? 'all')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue>{filterWh === 'all' ? 'Todos' : (warehouses.find(([id]) => id === filterWh)?.[1] ?? filterWh)}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {warehouses.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? 'all')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue>{{ all: 'Todos', draft: 'Borrador', posted: 'Registrado', cancelled: 'Cancelado' }[filterStatus] ?? filterStatus}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="posted">Registrado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      {!isLoading && movements.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden">
          {movements.map((m) => (
            <div
              key={m.id}
              onClick={() => navigate(`${basePath}/traspasos/${m.id}`)}
              className="rounded-xl border border-border bg-card p-3 active:bg-muted cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-mono font-medium truncate">
                  {m.document_number ?? <span className="text-muted-foreground">—</span>}
                </p>
                <StatusBadge status={m.status} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{m.warehouse ? `${m.warehouse.code}` : '—'}</span>
                <ArrowLeftRight className="h-3 w-3 shrink-0" />
                <span>{m.counterpart_warehouse ? `${m.counterpart_warehouse.code}` : '—'}</span>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">{formatFechaCorta(m.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      {!isLoading && movements.length === 0 ? (
        <EmptyState
          title="Sin traspasos"
          description="Aún no hay traspasos registrados con los filtros seleccionados."
          action={{
            label: 'Nuevo traspaso',
            onClick: () => navigate(`${basePath}/traspasos/nuevo`),
          }}
        />
      ) : (
        <div className="hidden md:block">
          <DataTable
            columns={columns as any}
            data={movements}
            isLoading={isLoading}
            emptyMessage="Sin traspasos para los filtros seleccionados."
            onRowClick={(row) => navigate(`${basePath}/traspasos/${row.id}`)}
          />
        </div>
      )}
    </div>
  )
}
