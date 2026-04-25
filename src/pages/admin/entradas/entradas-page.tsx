import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath, useCanSeePrices } from '@/hooks/use-base-path'
import {
  Plus,
  MoreHorizontal,
  Eye,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'

import { useList } from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import {
  MOVEMENT_TYPE_LABELS,
} from '@/lib/constants'
import { formatFechaCorta, formatHora } from '@/lib/utils'
import { generateEntradaPDF } from '@/lib/generate-entrada-pdf'

import type { StockMovement, MovementStatus } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { MoneyDisplay } from '@/components/custom/money-display'
import { EmptyState } from '@/components/custom/empty-state'
import { DataTable } from '@/components/shared/data-table'
import { createColumnHelper } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryMovement = StockMovement & {
  warehouse?: { id: string; name: string; code: string }
  supplier?: { id: string; name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTRY_TYPES = [
  'entry_purchase',
  'entry_return',
  'entry_transfer',
  'entry_adjustment',
  'entry_initial',
] as const

const STATUS_LABELS: Record<MovementStatus, string> = {
  draft: 'Borrador',
  posted: 'Registrado',
  cancelled: 'Cancelado',
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function typeVariant(type: string) {
  switch (type) {
    case 'entry_purchase':   return 'default'
    case 'entry_return':     return 'secondary'
    case 'entry_transfer':   return 'outline'
    case 'entry_adjustment': return 'outline'
    case 'entry_initial':    return 'secondary'
    default:                 return 'outline'
  }
}

function StatusBadge({ status }: { status: MovementStatus }) {
  const classes: Record<MovementStatus, string> = {
    draft:     'bg-muted text-muted-foreground border-muted-foreground/20',
    posted:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${classes[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Column helper ────────────────────────────────────────────────────────────

const colHelper = createColumnHelper<EntryMovement>()

// ─── Main component ───────────────────────────────────────────────────────────

export default function EntradasPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices('entry')
  const { activeSeason, organization } = useAuth()

  // Filters
  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const [filterType,   setFilterType]   = useState<string>('all')
  const [filterWh,     setFilterWh]     = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterFrom,   setFilterFrom]   = useState<string>('')
  const [filterTo,     setFilterTo]     = useState<string>('')
  const activeFilterCount = [filterType, filterWh, filterStatus, filterFrom, filterTo].filter(v => v !== 'all' && v !== '').length

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<EntryMovement | null>(null)
  const [cancelling,   setCancelling]   = useState(false)

  // Fetch all movements (entry types only filter client-side for type flexibility)
  const { data: rawMovements = [], isLoading, refetch } = useList<EntryMovement>(
    'stock_movements',
    {
      select: '*, warehouse:warehouses!stock_movements_warehouse_id_fkey(id, name, code), supplier:suppliers(id, name)',
      filters: activeSeason?.id ? { season_id: activeSeason.id } : {},
    }
  )

  // Client-side: keep only entry types, then apply UI filters
  const movements = useMemo(() => {
    return rawMovements
      .filter((m) => ENTRY_TYPES.includes(m.movement_type as typeof ENTRY_TYPES[number]))
      .filter((m) => filterType   === 'all' || m.movement_type === filterType)
      .filter((m) => filterWh     === 'all' || m.warehouse_id  === filterWh)
      .filter((m) => filterStatus === 'all' || m.status        === filterStatus)
      .filter((m) => {
        if (!filterFrom && !filterTo) return true
        const d = m.created_at.slice(0, 10)
        if (filterFrom && d < filterFrom) return false
        if (filterTo   && d > filterTo)   return false
        return true
      })
  }, [rawMovements, filterType, filterWh, filterStatus, filterFrom, filterTo])

  // Unique warehouses from fetched data (for filter select)
  const warehouses = useMemo(() => {
    const map = new Map<string, string>()
    rawMovements.forEach((m) => {
      if (m.warehouse) map.set(m.warehouse.id, `${m.warehouse.code} – ${m.warehouse.name}`)
    })
    return Array.from(map.entries())
  }, [rawMovements])

  // Handle print nota
  async function handlePrintNota(m: EntryMovement) {
    try {
      const db = supabase as any
      const { data: mov, error } = await db
        .from('stock_movements')
        .select('*, warehouse:warehouses!stock_movements_warehouse_id_fkey(*), supplier:suppliers(*), lines:stock_movement_lines(*, item:items(*, unit:units(*)))')
        .eq('id', m.id)
        .single()
      if (error) throw error

      let receivedByName: string | undefined
      if (mov.received_by_employee_id) {
        const { data: emp } = await db.from('employees').select('full_name').eq('id', mov.received_by_employee_id).single()
        receivedByName = emp?.full_name
      }

      generateEntradaPDF({
        movement: mov,
        organization: organization!,
        supplierName: mov.supplier?.name,
        receivedByName,
      })
    } catch (err: any) {
      console.error(err)
      toast.error('Error al generar el PDF')
    }
  }

  // Handle post (draft → posted)
  async function handlePost(m: EntryMovement) {
    try {
      const { error } = await (supabase as any)
        .from('stock_movements')
        .update({ status: 'posted' })
        .eq('id', m.id)
      if (error) throw error
      toast.success('Entrada registrada correctamente')
      refetch()
    } catch {
      toast.error('Error al registrar la entrada')
    }
  }

  // Handle cancel (posted → cancelled)
  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { error } = await (supabase as any)
        .from('stock_movements')
        .update({ status: 'cancelled' })
        .eq('id', cancelTarget.id)
      if (error) throw error
      toast.success('Entrada cancelada')
      refetch()
    } catch {
      toast.error('Error al cancelar la entrada')
    } finally {
      setCancelling(false)
      setCancelTarget(null)
    }
  }

  // ─── Columns ─────────────────────────────────────────────────────────────

  const columns = [
    colHelper.accessor('document_number', {
      header: 'Folio',
      cell: (info) => {
        const docNum = info.getValue()
        const ref = (info.row.original as any).reference_external as string | null
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-foreground">
              {docNum ?? <span className="text-muted-foreground">—</span>}
            </span>
            {ref && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{ref}</span>}
          </div>
        )
      },
    }),
    colHelper.accessor('movement_type', {
      header: 'Tipo',
      cell: (info) => (
        <Badge variant={typeVariant(info.getValue()) as any} className="text-xs whitespace-nowrap">
          {MOVEMENT_TYPE_LABELS[info.getValue()] ?? info.getValue()}
        </Badge>
      ),
    }),
    colHelper.accessor('warehouse_id', {
      header: 'Almacén',
      cell: (info) => {
        const row = info.row.original
        return (
          <span className="text-sm">
            {row.warehouse ? `${row.warehouse.code} – ${row.warehouse.name}` : '—'}
          </span>
        )
      },
    }),
    colHelper.accessor('supplier_id', {
      header: 'Proveedor',
      cell: (info) => {
        const row = info.row.original
        return (
          <span className="text-sm text-muted-foreground">
            {row.supplier?.name ?? '—'}
          </span>
        )
      },
    }),
    ...(canSeePrices ? [colHelper.accessor('total_mxn', {
      header: () => <span className="block text-right">Total MXN</span>,
      cell: (info) => (
        <div className="flex justify-end">
          <MoneyDisplay amount={info.getValue() ?? 0} currency="MXN" />
        </div>
      ),
    })] : []),
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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/entradas/${row.id}`) }}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                Ver
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePrintNota(row) }}>
                <Printer className="mr-2 h-3.5 w-3.5" />
                Imprimir nota
              </DropdownMenuItem>
              {row.status === 'draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePost(row) }} className="text-emerald-600 focus:text-emerald-600">
                    <CheckCircle className="mr-2 h-3.5 w-3.5" />
                    Registrar
                  </DropdownMenuItem>
                </>
              )}
              {row.status === 'posted' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCancelTarget(row) }} className="text-destructive focus:text-destructive">
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                    Cancelar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        title="Entradas"
        description="Registro de entradas al almacén"
        actions={
          <Button size="sm" onClick={() => navigate(`${basePath}/entradas/nueva`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nueva entrada
          </Button>
        }
      />

      {/* Filters — collapsible on mobile */}
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
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${filtersOpen ? 'mt-3' : 'hidden md:grid'}`}>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v ?? 'all')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue>{filterType === 'all' ? 'Todos los tipos' : (MOVEMENT_TYPE_LABELS[filterType] ?? filterType)}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {ENTRY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Almacén</Label>
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
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      {!isLoading && movements.length === 0 ? null : (
        <div className="flex flex-col gap-2 md:hidden">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="mt-2 flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
              ))
            : movements.map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`${basePath}/entradas/${m.id}`)}
                  className="rounded-xl border border-border bg-card p-3 active:bg-muted cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-medium truncate">
                        {m.document_number ?? <span className="text-muted-foreground">—</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.warehouse ? `${m.warehouse.code} – ${m.warehouse.name}` : '—'}
                      </p>
                    </div>
                    <Badge variant={typeVariant(m.movement_type) as any} className="text-xs whitespace-nowrap shrink-0">
                      {MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <StatusBadge status={m.status} />
                    <div className="flex flex-col items-end gap-0.5">
                      {canSeePrices && (
                        <span className="font-mono font-medium text-foreground">
                          {m.total_mxn != null ? `$${m.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                      )}
                      <span className="text-muted-foreground">{formatFechaCorta(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* Table (desktop) */}
      {!isLoading && movements.length === 0 ? (
        <EmptyState
          title="Sin entradas"
          description="Aún no hay entradas registradas con los filtros seleccionados."
          action={{
            label: 'Nueva entrada',
            onClick: () => navigate(`${basePath}/entradas/nueva`),
          }}
        />
      ) : (
        <div className="hidden md:block">
          <DataTable
            columns={columns as any}
            data={movements}
            isLoading={isLoading}
            emptyMessage="Sin entradas para los filtros seleccionados."
            onRowClick={(row) => navigate(`${basePath}/entradas/${row.id}`)}
          />
        </div>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción revertirá el movimiento de inventario asociado. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
