import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Fuel,
  Gauge,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useCanSeePrices } from '@/hooks/use-base-path'
import { useEquipment } from '@/hooks/use-supabase-query'
import type { StockMovementLine, Equipment, Employee, Item, StockMovement } from '@/lib/database.types'
import { formatQuantity, formatMoney, formatFechaCorta } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { EmptyState } from '@/components/custom/empty-state'
import { MoneyDisplay } from '@/components/custom/money-display'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DieselLine = StockMovementLine & {
  movement: StockMovement
  item: Item
  operator: Employee | null
}

// ─── Supabase alias ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchDieselLinesForTractor(tractorId: string): Promise<DieselLine[]> {
  const { data, error } = await db
    .from('stock_movement_lines')
    .select(
      '*, movement:stock_movements(*), item:items!inner(*), operator:employees!stock_movement_lines_operator_employee_id_fkey(*)'
    )
    .eq('item.is_diesel', true)
    .eq('equipment_id', tractorId)
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

function monthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return format(d, 'yyyy-MM')
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return format(d, 'MMM yy', { locale: es })
}

// ─── Historial Tab ─────────────────────────────────────────────────────────────

interface HistorialTabProps {
  lines: DieselLine[]
  avgRendimiento: number | null
  canSeePrices: boolean
}

function HistorialTab({ lines, avgRendimiento, canSeePrices }: HistorialTabProps) {
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Fuel className="size-5" />}
        title="Sin cargas registradas"
        description="Aún no hay cargas de diésel para este equipo."
      />
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {lines.map((line) => {
          const rendimiento = calcRendimiento(line)
          const isAnomalo =
            rendimiento != null &&
            avgRendimiento != null &&
            rendimiento > avgRendimiento * 2

          return (
            <Card key={line.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {line.operator?.full_name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFechaCorta(line.movement.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-lg font-bold font-mono tabular-nums leading-tight">
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
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  {line.equipment_hours_before != null &&
                  line.equipment_hours_after != null ? (
                    <span className="font-mono">
                      {formatQuantity(line.equipment_hours_before, 1)} →{' '}
                      {formatQuantity(line.equipment_hours_after, 1)} h
                    </span>
                  ) : (
                    <span>Sin horómetro</span>
                  )}
                  {rendimiento != null && (
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{formatQuantity(rendimiento, 2)} L/h</span>
                      {isAnomalo && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1 border-amber-400 text-amber-600 dark:text-amber-400 gap-0.5"
                        >
                          <AlertTriangle className="size-2.5" />
                          Alto
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead className="w-24 text-right">Litros</TableHead>
              <TableHead className="w-36">Horómetro</TableHead>
              <TableHead className="w-32">Rendimiento</TableHead>
              {canSeePrices && <TableHead className="w-28 text-right">Costo</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const rendimiento = calcRendimiento(line)
              const isAnomalo =
                rendimiento != null &&
                avgRendimiento != null &&
                rendimiento > avgRendimiento * 2

              return (
                <TableRow key={line.id}>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatFechaCorta(line.movement.created_at)}
                  </TableCell>

                  <TableCell>
                    <span className="text-sm">{line.operator?.full_name ?? '—'}</span>
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="text-sm font-mono tabular-nums">
                      {line.diesel_liters != null
                        ? `${formatQuantity(line.diesel_liters, 1)} L`
                        : '—'}
                    </span>
                  </TableCell>

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

                  <TableCell>
                    {rendimiento != null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm tabular-nums font-mono">
                          {formatQuantity(rendimiento, 2)} L/h
                        </span>
                        {isAnomalo && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1 border-amber-400 text-amber-600 dark:text-amber-400 gap-0.5"
                          >
                            <AlertTriangle className="size-2.5" />
                            Alto
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {canSeePrices && (
                    <TableCell className="text-right">
                      {line.line_total_mxn != null ? (
                        <MoneyDisplay amount={line.line_total_mxn} currency="MXN" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

// ─── Rendimiento Chart ────────────────────────────────────────────────────────

interface RendimientoTabProps {
  lines: DieselLine[]
  avgRendimiento: number | null
}

function RendimientoTab({ lines, avgRendimiento }: RendimientoTabProps) {
  const chartData = useMemo(() => {
    return lines
      .filter((l) => calcRendimiento(l) !== null)
      .map((l) => {
        const r = calcRendimiento(l)!
        const avg = avgRendimiento ?? r
        return {
          fecha: formatFechaCorta(l.movement.created_at),
          rendimiento: parseFloat(r.toFixed(3)),
          anomalo: r > avg * 2,
        }
      })
      .reverse()
  }, [lines, avgRendimiento])

  if (chartData.length === 0) {
    return (
      <EmptyState
        icon={<Gauge className="size-5" />}
        title="Sin datos de rendimiento"
        description="Se necesita horómetro antes y después para calcular rendimiento."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-5 pb-2 px-4">
          <p className="text-sm font-medium mb-4">Rendimiento por carga (L/h)</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                width={45}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={((v: number) => [`${formatQuantity(v, 2)} L/h`, 'Rendimiento']) as any}
              />
              {avgRendimiento != null && (
                <ReferenceLine
                  y={avgRendimiento}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="6 3"
                  label={{
                    value: `Prom. ${formatQuantity(avgRendimiento, 2)}`,
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'hsl(var(--muted-foreground))',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="rendimiento"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props
                  if (payload.anomalo) {
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill="hsl(43 96% 56%)"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    )
                  }
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="hsl(var(--primary))"
                      stroke="white"
                      strokeWidth={1}
                    />
                  )
                }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Los puntos en <span className="text-amber-500 font-medium">amarillo</span> indican consumo anómalo (más del doble del promedio).
      </p>
    </div>
  )
}

// ─── Consumo Mensual Chart ────────────────────────────────────────────────────

interface ConsumoMensualTabProps {
  lines: DieselLine[]
  canSeePrices: boolean
}

function ConsumoMensualTab({ lines, canSeePrices }: ConsumoMensualTabProps) {
  const chartData = useMemo(() => {
    const byMonth: Record<string, { litros: number; costo: number }> = {}
    for (const l of lines) {
      const key = monthKey(l.movement.created_at)
      if (!byMonth[key]) byMonth[key] = { litros: 0, costo: 0 }
      byMonth[key].litros += l.diesel_liters ?? 0
      byMonth[key].costo += l.line_total_mxn ?? 0
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        mes: monthLabel(key),
        litros: parseFloat(v.litros.toFixed(1)),
        costo: parseFloat(v.costo.toFixed(2)),
      }))
  }, [lines])

  if (chartData.length === 0) {
    return (
      <EmptyState
        icon={<Fuel className="size-5" />}
        title="Sin datos mensuales"
        description="Aún no hay suficientes registros para mostrar el consumo mensual."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-5 pb-2 px-4">
          <p className="text-sm font-medium mb-4">Consumo mensual (litros)</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                width={45}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={((v: number, name: string) => {
                  if (name === 'litros') return [`${formatQuantity(v, 1)} L`, 'Litros']
                  return [formatMoney(v, 'MXN'), 'Costo']
                }) as any}
              />
              <Bar dataKey="litros" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly summary table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Litros</TableHead>
              {canSeePrices && <TableHead className="text-right">Costo total</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {chartData.map((row) => (
              <TableRow key={row.mes}>
                <TableCell className="font-medium capitalize">{row.mes}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatQuantity(row.litros, 1)} L
                </TableCell>
                {canSeePrices && (
                  <TableCell className="text-right">
                    <MoneyDisplay amount={row.costo} currency="MXN" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── Equipment type label ─────────────────────────────────────────────────────

function equipmentTypeLabel(type: Equipment['type']): string {
  const labels: Record<Equipment['type'], string> = {
    tractor: 'Tractor',
    vehicle: 'Vehículo',
    implement: 'Implemento',
    pump: 'Bomba',
    other: 'Otro',
  }
  return labels[type] ?? type
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DieselTractorPage() {
  const { id: tractorId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canSeePrices = useCanSeePrices()
  useAuth()

  const [tab, setTab] = useState('historial')

  // Equipment data
  const { data: allEquipment = [], isLoading: loadingEquipment } = useEquipment()
  const tractor = useMemo(
    () => allEquipment.find((e) => e.id === tractorId) ?? null,
    [allEquipment, tractorId]
  )

  // Diesel lines for this tractor
  const { data: lines = [], isLoading: loadingLines } = useQuery<DieselLine[]>({
    queryKey: ['diesel-lines-tractor', tractorId],
    queryFn: () => fetchDieselLinesForTractor(tractorId!),
    enabled: !!tractorId,
  })

  const isLoading = loadingEquipment || loadingLines

  // ── Computed KPIs ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalLitros = lines.reduce((s, l) => s + (l.diesel_liters ?? 0), 0)
    const totalGasto = lines.reduce((s, l) => s + (l.line_total_mxn ?? 0), 0)
    const rendimientos = lines.map(calcRendimiento).filter((r): r is number => r !== null)
    const rendimientoPromedio =
      rendimientos.length > 0
        ? rendimientos.reduce((s, r) => s + r, 0) / rendimientos.length
        : null
    return { totalLitros, totalGasto, rendimientoPromedio }
  }, [lines])

  // ── Back route ───────────────────────────────────────────────────────────

  // Detect current role prefix from path
  const pathPrefix = window.location.pathname.split('/')[1] ?? 'admin'

  function goBack() {
    navigate(`/${pathPrefix}/diesel`)
  }

  // ── Loading / not found ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <Skeleton className="h-3.5 w-24 mb-2" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (!tractor) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <PageHeader
          title="Equipo no encontrado"
          actions={
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="mr-1.5 size-3.5" />
              Diésel
            </Button>
          }
        />
        <EmptyState
          icon={<Fuel className="size-5" />}
          title="Equipo no encontrado"
          description="El equipo que buscas no existe o fue eliminado."
          action={{ label: '← Volver', onClick: goBack }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        title={tractor.name}
        description={
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="font-mono text-xs">
              {tractor.code}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {equipmentTypeLabel(tractor.type)}
            </Badge>
            {tractor.brand && (
              <span className="text-sm text-muted-foreground">
                {tractor.brand}
                {tractor.model ? ` ${tractor.model}` : ''}
              </span>
            )}
            {tractor.current_hours != null && (
              <span className="text-sm text-muted-foreground font-mono">
                {formatQuantity(tractor.current_hours, 1)} h
              </span>
            )}
          </div>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="mr-1.5 size-3.5" />
            Diésel
          </Button>
        }
      />

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Fuel className="size-4" />}
          label="Total litros (histórico)"
          value={`${formatQuantity(kpis.totalLitros, 0)} L`}
          sub={`${lines.length} ${lines.length === 1 ? 'carga' : 'cargas'}`}
        />
        {canSeePrices && (
          <KpiCard
            icon={<TrendingDown className="size-4" />}
            label="Gasto total"
            value={formatMoney(kpis.totalGasto, 'MXN')}
          />
        )}
        <KpiCard
          icon={<Gauge className="size-4" />}
          label="Rendimiento promedio"
          value={
            kpis.rendimientoPromedio != null
              ? `${formatQuantity(kpis.rendimientoPromedio, 2)} L/h`
              : 'Sin datos'
          }
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="historial" className="flex-1 sm:flex-none">
            Historial
          </TabsTrigger>
          <TabsTrigger value="rendimiento" className="flex-1 sm:flex-none">
            Rendimiento
          </TabsTrigger>
          <TabsTrigger value="mensual" className="flex-1 sm:flex-none">
            Consumo mensual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historial" className="mt-4">
          <HistorialTab lines={lines} avgRendimiento={kpis.rendimientoPromedio} canSeePrices={canSeePrices} />
        </TabsContent>

        <TabsContent value="rendimiento" className="mt-4">
          <RendimientoTab lines={lines} avgRendimiento={kpis.rendimientoPromedio} />
        </TabsContent>

        <TabsContent value="mensual" className="mt-4">
          <ConsumoMensualTab lines={lines} canSeePrices={canSeePrices} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default DieselTractorPage
