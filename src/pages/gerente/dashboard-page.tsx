/**
 * Gerente dashboard — re-uses the same logic as AdminDashboardPage
 * but with a different title/description.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  ArrowLeftRight,
  AlertTriangle,
  Fuel,
  TrendingDown,
  Activity,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { PageHeader } from '@/components/custom/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  formatMoney,
  formatQuantity,
  formatRelativo,
  formatFechaCorta,
  cn,
} from '@/lib/utils'
import type { AuditLog } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  description?: string
  iconClassName?: string
  isLoading?: boolean
}

function KpiCard({
  label,
  value,
  icon,
  description,
  iconClassName,
  isLoading,
}: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
              iconClassName,
            )}
          >
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-28 mb-1" />
            <Skeleton className="h-3 w-20" />
          </>
        ) : (
          <>
            <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useValorInventario(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-valor-inventario', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('quantity, avg_cost_mxn')
        .eq('organization_id', orgId)
        .eq('season_id', seasonId)
      if (error) throw error
      return (data as Array<{ quantity: number; avg_cost_mxn: number }>).reduce(
        (sum, row) => sum + row.quantity * row.avg_cost_mxn,
        0,
      )
    },
    enabled: !!orgId && !!seasonId,
  })
}

function useMovimientosHoy(orgId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-movimientos-hoy', orgId],
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count, error } = await db
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', today.toISOString())
      if (error) throw error
      return count ?? 0
    },
    enabled: !!orgId,
  })
}

function useBajoReorden(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-bajo-reorden', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('quantity, item:items!inner(reorder_point)')
        .eq('organization_id', orgId)
        .eq('season_id', seasonId)
        .gt('item.reorder_point', 0)
      if (error) throw error
      const rows = data as Array<{
        quantity: number
        item: { reorder_point: number }
      }>
      return rows.filter((r) => r.quantity < r.item.reorder_point).length
    },
    enabled: !!orgId && !!seasonId,
  })
}

function useDieselMes(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-diesel-mes', orgId, seasonId],
    queryFn: async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const { data, error } = await db
        .from('stock_movement_lines')
        .select(
          'diesel_liters, movement:stock_movements!inner(organization_id, season_id, status, posted_at, item:items!inner(is_diesel))',
        )
        .eq('movement.organization_id', orgId)
        .eq('movement.season_id', seasonId)
        .eq('movement.status', 'posted')
        .eq('movement.item.is_diesel', true)
        .gte('movement.posted_at', startOfMonth.toISOString())
      if (error) throw error
      const rows = data as Array<{ diesel_liters: number | null }>
      return rows.reduce((sum, r) => sum + (r.diesel_liters ?? 0), 0)
    },
    enabled: !!orgId && !!seasonId,
  })
}

interface DailySpend {
  date: string
  total: number
}

function useGastoDiario(orgId: string | undefined) {
  return useQuery<DailySpend[]>({
    queryKey: ['kpi-gasto-diario', orgId],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      since.setHours(0, 0, 0, 0)
      const { data, error } = await db
        .from('stock_movements')
        .select('posted_at, total_mxn')
        .eq('organization_id', orgId)
        .eq('status', 'posted')
        .gte('posted_at', since.toISOString())
        .not('total_mxn', 'is', null)
      if (error) throw error
      const rows = data as Array<{ posted_at: string; total_mxn: number }>
      const byDate: Record<string, number> = {}
      for (const r of rows) {
        const day = r.posted_at.slice(0, 10)
        byDate[day] = (byDate[day] ?? 0) + r.total_mxn
      }
      return Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }))
    },
    enabled: !!orgId,
  })
}

interface TopItem {
  item_id: string
  sku: string
  name: string
  unit_code: string
  total_qty: number
}

function useTopConsumo(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<TopItem[]>({
    queryKey: ['kpi-top-consumo', orgId, seasonId],
    queryFn: async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const { data, error } = await db
        .from('stock_movement_lines')
        .select(
          'item_id, quantity, item:items!inner(sku, name, unit:units(code)), movement:stock_movements!inner(organization_id, season_id, movement_type, status)',
        )
        .eq('movement.organization_id', orgId)
        .eq('movement.season_id', seasonId)
        .eq('movement.status', 'posted')
        .like('movement.movement_type', 'exit_%')
        .gte('movement.posted_at', startOfMonth.toISOString())
      if (error) throw error
      const rows = data as Array<{
        item_id: string
        quantity: number
        item: { sku: string; name: string; unit: { code: string } | null }
      }>
      const agg: Record<
        string,
        { sku: string; name: string; unit_code: string; total_qty: number }
      > = {}
      for (const r of rows) {
        if (!agg[r.item_id]) {
          agg[r.item_id] = {
            sku: r.item.sku,
            name: r.item.name,
            unit_code: r.item.unit?.code ?? '',
            total_qty: 0,
          }
        }
        agg[r.item_id].total_qty += r.quantity
      }
      return Object.entries(agg)
        .map(([item_id, v]) => ({ item_id, ...v }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 10)
    },
    enabled: !!orgId && !!seasonId,
  })
}

function useActividadReciente(orgId: string | undefined) {
  return useQuery<AuditLog[]>({
    queryKey: ['audit-log-recent', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('audit_log')
        .select('*')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(15)
      if (error) throw error
      return data as AuditLog[]
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actionLabel(action: string) {
  const map: Record<string, string> = {
    INSERT: 'Creó',
    UPDATE: 'Actualizó',
    DELETE: 'Eliminó',
  }
  return map[action] ?? action
}

function entityLabel(entity: string) {
  const map: Record<string, string> = {
    items: 'artículo',
    stock_movements: 'movimiento',
    stock_movement_lines: 'línea',
    warehouses: 'almacén',
    suppliers: 'proveedor',
    categories: 'categoría',
    seasons: 'temporada',
    fx_rates: 'tipo de cambio',
    adjustment_reasons: 'motivo de ajuste',
    units: 'unidad',
    equipment: 'equipo',
    employees: 'empleado',
    crops_lots: 'lote',
  }
  return map[entity] ?? entity
}

function actionBadgeColor(action: string) {
  if (action === 'INSERT') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (action === 'DELETE') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
}

function userInitial(email: string | null) {
  if (!email) return '?'
  return email[0].toUpperCase()
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">
        {formatMoney(payload[0].value)}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function GerenteDashboardPage() {
  const { organization, activeSeason } = useAuth()
  const orgId = organization?.id
  const seasonId = activeSeason?.id

  const valorQ = useValorInventario(orgId, seasonId)
  const movHoyQ = useMovimientosHoy(orgId)
  const bajoReordenQ = useBajoReorden(orgId, seasonId)
  const dieselQ = useDieselMes(orgId, seasonId)
  const gastoQ = useGastoDiario(orgId)
  const topQ = useTopConsumo(orgId, seasonId)
  const actividadQ = useActividadReciente(orgId)

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Panel de Control"
        description="Resumen general de operaciones y finanzas"
      />

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor de inventario"
          value={formatMoney(valorQ.data ?? 0)}
          icon={<DollarSign className="size-4" />}
          description="MXN · temporada activa"
          isLoading={valorQ.isLoading}
        />
        <KpiCard
          label="Movimientos hoy"
          value={String(movHoyQ.data ?? 0)}
          icon={<ArrowLeftRight className="size-4" />}
          description="Entradas y salidas"
          isLoading={movHoyQ.isLoading}
        />
        <KpiCard
          label="Bajo punto de reorden"
          value={`${bajoReordenQ.data ?? 0} artículos`}
          icon={<AlertTriangle className="size-4" />}
          iconClassName={
            (bajoReordenQ.data ?? 0) > 0
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : undefined
          }
          description="Requieren atención"
          isLoading={bajoReordenQ.isLoading}
        />
        <KpiCard
          label="Diésel mes actual"
          value={`${formatQuantity(dieselQ.data ?? 0)} L`}
          icon={<Fuel className="size-4" />}
          description="Consumo acumulado"
          isLoading={dieselQ.isLoading}
        />
      </div>

      {/* ── Row 2 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Gasto diario chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gasto diario — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gastoQ.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : !gastoQ.data?.length ? (
              <div className="flex h-52 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin movimientos registrados</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart
                  data={gastoQ.data}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gastoGradientGerente" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v: string) => formatFechaCorta(v)}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gastoGradientGerente)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 10 consumo */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="size-4" />
              Top 10 más consumidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topQ.isLoading ? (
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !topQ.data?.length ? (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin salidas este mes</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {topQ.data.map((item, i) => (
                  <div
                    key={item.item_id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate text-foreground leading-tight">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                      </div>
                    </div>
                    <span className="shrink-0 ml-2 tabular-nums text-muted-foreground">
                      {formatQuantity(item.total_qty)} {item.unit_code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Actividad reciente ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="size-4" />
            Actividad reciente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {actividadQ.isLoading ? (
            <div className="px-4 pb-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : !actividadQ.data?.length ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">Sin actividad registrada</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {actividadQ.data.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground uppercase select-none">
                    {userInitial(entry.user_email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                          actionBadgeColor(entry.action),
                        )}
                      >
                        {actionLabel(entry.action)}
                      </span>
                      <span className="text-sm text-foreground">
                        {entityLabel(entry.entity_type)}
                      </span>
                      {entry.entity_id && (
                        <span className="text-xs text-muted-foreground font-mono">
                          #{entry.entity_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.user_email ?? 'Sistema'} ·{' '}
                      {formatRelativo(entry.occurred_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default GerenteDashboardPage
