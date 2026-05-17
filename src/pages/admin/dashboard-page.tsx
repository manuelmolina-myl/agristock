import { lazy, Suspense, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  ArrowLeftRight,
  AlertTriangle,
  Fuel,
  TrendingDown,
  Activity,
  ClipboardList,
  TrendingUp,
} from 'lucide-react'

import { useBasePath } from '@/hooks/use-base-path'
import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  formatMoney,
  formatQuantity,
  formatRelativo,
  cn,
} from '@/lib/utils'
import type { AuditLog } from '@/lib/database.types'

// Lazy-load Recharts wrapper so the heavy chart chunk isn't pulled in until needed
const DailySpendAreaChart = lazy(
  () => import('@/components/charts/daily-spend-area-chart'),
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any


// ─── Hooks ───────────────────────────────────────────────────────────────────

function useValorInventario(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-valor-inventario', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('quantity, avg_cost_mxn')
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
        .select('diesel_liters, item:items!inner(is_diesel), movement:stock_movements!inner(organization_id, season_id, status, posted_at)')
        .eq('item.is_diesel', true)
        .eq('movement.organization_id', orgId)
        .eq('movement.season_id', seasonId)
        .eq('movement.status', 'posted')
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

function useSolicitudesPendientes(orgId: string | undefined) {
  return useQuery<number>({
    queryKey: ['kpi-solicitudes-pendientes', orgId],
    queryFn: async () => {
      const { count, error } = await db
        .from('solicitudes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pendiente')
      if (error) throw error
      return count ?? 0
    },
    enabled: !!orgId,
    refetchInterval: 30_000,
  })
}

// ─── Action label ─────────────────────────────────────────────────────────────

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
  if (action === 'INSERT') return 'bg-success/15 text-success'
  if (action === 'DELETE') return 'bg-destructive/15 text-destructive'
  return 'bg-usd/15 text-usd'
}

function userInitial(email: string | null) {
  if (!email) return '?'
  return email[0].toUpperCase()
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const { organization, activeSeason } = useAuth()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const orgId = organization?.id
  const seasonId = activeSeason?.id

  const valorQ = useValorInventario(orgId, seasonId)
  const movHoyQ = useMovimientosHoy(orgId)
  const bajoReordenQ = useBajoReorden(orgId, seasonId)
  const dieselQ = useDieselMes(orgId, seasonId)
  const gastoQ = useGastoDiario(orgId)
  const topQ = useTopConsumo(orgId, seasonId)
  const actividadQ = useActividadReciente(orgId)
  const solicitudesQ = useSolicitudesPendientes(orgId)

  const gastoTrend = useMemo(() => {
    if (!gastoQ.data?.length) return null
    const today = new Date()
    const dow = today.getDay()
    const thisWeekStart = new Date(today)
    thisWeekStart.setDate(today.getDate() - dow)
    thisWeekStart.setHours(0, 0, 0, 0)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(thisWeekStart.getDate() - 7)

    let thisWeek = 0
    let lastWeek = 0
    for (const { date, total } of gastoQ.data) {
      const d = new Date(date + 'T00:00:00')
      if (d >= thisWeekStart) thisWeek += total
      else if (d >= lastWeekStart) lastWeek += total
    }
    if (lastWeek === 0) return null
    const pct = ((thisWeek - lastWeek) / lastWeek) * 100
    return { thisWeek, lastWeek, pct }
  }, [gastoQ.data])

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      <PageHeader
        title="Dashboard"
        description="Resumen general de operaciones"
      />

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
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
              ? 'bg-warning/15 text-warning'
              : undefined
          }
          description="Requieren atención"
          isLoading={bajoReordenQ.isLoading}
          onClick={() => navigate(`${basePath}/inventario`)}
        />
        <KpiCard
          label="Diésel mes actual"
          value={`${formatQuantity(dieselQ.data ?? 0)} L`}
          icon={<Fuel className="size-4" />}
          description="Consumo acumulado"
          isLoading={dieselQ.isLoading}
          onClick={() => navigate(`${basePath}/diesel`)}
        />
        <KpiCard
          label="Solicitudes pendientes"
          value={String(solicitudesQ.data ?? 0)}
          icon={<ClipboardList className="size-4" />}
          iconClassName={
            (solicitudesQ.data ?? 0) > 0
              ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
              : undefined
          }
          description="Requieren revisión"
          isLoading={solicitudesQ.isLoading}
          onClick={() => navigate(`${basePath}/solicitudes`)}
        />
      </div>

      {/* ── Row 2 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Gasto diario chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Gasto diario — últimos 30 días
              </CardTitle>
              {gastoTrend && (
                <div className={cn(
                  'flex items-center gap-1 text-xs font-medium shrink-0',
                  gastoTrend.pct > 0 ? 'text-destructive' : 'text-success',
                )}>
                  {gastoTrend.pct > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {gastoTrend.pct > 0 ? '+' : ''}{gastoTrend.pct.toFixed(0)}% vs sem. ant.
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {gastoQ.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : !gastoQ.data?.length ? (
              <div className="flex h-44 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin movimientos registrados</p>
              </div>
            ) : (
              <Suspense fallback={<Skeleton className="h-44 w-full" />}>
                <DailySpendAreaChart
                  data={gastoQ.data}
                  gradientId="gastoGradientAdmin"
                />
              </Suspense>
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
                  {/* Avatar */}
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

export default AdminDashboardPage
