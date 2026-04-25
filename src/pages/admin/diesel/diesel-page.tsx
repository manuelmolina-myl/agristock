import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath, useCanSeePrices } from '@/hooks/use-base-path'
import {
  Fuel,
  DollarSign,
  Gauge,
  ClipboardList,
  SlidersHorizontal,
  MoreHorizontal,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useEquipment, useEmployees, useItemStock } from '@/hooks/use-supabase-query'
import { formatFechaCorta, formatHora, formatMoney, formatQuantity, cn } from '@/lib/utils'
import type { StockMovementLine, Equipment, Employee, Item, StockMovement } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { MoneyDisplay } from '@/components/custom/money-display'
import { EmptyState } from '@/components/custom/empty-state'
import { SearchableSelect } from '@/components/shared/searchable-select'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

// ─── Types ─────────────────────────────────────────────────────────────────────

type DieselLine = StockMovementLine & {
  movement: StockMovement
  item: Item
  equipment: Equipment | null
  operator: Employee | null
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

async function fetchDieselLines(orgId: string): Promise<DieselLine[]> {
  const { data, error } = await db
    .from('stock_movement_lines')
    .select(
      '*, movement:stock_movements(*), item:items!inner(*), equipment:equipment(*), operator:employees!stock_movement_lines_operator_employee_id_fkey(*)'
    )
    .eq('item.is_diesel', true)
    .eq('movement.organization_id', orgId)
    .eq('movement.status', 'posted')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as DieselLine[]) ?? []
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calcRendimiento(line: DieselLine): number | null {
  const liters = line.diesel_liters
  const before = line.equipment_hours_before
  const after = line.equipment_hours_after
  if (liters == null || before == null || after == null) return null
  const delta = after - before
  if (delta <= 0) return null
  return liters / delta
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  loading?: boolean
}

function KpiCard({ icon, label, value, sub, loading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-28 mt-0.5" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton({ canSeePrices }: { canSeePrices: boolean }) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          {canSeePrices && <TableCell><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>}
          <TableCell><Skeleton className="h-5 w-5 ml-auto" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Anomaly Badge ────────────────────────────────────────────────────────────

function AnomalyBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[10px] h-4 px-1 border-amber-400 text-amber-600 dark:text-amber-400 gap-0.5"
    >
      <AlertTriangle className="size-2.5" />
      Alto
    </Badge>
  )
}

// ─── Chart: Consumo por tractor ────────────────────────────────────────────────

interface EquipBarData {
  name: string
  liters: number
}

function ConsumoBarChart({ data }: { data: EquipBarData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${formatQuantity(v, 0)}`}
          className="text-muted-foreground"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`${formatQuantity(Number(value), 1)} L`, 'Litros']}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="liters" fill="#16a34a" radius={[0, 3, 3, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Chart: Tendencia de consumo ───────────────────────────────────────────────

interface TrendData {
  date: string
  liters: number
}

function TendenciaAreaChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `${formatQuantity(v, 0)}`}
          className="text-muted-foreground"
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`${formatQuantity(Number(value), 1)} L`, 'Litros']}
          contentStyle={{ fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="liters"
          stroke="#16a34a"
          strokeWidth={2}
          fill="#16a34a"
          fillOpacity={0.15}
          dot={data.length <= 14 ? { r: 3, fill: '#16a34a' } : false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Mobile Card ──────────────────────────────────────────────────────────────

interface MobileCardProps {
  line: DieselLine
  rendimiento: number | null
  isAnomalo: boolean
  onCancel: (line: DieselLine) => void
  canSeePrices: boolean
}

function MobileDieselCard({ line, rendimiento, isAnomalo, onCancel, canSeePrices }: MobileCardProps) {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-xl border border-border bg-card p-3 cursor-pointer active:bg-muted"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {line.equipment ? (
            <>
              <button
                type="button"
                className="text-sm font-medium truncate hover:text-primary hover:underline text-left block w-full"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`${basePath}/diesel/tractor/${line.equipment!.id}`)
                }}
              >
                {line.equipment.name}
              </button>
              <p className="text-xs text-muted-foreground truncate">
                {line.operator?.full_name ?? '—'}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sin equipo</p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-lg font-semibold tabular-nums font-mono leading-tight">
            {line.diesel_liters != null
              ? `${formatQuantity(line.diesel_liters, 1)} L`
              : '—'}
          </span>
          {canSeePrices && line.line_total_mxn != null && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatMoney(line.line_total_mxn, 'MXN')}
            </span>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {rendimiento != null ? (
            <>
              <span className="font-mono">{formatQuantity(rendimiento, 2)} L/h</span>
              {isAnomalo && <AnomalyBadge />}
            </>
          ) : (
            <span>Sin rendimiento</span>
          )}
        </div>
        <span>{formatFechaCorta(line.movement.created_at)}</span>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div
          className="mt-3 border-t border-border pt-3 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {line.equipment_hours_before != null && line.equipment_hours_after != null && (
            <p className="text-xs text-muted-foreground font-mono">
              Horómetro: {formatQuantity(line.equipment_hours_before, 1)} → {formatQuantity(line.equipment_hours_after, 1)} h
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive h-8"
            onClick={() => onCancel(line)}
          >
            <XCircle className="mr-2 size-3.5" />
            Cancelar carga
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DieselPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const orgId = organization?.id ?? ''

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterEquipment, setFilterEquipment] = useState('')
  const [filterOperator, setFilterOperator] = useState('')

  const activeFilterCount = [filterFrom, filterTo, filterEquipment, filterOperator].filter(
    (v) => v !== ''
  ).length

  // ── Cancel dialog state ───────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<DieselLine | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ── Fetch diesel item & stock ─────────────────────────────────────────────────
  const { data: dieselItem } = useQuery<Item | null>({
    queryKey: ['diesel-item', orgId],
    queryFn: async () => {
      const { data } = await db
        .from('items')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_diesel', true)
        .is('deleted_at', null)
        .limit(1)
        .single()
      return data ?? null
    },
    enabled: !!orgId,
  })

  const { data: stockRows = [] } = useItemStock(
    dieselItem ? { item_id: dieselItem.id } : undefined
  )

  // ── Fetch diesel lines ────────────────────────────────────────────────────────
  const { data: lines = [], isLoading, error } = useQuery<DieselLine[]>({
    queryKey: ['diesel-lines', orgId],
    queryFn: () => fetchDieselLines(orgId),
    enabled: !!orgId,
  })

  // ── Fetch equipment & employees for filter selects ────────────────────────────
  const { data: equipmentList = [] } = useEquipment()
  const { data: employeeList = [] } = useEmployees()

  const equipmentOptions = useMemo(
    () =>
      equipmentList.map((e) => ({
        value: e.id,
        label: e.name,
        sublabel: e.code,
      })),
    [equipmentList]
  )

  const operatorOptions = useMemo(
    () =>
      employeeList.map((e) => ({
        value: e.id,
        label: e.full_name,
        sublabel: e.employee_code,
      })),
    [employeeList]
  )

  // ── Per-equipment average rendimiento (for anomaly detection) ─────────────────
  const avgRenByEquip = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const l of lines) {
      const r = calcRendimiento(l)
      if (r !== null && l.equipment_id) {
        if (!map[l.equipment_id]) map[l.equipment_id] = []
        map[l.equipment_id].push(r)
      }
    }
    const result: Record<string, number> = {}
    for (const [id, arr] of Object.entries(map)) {
      result[id] = arr.reduce((s, v) => s + v, 0) / arr.length
    }
    return result
  }, [lines])

  // ── Client-side filter ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (filterEquipment && l.equipment_id !== filterEquipment) return false
      if (filterOperator && l.operator_employee_id !== filterOperator) return false
      if (filterFrom || filterTo) {
        const d = (l.movement.created_at ?? '').slice(0, 10)
        if (filterFrom && d < filterFrom) return false
        if (filterTo && d > filterTo) return false
      }
      return true
    })
  }, [lines, filterFrom, filterTo, filterEquipment, filterOperator])

  // ── KPIs from filtered data ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const litrosTotal = filtered.reduce((s, l) => s + (l.diesel_liters ?? 0), 0)
    const gastoTotal = filtered.reduce((s, l) => s + (l.line_total_mxn ?? 0), 0)

    const rendimientos = filtered.map(calcRendimiento).filter((r): r is number => r !== null)
    const rendimientoPromedio =
      rendimientos.length > 0
        ? rendimientos.reduce((s, r) => s + r, 0) / rendimientos.length
        : null

    const totalCargas = filtered.length

    return { litrosTotal, gastoTotal, rendimientoPromedio, totalCargas }
  }, [filtered])

  // ── Chart: Consumo por tractor (top 10) ───────────────────────────────────────
  const barData = useMemo((): EquipBarData[] => {
    const map: Record<string, { name: string; liters: number }> = {}
    for (const l of filtered) {
      if (l.equipment && l.diesel_liters) {
        const id = l.equipment.id
        if (!map[id]) map[id] = { name: l.equipment.name, liters: 0 }
        map[id].liters += l.diesel_liters
      }
    }
    return Object.values(map)
      .sort((a, b) => b.liters - a.liters)
      .slice(0, 10)
  }, [filtered])

  // ── Chart: Tendencia diaria ───────────────────────────────────────────────────
  const trendData = useMemo((): TrendData[] => {
    const map: Record<string, number> = {}
    for (const l of filtered) {
      const day = (l.movement.created_at ?? '').slice(0, 10)
      if (!day) continue
      if (!map[day]) map[day] = 0
      map[day] += l.diesel_liters ?? 0
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, liters]) => ({
        date: formatFechaCorta(date + 'T12:00:00'),
        liters,
      }))
  }, [filtered])

  // ── Cancel action ─────────────────────────────────────────────────────────────
  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { error: movErr } = await db
        .from('stock_movements')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Cancelado desde módulo de diésel',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', cancelTarget.movement_id)
      if (movErr) throw movErr
      toast.success('Carga cancelada correctamente')
      queryClient.invalidateQueries({ queryKey: ['diesel-lines', orgId] })
    } catch {
      toast.error('Error al cancelar la carga')
    } finally {
      setCancelling(false)
      setCancelTarget(null)
    }
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  if (error) {
    toast.error('Error al cargar registros de diésel')
  }

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Diésel"
        description="Control de consumo de combustible"
        actions={
          <Button size="sm" onClick={() => navigate(`${basePath}/diesel/cargar`)}>
            + Carga rápida
          </Button>
        }
      />

      {/* ── Stock disponible ─────────────────────────────────────────────────── */}
      {dieselItem && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Fuel className="size-3.5 text-muted-foreground" />
              Stock disponible
              <span className="text-xs font-normal text-muted-foreground">— {dieselItem.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {stockRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin stock registrado. Realiza una entrada de diésel para ver el inventario disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-6">
                {stockRows.map((row) => (
                  <div key={`${row.item_id}-${row.warehouse_id}`} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{row.warehouse?.name ?? row.warehouse_id}</span>
                    <span className="text-2xl font-semibold tabular-nums font-mono">
                      {formatQuantity(row.quantity, 1)} <span className="text-base font-normal text-muted-foreground">L</span>
                    </span>
                    {canSeePrices && (
                      <span className="text-xs text-muted-foreground font-mono">
                        Costo prom.: {formatMoney(row.avg_cost_mxn, 'MXN')}/L
                      </span>
                    )}
                  </div>
                ))}
                {stockRows.length > 1 && (
                  <>
                    <div className="w-px bg-border self-stretch" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className="text-2xl font-semibold tabular-nums font-mono">
                        {formatQuantity(stockRows.reduce((s, r) => s + r.quantity, 0), 1)} <span className="text-base font-normal text-muted-foreground">L</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div>
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted md:hidden"
        >
          <SlidersHorizontal className="size-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </button>

        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-4',
            filtersOpen ? 'mt-3' : 'hidden md:grid'
          )}
        >
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Equipo</Label>
            <SearchableSelect
              value={filterEquipment}
              onValueChange={setFilterEquipment}
              options={[{ value: '', label: 'Todos los equipos' }, ...equipmentOptions]}
              placeholder="Todos los equipos"
              searchPlaceholder="Buscar equipo…"
              triggerClassName="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Operador</Label>
            <SearchableSelect
              value={filterOperator}
              onValueChange={setFilterOperator}
              options={[{ value: '', label: 'Todos los operadores' }, ...operatorOptions]}
              placeholder="Todos los operadores"
              searchPlaceholder="Buscar operador…"
              triggerClassName="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Fuel className="size-4" />}
          label="Litros consumidos"
          value={isLoading ? '—' : `${formatQuantity(kpis.litrosTotal, 0)} L`}
          sub="del período filtrado"
          loading={isLoading}
        />
        {canSeePrices && (
          <KpiCard
            icon={<DollarSign className="size-4" />}
            label="Gasto total"
            value={isLoading ? '—' : formatMoney(kpis.gastoTotal, 'MXN')}
            loading={isLoading}
          />
        )}
        <KpiCard
          icon={<Gauge className="size-4" />}
          label="Rendimiento promedio"
          value={
            isLoading
              ? '—'
              : kpis.rendimientoPromedio != null
              ? `${formatQuantity(kpis.rendimientoPromedio, 2)} L/h`
              : 'Sin datos'
          }
          loading={isLoading}
        />
        <KpiCard
          icon={<ClipboardList className="size-4" />}
          label="Cargas registradas"
          value={isLoading ? '—' : String(kpis.totalCargas)}
          loading={isLoading}
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-medium">Consumo por tractor</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <ConsumoBarChart data={barData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-medium">Tendencia de consumo</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <TendenciaAreaChart data={trendData} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Mobile cards ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col gap-2 md:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="flex flex-col gap-2 md:hidden">
          {filtered.map((line) => {
            const rendimiento = calcRendimiento(line)
            const avgEquip = line.equipment_id ? avgRenByEquip[line.equipment_id] : null
            const isAnomalo =
              rendimiento != null && avgEquip != null && rendimiento > avgEquip * 2

            return (
              <MobileDieselCard
                key={line.id}
                line={line}
                rendimiento={rendimiento}
                isAnomalo={isAnomalo}
                onCancel={setCancelTarget}
                canSeePrices={canSeePrices}
              />
            )
          })}
        </div>
      ) : null}

      {/* ── Desktop Table ─────────────────────────────────────────────────────── */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead>Tractor</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead className="w-24 text-right">Litros</TableHead>
              <TableHead className="w-36">Horómetro</TableHead>
              <TableHead className="w-36">Rendimiento</TableHead>
              {canSeePrices && <TableHead className="w-28 text-right">Costo MXN</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton canSeePrices={canSeePrices} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeePrices ? 8 : 7} className="p-0">
                  <EmptyState
                    icon={<Fuel className="size-5" />}
                    title={activeFilterCount > 0 ? 'Sin resultados' : 'Sin cargas de diésel'}
                    description={
                      activeFilterCount > 0
                        ? 'Prueba ajustando los filtros aplicados.'
                        : 'Registra la primera carga de diésel para comenzar.'
                    }
                    action={
                      activeFilterCount === 0
                        ? {
                            label: '+ Carga rápida',
                            onClick: () => navigate(`${basePath}/diesel/cargar`),
                          }
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((line) => {
                const rendimiento = calcRendimiento(line)
                const avgEquip = line.equipment_id ? avgRenByEquip[line.equipment_id] : null
                const isAnomalo =
                  rendimiento != null && avgEquip != null && rendimiento > avgEquip * 2

                return (
                  <TableRow key={line.id}>
                    {/* Fecha */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium tabular-nums">
                          {formatFechaCorta(line.movement.created_at)}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatHora(line.movement.created_at)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Tractor */}
                    <TableCell>
                      {line.equipment ? (
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            className="text-sm font-medium leading-tight hover:text-primary hover:underline text-left"
                            onClick={() => navigate(`${basePath}/diesel/tractor/${line.equipment!.id}`)}
                          >
                            {line.equipment.name}
                          </button>
                          <span className="font-mono text-xs text-muted-foreground">
                            {line.equipment.code}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Operador */}
                    <TableCell>
                      <span className="text-sm">
                        {line.operator?.full_name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </TableCell>

                    {/* Litros */}
                    <TableCell className="text-right">
                      <span className="text-sm font-bold font-mono tabular-nums">
                        {line.diesel_liters != null
                          ? `${formatQuantity(line.diesel_liters, 1)} L`
                          : '—'}
                      </span>
                    </TableCell>

                    {/* Horómetro */}
                    <TableCell>
                      {line.equipment_hours_before != null &&
                      line.equipment_hours_after != null ? (
                        <span className="text-xs tabular-nums text-muted-foreground font-mono">
                          {formatQuantity(line.equipment_hours_before, 1)} →{' '}
                          {formatQuantity(line.equipment_hours_after, 1)} h
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Rendimiento */}
                    <TableCell>
                      {rendimiento != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm tabular-nums font-mono">
                            {formatQuantity(rendimiento, 2)} L/h
                          </span>
                          {isAnomalo && <AnomalyBadge />}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Costo */}
                    {canSeePrices && (
                      <TableCell className="text-right">
                        {line.line_total_mxn != null ? (
                          <MoneyDisplay amount={line.line_total_mxn} currency="MXN" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Actions */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => navigate(`${basePath}/diesel/${line.movement_id}`)}
                          >
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setCancelTarget(line)}
                          >
                            <XCircle className="mr-2 size-3.5" />
                            Cancelar carga
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Footer summary ───────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} {filtered.length === 1 ? 'carga' : 'cargas'}
          {' · '}
          <span className="font-mono font-medium">
            {formatQuantity(filtered.reduce((s, l) => s + (l.diesel_liters ?? 0), 0), 1)} L
          </span>
          {canSeePrices && (
            <>
              {' · '}
              Total:{' '}
              <span className="font-mono font-medium">
                {formatMoney(filtered.reduce((s, l) => s + (l.line_total_mxn ?? 0), 0), 'MXN')}
              </span>
            </>
          )}
        </p>
      )}

      {/* ── Cancel confirmation dialog ────────────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta carga de diésel?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará el movimiento como cancelado. Esta acción no se puede deshacer y afectará
              los reportes de consumo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>No, conservar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelando…' : 'Sí, cancelar carga'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default DieselPage
