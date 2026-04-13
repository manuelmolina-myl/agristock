import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Fuel, TrendingDown, Gauge, Trophy, Search, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { StockMovementLine, Equipment, Employee, Item, StockMovement } from '@/lib/database.types'
import { formatFechaCorta, formatQuantity, formatMoney } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { MoneyDisplay } from '@/components/custom/money-display'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
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

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DieselPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const orgId = organization?.id ?? ''

  const [search, setSearch] = useState('')

  const { data: lines = [], isLoading, error } = useQuery<DieselLine[]>({
    queryKey: ['diesel-lines', orgId],
    queryFn: () => fetchDieselLines(orgId),
    enabled: !!orgId,
  })

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const thisMonth = lines.filter((l) => isThisMonth(l.movement.created_at))

    const litrosMes = thisMonth.reduce((s, l) => s + (l.diesel_liters ?? 0), 0)
    const gastoMes = thisMonth.reduce((s, l) => s + (l.line_total_mxn ?? 0), 0)

    // Rendimiento promedio global (L/hora)
    const rendimientos = lines.map(calcRendimiento).filter((r): r is number => r !== null)
    const rendimientoPromedio =
      rendimientos.length > 0
        ? rendimientos.reduce((s, r) => s + r, 0) / rendimientos.length
        : null

    // Top consumidor por equipo
    const litrosByEquip: Record<string, { name: string; liters: number }> = {}
    for (const l of lines) {
      if (l.equipment && l.diesel_liters) {
        const id = l.equipment.id
        if (!litrosByEquip[id]) {
          litrosByEquip[id] = { name: `${l.equipment.code} – ${l.equipment.name}`, liters: 0 }
        }
        litrosByEquip[id].liters += l.diesel_liters
      }
    }
    const top = Object.values(litrosByEquip).sort((a, b) => b.liters - a.liters)[0] ?? null

    return { litrosMes, gastoMes, rendimientoPromedio, top }
  }, [lines])

  // ── Per-equipment average rendimiento (for anomaly detection) ───────────────

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

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((l) => {
      const equip = l.equipment
      const op = l.operator
      return (
        equip?.code.toLowerCase().includes(q) ||
        equip?.name.toLowerCase().includes(q) ||
        op?.full_name.toLowerCase().includes(q)
      )
    })
  }, [lines, search])

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    toast.error('Error al cargar cargas de diésel')
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Diésel"
        description="Control de consumo de combustible"
        actions={
          <Button size="sm" onClick={() => navigate('/admin/diesel/nueva')}>
            + Carga rápida
          </Button>
        }
      />

      {/* ── KPI Row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Fuel className="size-4" />}
          label="Litros consumidos (mes)"
          value={isLoading ? '—' : `${formatQuantity(kpis.litrosMes, 0)} L`}
          loading={isLoading}
        />
        <KpiCard
          icon={<TrendingDown className="size-4" />}
          label="Gasto MXN (mes)"
          value={isLoading ? '—' : formatMoney(kpis.gastoMes, 'MXN')}
          loading={isLoading}
        />
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
          icon={<Trophy className="size-4" />}
          label="Top consumidor"
          value={isLoading ? '—' : kpis.top?.name ?? 'Sin datos'}
          sub={
            kpis.top != null ? `${formatQuantity(kpis.top.liters, 0)} L totales` : undefined
          }
          loading={isLoading}
        />
      </div>

      {/* ── Search ───────────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar tractor u operador…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* ── Mobile cards ─────────────────────────────────────────────────── */}
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
      ) : filtered.length === 0 ? null : (
        <div className="flex flex-col gap-2 md:hidden">
          {filtered.map((line) => {
            const rendimiento = calcRendimiento(line)
            const avgEquip = line.equipment_id ? avgRenByEquip[line.equipment_id] : null
            const isAnomalo =
              rendimiento != null && avgEquip != null && rendimiento > avgEquip * 2

            return (
              <div
                key={line.id}
                className="rounded-xl border border-border bg-card p-3 active:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {line.equipment ? (
                      <>
                        <p className="text-sm font-medium truncate">{line.equipment.name}</p>
                        <p className="text-xs text-muted-foreground">
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
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {rendimiento != null ? (
                      <>
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
                      </>
                    ) : (
                      <span>Sin rendimiento</span>
                    )}
                  </div>
                  <span>{formatFechaCorta(line.movement.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead>Tractor</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead className="w-24 text-right">Litros</TableHead>
              <TableHead className="w-36">Horómetro</TableHead>
              <TableHead className="w-32">Rendimiento</TableHead>
              <TableHead className="w-28 text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Fuel className="size-5" />}
                    title={search ? 'Sin resultados' : 'Sin cargas de diésel'}
                    description={
                      search
                        ? 'Prueba con otro tractor u operador.'
                        : 'Registra la primera carga de diésel para comenzar.'
                    }
                    action={
                      !search
                        ? {
                            label: '+ Carga rápida',
                            onClick: () => navigate('/admin/diesel/nueva'),
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
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatFechaCorta(line.movement.created_at)}
                    </TableCell>

                    <TableCell>
                      {line.equipment ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs text-muted-foreground">
                            {line.equipment.code}
                          </span>
                          <span className="text-sm font-medium leading-tight">
                            {line.equipment.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-sm">
                        {line.operator?.full_name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
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

                    <TableCell className="text-right">
                      {line.line_total_mxn != null ? (
                        <MoneyDisplay amount={line.line_total_mxn} currency="MXN" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
            {formatQuantity(
              filtered.reduce((s, l) => s + (l.diesel_liters ?? 0), 0),
              1
            )}{' '}
            L
          </span>
          {' · '}
          Total:{' '}
          <span className="font-mono font-medium">
            {formatMoney(
              filtered.reduce((s, l) => s + (l.line_total_mxn ?? 0), 0),
              'MXN'
            )}
          </span>
        </p>
      )}
    </div>
  )
}

export default DieselPage
