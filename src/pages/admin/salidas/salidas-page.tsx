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
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatFechaCorta, formatHora } from '@/lib/utils'
import { generateValePDF } from '@/lib/generate-vale-pdf'

import type { StockMovement, MovementStatus } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { MoneyDisplay } from '@/components/custom/money-display'
import { EmptyState } from '@/components/custom/empty-state'
import { DataTable, createColumnHelper } from '@/components/shared/data-table'

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

type MovementLine = {
  destination_type: string | null
  crop_lot?: { name: string; code: string } | null
  equipment?: { name: string; code: string } | null
  employee?: { full_name: string; employee_code: string } | null
}

type ExitMovement = StockMovement & {
  warehouse?: { id: string; name: string; code: string }
  lines?: MovementLine[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXIT_TYPES = [
  'exit_consumption',
  'exit_transfer',
  'exit_adjustment',
  'exit_waste',
  'exit_sale',
] as const

const STATUS_LABELS: Record<MovementStatus, string> = {
  draft: 'Borrador',
  posted: 'Registrado',
  cancelled: 'Cancelado',
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function typeVariant(type: string) {
  switch (type) {
    case 'exit_consumption': return 'default'
    case 'exit_transfer':    return 'secondary'
    case 'exit_adjustment':  return 'outline'
    case 'exit_waste':       return 'destructive'
    case 'exit_sale':        return 'secondary'
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

// ─── Destination cell helper ──────────────────────────────────────────────────

function DestinationCell({ movement }: { movement: ExitMovement }) {
  const line = movement.lines?.[0]

  if (!line) return <span className="text-xs text-muted-foreground">—</span>

  const destType = line.destination_type

  if (destType === 'crop_lot' && line.crop_lot) {
    return <span className="text-sm">{line.crop_lot.name}</span>
  }
  if (destType === 'equipment' && line.equipment) {
    return <span className="text-sm">{line.equipment.name}</span>
  }
  if (destType === 'employee' && line.employee) {
    return <span className="text-sm">{line.employee.full_name}</span>
  }
  if (destType === 'maintenance') {
    return <span className="text-sm text-muted-foreground">Mantenimiento</span>
  }
  if (destType === 'waste') {
    return <span className="text-sm text-muted-foreground">Merma</span>
  }
  if (destType === 'other') {
    return <span className="text-sm text-muted-foreground">Otro</span>
  }

  return <span className="text-xs text-muted-foreground">—</span>
}

// ─── Column helper ────────────────────────────────────────────────────────────

const colHelper = createColumnHelper<ExitMovement>()

// ─── Main component ───────────────────────────────────────────────────────────

export function SalidasPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()
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
  const [cancelTarget, setCancelTarget] = useState<ExitMovement | null>(null)
  const [cancelling,   setCancelling]   = useState(false)

  // Fetch all movements (exit types filtered client-side)
  const { data: rawMovements = [], isLoading, refetch } = useList<ExitMovement>(
    'stock_movements',
    {
      select: '*, warehouse:warehouses!stock_movements_warehouse_id_fkey(id, name, code), received_by:employees!stock_movements_received_by_employee_id_fkey(full_name), lines:stock_movement_lines(destination_type, crop_lot:crops_lots(name, code), equipment:equipment(name, code), employee:employees(full_name, employee_code))',
      filters: activeSeason?.id ? { season_id: activeSeason.id } : {},
      enabled: !!activeSeason?.id,
    }
  )

  // Client-side: keep only exit types, then apply UI filters
  const movements = useMemo(() => {
    return rawMovements
      .filter((m) => EXIT_TYPES.includes(m.movement_type as typeof EXIT_TYPES[number]))
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

  // Handle print vale
  async function handlePrintVale(m: ExitMovement) {
    try {
      const db = supabase as any
      const { data: mov, error } = await db
        .from('stock_movements')
        .select('*, warehouse:warehouses!stock_movements_warehouse_id_fkey(*), lines:stock_movement_lines(*, item:items(*, unit:units(*)))')
        .eq('id', m.id)
        .single()
      if (error) throw error

      // Fetch employee names if IDs exist
      let deliveredByName: string | undefined
      let receivedByName: string | undefined
      if (mov.delivered_by_employee_id) {
        const { data: emp } = await db.from('employees').select('full_name').eq('id', mov.delivered_by_employee_id).single()
        deliveredByName = emp?.full_name
      }
      if (mov.received_by_employee_id) {
        const { data: emp } = await db.from('employees').select('full_name').eq('id', mov.received_by_employee_id).single()
        receivedByName = emp?.full_name
      }

      generateValePDF({
        movement: mov,
        organization: organization!,
        deliveredByName,
        receivedByName,
        canSeePrices,
      })
    } catch (err: any) {
      console.error(err)
      toast.error('Error al generar el PDF')
    }
  }

  // Handle post (draft → posted)
  async function handlePost(m: ExitMovement) {
    try {
      const { error } = await (supabase as any)
        .from('stock_movements')
        .update({ status: 'posted' })
        .eq('id', m.id)
      if (error) throw error
      toast.success('Salida registrada correctamente')
      refetch()
    } catch {
      toast.error('Error al registrar la salida')
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
      toast.success('Salida cancelada')
      refetch()
    } catch {
      toast.error('Error al cancelar la salida')
    } finally {
      setCancelling(false)
      setCancelTarget(null)
    }
  }

  // ─── Columns ─────────────────────────────────────────────────────────────

  const columns = [
    colHelper.accessor('document_number', {
      header: 'Folio',
      cell: (info) => (
        <span className="font-mono text-xs text-foreground">
          {info.getValue() ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
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
    colHelper.display({
      id: 'destination',
      header: 'Destino',
      cell: (info) => <DestinationCell movement={info.row.original} />,
    }),
    colHelper.display({
      id: 'receiver',
      header: 'Recibe',
      cell: (info) => {
        const row = info.row.original as any
        const name = row.received_by?.full_name
        if (!name) return <span className="text-xs text-muted-foreground">—</span>
        return <span className="text-sm">{name}</span>
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
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`${basePath}/salidas/${row.id}`) }}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePrintVale(row) }}>
                <Printer className="mr-2 h-3.5 w-3.5" />
                Imprimir vale
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
        title="Salidas"
        description="Registro de salidas del almacén"
        actions={
          <Button size="sm" onClick={() => navigate(`${basePath}/salidas/nueva`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nueva salida
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
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {EXIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Almacén</Label>
            <Select value={filterWh} onValueChange={(v) => setFilterWh(v ?? 'all')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
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
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
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
                  onClick={() => navigate(`${basePath}/salidas/${m.id}`)}
                  className="rounded-xl border border-border bg-card p-3 active:bg-muted cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-medium truncate">
                        {m.document_number ?? <span className="text-muted-foreground">—</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.warehouse ? `${m.warehouse.code} – ${m.warehouse.name}` : '—'}
                        {m.lines?.[0] && <> · <DestinationCell movement={m} /></>}
                        {m.notes && m.notes.startsWith('Recibe:') && (
                          <> · {m.notes.split('.')[0]}</>
                        )}
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
          title="Sin salidas"
          description="Aún no hay salidas registradas con los filtros seleccionados."
          action={{
            label: 'Nueva salida',
            onClick: () => navigate(`${basePath}/salidas/nueva`),
          }}
        />
      ) : (
        <div className="hidden md:block">
          <DataTable
            columns={columns as any}
            data={movements}
            isLoading={isLoading}
            emptyMessage="Sin salidas para los filtros seleccionados."
            onRowClick={(row) => navigate(`${basePath}/salidas/${row.id}`)}
          />
        </div>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta salida?</AlertDialogTitle>
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

export default SalidasPage
