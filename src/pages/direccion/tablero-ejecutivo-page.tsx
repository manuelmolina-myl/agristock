/**
 * Tablero Ejecutivo — vista cross-módulo en tiempo real para Dirección.
 *
 * Consume cuatro RPCs (migración 062): executive_summary,
 * executive_monthly_spend, executive_cash_flow_30d y
 * executive_spend_by_category. Refresca cada 30s mediante TanStack Query y
 * muestra un indicador "Última actualización: hace Xs" que se actualiza
 * cada segundo. Estrategia: refetchInterval 30 000 ms — sin Supabase
 * Realtime (suficientemente fresco para una vista de director).
 *
 * Layout:
 *   A. Hero header
 *   B. Critical alerts ribbon (si hay)
 *   C. KPI hero row (6 cards)
 *   D. Charts row 1: gasto mensual stacked + cash flow 30 días
 *   E. Charts row 2: top categorías donut + matriz KPIs mantto
 *   F. Strip horizontal de tanques de diésel
 *   G. Acciones rápidas
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  AlertTriangle,
  Wifi,
  RefreshCw,
  DollarSign,
  Warehouse,
  CreditCard,
  Wrench,
  Fuel,
  Bell,
  ArrowRight,
  Activity,
  Timer,
  BadgeCheck,
  ClipboardList,
  FileBarChart,
  ShoppingCart,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatMoney, formatQuantity, cn } from '@/lib/utils'

// ─── Lazy charts (split Recharts into its own chunks) ───────────────────────
const ExecMonthlySpendStackedBarChart = lazy(
  () => import('@/components/charts/exec-monthly-spend-stacked-bar-chart'),
)
const ExecCashFlowLineChart = lazy(
  () => import('@/components/charts/exec-cash-flow-line-chart'),
)
const ExecSpendByCategoryDonutChart = lazy(
  () => import('@/components/charts/exec-spend-by-category-donut-chart'),
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ─────────────────────────────────────────────────────────────────

interface ExecutiveSummary {
  inventory_value_mxn: number
  low_stock_count: number
  spend_month_mxn: number
  spend_last_month_mxn: number
  pending_requisitions: number
  pending_signatures: number
  ap_overdue_mxn: number
  ap_due_7d_mxn: number
  open_wos: number
  overdue_wos: number
  pm_compliance_pct: number
  avg_mttr_hours: number
  mantto_cost_month_mxn: number
  open_service_requests: number
  total_diesel_inventory_l: number
  tanks_low_count: number
  diesel_consumed_month_l: number
  diesel_cost_month_mxn: number
  active_critical_alerts: number
}

interface MonthlySpendRow {
  month_start: string
  spend_compras_mxn: number
  spend_mantto_mxn: number
  spend_diesel_mxn: number
  total_mxn: number
}

interface CashFlowRow {
  day: string
  due_amount_mxn: number
  invoice_count: number
}

interface SpendByCategoryRow {
  category_name: string
  total_mxn: number
}

interface TankRow {
  id: string
  code: string
  name: string
  type: 'stationary' | 'mobile'
  capacity_liters: number
  current_level_liters: number
  alert_threshold_pct: number
  fill_pct: number
  level_status: 'low' | 'medium' | 'ok'
}

// ─── RPC hooks (refetchInterval 30 s) ──────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000

function useExecutiveSummary(enabled: boolean) {
  return useQuery<ExecutiveSummary | null>({
    queryKey: ['exec-summary'],
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('executive_summary')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row ?? null) as ExecutiveSummary | null
    },
  })
}

function useMonthlySpend(enabled: boolean) {
  return useQuery<MonthlySpendRow[]>({
    queryKey: ['exec-monthly-spend'],
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('executive_monthly_spend')
      if (error) throw error
      return (data ?? []) as MonthlySpendRow[]
    },
  })
}

function useCashFlow30d(enabled: boolean) {
  return useQuery<CashFlowRow[]>({
    queryKey: ['exec-cash-flow-30d'],
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('executive_cash_flow_30d')
      if (error) throw error
      return (data ?? []) as CashFlowRow[]
    },
  })
}

function useSpendByCategory(enabled: boolean) {
  return useQuery<SpendByCategoryRow[]>({
    queryKey: ['exec-spend-by-category'],
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('executive_spend_by_category')
      if (error) throw error
      return (data ?? []) as SpendByCategoryRow[]
    },
  })
}

function useTanks(orgId: string | undefined) {
  return useQuery<TankRow[]>({
    queryKey: ['exec-tanks', orgId],
    enabled: !!orgId,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await db
        .from('diesel_tank_balance')
        .select(
          'id, code, name, type, capacity_liters, current_level_liters, alert_threshold_pct, fill_pct, level_status',
        )
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('code', { ascending: true })
      if (error) throw error
      return (data ?? []) as TankRow[]
    },
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthAbbr(iso: string): string {
  const d = new Date(iso)
  return MONTH_ABBR[d.getMonth()] ?? ''
}

function pctChange(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TableroEjecutivoPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const orgId = organization?.id

  const summaryQ = useExecutiveSummary(!!orgId)
  const monthlyQ = useMonthlySpend(!!orgId)
  const cashFlowQ = useCashFlow30d(!!orgId)
  const spendCatQ = useSpendByCategory(!!orgId)
  const tanksQ = useTanks(orgId)

  // Última actualización: el timestamp más reciente entre las queries
  const lastUpdatedAt = useMemo(() => {
    const times = [
      summaryQ.dataUpdatedAt,
      monthlyQ.dataUpdatedAt,
      cashFlowQ.dataUpdatedAt,
      spendCatQ.dataUpdatedAt,
      tanksQ.dataUpdatedAt,
    ].filter((t) => t && t > 0)
    if (times.length === 0) return null
    return Math.max(...times)
  }, [
    summaryQ.dataUpdatedAt,
    monthlyQ.dataUpdatedAt,
    cashFlowQ.dataUpdatedAt,
    spendCatQ.dataUpdatedAt,
    tanksQ.dataUpdatedAt,
  ])

  // Tick cada segundo para refrescar el label "hace X segundos"
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const summary = summaryQ.data ?? null
  const isInitialLoad = summaryQ.isLoading

  // Datos para gráficos
  const monthlyChartData = useMemo(() => {
    const rows = monthlyQ.data ?? []
    return rows.map((r) => ({
      month: monthAbbr(r.month_start),
      compras: Number(r.spend_compras_mxn) || 0,
      mantto: Number(r.spend_mantto_mxn) || 0,
      diesel: Number(r.spend_diesel_mxn) || 0,
      total: Number(r.total_mxn) || 0,
    }))
  }, [monthlyQ.data])

  const cashFlowData = useMemo(() => {
    const rows = cashFlowQ.data ?? []
    return rows.map((r) => ({
      day: r.day,
      due_amount_mxn: Number(r.due_amount_mxn) || 0,
      invoice_count: Number(r.invoice_count) || 0,
    }))
  }, [cashFlowQ.data])

  const categoryData = useMemo(() => {
    const rows = spendCatQ.data ?? []
    return rows
      .map((r) => ({
        name: r.category_name || 'Sin categoría',
        value: Number(r.total_mxn) || 0,
      }))
      .filter((r) => r.value > 0)
  }, [spendCatQ.data])

  // Tendencia gasto del mes vs anterior
  const spendTrend = useMemo(() => {
    if (!summary) return null
    return pctChange(summary.spend_month_mxn ?? 0, summary.spend_last_month_mxn ?? 0)
  }, [summary])

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      {/* ─── A. Hero header ─── */}
      <PageHeader
        title="Tablero Ejecutivo"
        description="Vista cross-módulo en tiempo real"
        actions={<LastUpdatedIndicator at={lastUpdatedAt} isFetching={summaryQ.isFetching} />}
      />

      {/* ─── B. Critical alerts ribbon ─── */}
      {summary && summary.active_critical_alerts > 0 && (
        <CriticalAlertsRibbon
          total={summary.active_critical_alerts}
          requisitions={summary.pending_requisitions}
          signatures={summary.pending_signatures}
          overdueWos={summary.overdue_wos}
          tanksLow={summary.tanks_low_count}
          onClick={() => navigate('/notificaciones')}
        />
      )}

      {/* ─── C. KPI hero row (6) ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={DollarSign}
          label="Gasto del mes"
          value={formatMoney(summary?.spend_month_mxn ?? 0)}
          isLoading={isInitialLoad}
          tone={
            spendTrend === null
              ? 'default'
              : spendTrend > 0
              ? 'warning'
              : 'success'
          }
          hint={
            spendTrend === null
              ? 'Sin comparable previo'
              : `${spendTrend > 0 ? '+' : ''}${spendTrend.toFixed(0)}% vs mes anterior`
          }
        />
        <KpiCard
          icon={Warehouse}
          label="Inventario valuado"
          value={formatMoney(summary?.inventory_value_mxn ?? 0)}
          isLoading={isInitialLoad}
          tone={(summary?.low_stock_count ?? 0) > 0 ? 'warning' : 'default'}
          hint={
            (summary?.low_stock_count ?? 0) > 0
              ? `${summary?.low_stock_count} ítems bajo reorden`
              : 'Niveles en orden'
          }
          onClick={() => navigate('/almacen/inventario')}
        />
        <KpiCard
          icon={CreditCard}
          label="CxP vencidas"
          value={formatMoney(summary?.ap_overdue_mxn ?? 0)}
          isLoading={isInitialLoad}
          tone={(summary?.ap_overdue_mxn ?? 0) > 0 ? 'critical' : 'success'}
          hint={
            (summary?.ap_due_7d_mxn ?? 0) > 0
              ? `${formatMoney(summary?.ap_due_7d_mxn ?? 0)} vencen en 7 días`
              : 'Sin vencimientos próximos'
          }
          onClick={() => navigate('/compras/pagos')}
        />
        <KpiCard
          icon={Wrench}
          label="OTs abiertas"
          value={String(summary?.open_wos ?? 0)}
          isLoading={isInitialLoad}
          tone={(summary?.overdue_wos ?? 0) > 0 ? 'warning' : 'default'}
          hint={
            (summary?.overdue_wos ?? 0) > 0
              ? `${summary?.overdue_wos} vencidas`
              : 'Ninguna vencida'
          }
          onClick={() => navigate('/mantenimiento/ordenes')}
        />
        <KpiCard
          icon={Fuel}
          label="Diésel disponible"
          value={`${formatQuantity(summary?.total_diesel_inventory_l ?? 0, 0)} L`}
          isLoading={isInitialLoad}
          tone={(summary?.tanks_low_count ?? 0) > 0 ? 'critical' : 'info'}
          hint={
            (summary?.tanks_low_count ?? 0) > 0
              ? `${summary?.tanks_low_count} tanques bajo nivel`
              : 'Todos los tanques OK'
          }
          onClick={() => navigate('/almacen/tanques')}
        />
        <KpiCard
          icon={Bell}
          label="Alertas críticas"
          value={String(summary?.active_critical_alerts ?? 0)}
          isLoading={isInitialLoad}
          tone={(summary?.active_critical_alerts ?? 0) > 0 ? 'critical' : 'success'}
          hint={
            (summary?.active_critical_alerts ?? 0) > 0
              ? 'Ver detalle'
              : 'Sin alertas activas'
          }
          onClick={() => navigate('/notificaciones')}
        />
      </div>

      {/* ─── D. Charts row 1 ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileBarChart className="size-4" />
              Gasto mensual — últimos 6 meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyQ.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : monthlyChartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Sin datos
              </div>
            ) : (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ExecMonthlySpendStackedBarChart data={monthlyChartData} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="size-4" />
              Pagos por vencer — próximos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlowQ.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ExecCashFlowLineChart data={cashFlowData} />
              </Suspense>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── E. Charts row 2 ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="size-4" />
              Top categorías — mes actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spendCatQ.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ExecSpendByCategoryDonutChart data={categoryData} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <ManttoKpiMatrix summary={summary} isLoading={isInitialLoad} />
      </div>

      {/* ─── F. Tanques strip ─── */}
      <TanksStrip
        tanks={tanksQ.data ?? []}
        isLoading={tanksQ.isLoading}
        onTankClick={(id) => navigate(`/almacen/tanques/${id}`)}
      />

      {/* ─── G. Acciones rápidas ─── */}
      <QuickActionsRow navigate={navigate} />
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function LastUpdatedIndicator({
  at,
  isFetching,
}: {
  at: number | null
  isFetching: boolean
}) {
  const label = useMemo(() => {
    if (!at) return 'Cargando…'
    return formatDistanceToNow(new Date(at), { addSuffix: true, locale: es })
  }, [at])

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
      {isFetching ? (
        <RefreshCw className="size-3.5 text-primary animate-spin" strokeWidth={2} />
      ) : (
        <Wifi className="size-3.5 text-success" strokeWidth={2} />
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          Última actualización
        </span>
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
    </div>
  )
}

function CriticalAlertsRibbon({
  total,
  requisitions,
  signatures,
  overdueWos,
  tanksLow,
  onClick,
}: {
  total: number
  requisitions: number
  signatures: number
  overdueWos: number
  tanksLow: number
  onClick: () => void
}) {
  const parts: string[] = []
  if (requisitions > 0) parts.push(`${requisitions} requisiciones`)
  if (signatures > 0) parts.push(`${signatures} firmas`)
  if (overdueWos > 0) parts.push(`${overdueWos} OTs vencidas`)
  if (tanksLow > 0) parts.push(`${tanksLow} tanques bajos`)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border border-destructive/40',
        'bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10',
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
        <AlertTriangle className="size-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">
          {total} {total === 1 ? 'alerta crítica' : 'alertas críticas'}
        </p>
        {parts.length > 0 && (
          <p className="text-xs text-destructive/80 mt-0.5 truncate">
            {parts.join(' · ')}
          </p>
        )}
      </div>
      <ArrowRight className="size-4 shrink-0 text-destructive/60 group-hover:text-destructive transition-colors" />
    </button>
  )
}

function ManttoKpiMatrix({
  summary,
  isLoading,
}: {
  summary: ExecutiveSummary | null
  isLoading: boolean
}) {
  const pmCompliance = Number(summary?.pm_compliance_pct ?? 0)
  const mttr = Number(summary?.avg_mttr_hours ?? 0)
  const cost = Number(summary?.mantto_cost_month_mxn ?? 0)
  const reqs = Number(summary?.open_service_requests ?? 0)

  const pmTone =
    pmCompliance >= 90 ? 'success' : pmCompliance >= 70 ? 'warning' : 'critical'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Wrench className="size-4" />
          Mantenimiento — pulso del mes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <MiniKpi
            icon={BadgeCheck}
            label="Cumplimiento PM"
            value={`${pmCompliance.toFixed(0)}%`}
            tone={pmTone as 'success' | 'warning' | 'critical'}
            isLoading={isLoading}
          />
          <MiniKpi
            icon={Timer}
            label="MTTR promedio"
            value={mttr > 0 ? `${mttr.toFixed(1)} h` : '—'}
            tone="default"
            isLoading={isLoading}
          />
          <MiniKpi
            icon={DollarSign}
            label="Costo del mes"
            value={formatMoney(cost)}
            tone="default"
            isLoading={isLoading}
          />
          <MiniKpi
            icon={ClipboardList}
            label="Solicitudes abiertas"
            value={String(reqs)}
            tone={reqs > 3 ? 'warning' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function MiniKpi({
  icon: Icon,
  label,
  value,
  tone,
  isLoading,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: 'default' | 'success' | 'warning' | 'critical'
  isLoading: boolean
}) {
  const toneStyles: Record<typeof tone, { badge: string; iconBg: string; iconFg: string }> = {
    default:  { badge: 'bg-muted text-muted-foreground',          iconBg: 'bg-muted',           iconFg: 'text-muted-foreground' },
    success:  { badge: 'bg-success/15 text-success',              iconBg: 'bg-success/15',      iconFg: 'text-success' },
    warning:  { badge: 'bg-warning/15 text-warning',              iconBg: 'bg-warning/15',      iconFg: 'text-warning' },
    critical: { badge: 'bg-destructive/15 text-destructive',      iconBg: 'bg-destructive/15', iconFg: 'text-destructive' },
  }
  const t = toneStyles[tone]
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
      <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', t.iconBg, t.iconFg)}>
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
          {label}
        </p>
        {isLoading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className="text-lg font-semibold tabular-nums text-foreground mt-0.5">
            <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-base', t.badge)}>
              {value}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

function TanksStrip({
  tanks,
  isLoading,
  onTankClick,
}: {
  tanks: TankRow[]
  isLoading: boolean
  onTankClick: (id: string) => void
}) {
  if (!isLoading && tanks.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Fuel className="size-4" />
          Tanques de combustible
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-64 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {tanks.map((tank) => (
              <TankCard key={tank.id} tank={tank} onClick={() => onTankClick(tank.id)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TankCard({ tank, onClick }: { tank: TankRow; onClick: () => void }) {
  const fillPct = Math.max(0, Math.min(100, Number(tank.fill_pct ?? 0)))
  const isLow = tank.level_status === 'low'
  const isMed = tank.level_status === 'medium'
  const barColor = isLow ? 'bg-destructive' : isMed ? 'bg-warning' : 'bg-success'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group shrink-0 w-64 overflow-hidden rounded-lg border bg-card text-left transition-all',
        isLow ? 'border-destructive/40' : 'border-border hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono uppercase text-muted-foreground">{tank.code}</p>
          <p className="text-sm font-semibold text-foreground truncate">{tank.name}</p>
        </div>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
          {tank.type === 'mobile' ? 'Móvil' : 'Estac.'}
        </Badge>
      </div>
      <div className="px-3 pt-2">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="mt-1 flex items-baseline justify-between text-xs">
          <span className="tabular-nums font-medium text-foreground">{fillPct.toFixed(0)}%</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatQuantity(tank.current_level_liters, 0)} / {formatQuantity(tank.capacity_liters, 0)} L
          </span>
        </div>
      </div>
      <div className="mt-2 border-t border-border bg-muted/20 px-3 py-1.5">
        {isLow ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertOctagon className="size-3" /> Bajo nivel
          </span>
        ) : isMed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
            <TrendingDown className="size-3" /> Nivel medio
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <TrendingUp className="size-3" /> OK
          </span>
        )}
      </div>
    </button>
  )
}

function QuickActionsRow({ navigate }: { navigate: (to: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Acciones rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          icon={FileBarChart}
          label="Reportes"
          description="Centro de reportes ejecutivos."
          onClick={() => navigate('/direccion/reportes')}
        />
        <QuickAction
          icon={CreditCard}
          label="Cuentas por pagar"
          description="Programar y registrar pagos."
          onClick={() => navigate('/compras/pagos')}
        />
        <QuickAction
          icon={Wrench}
          label="OTs de mantto"
          description="Órdenes de trabajo abiertas y vencidas."
          onClick={() => navigate('/mantenimiento/ordenes')}
        />
        <QuickAction
          icon={Fuel}
          label="Tanques"
          description="Niveles, recargas y consumo."
          onClick={() => navigate('/almacen/tanques')}
        />
      </CardContent>
    </Card>
  )
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="group h-auto w-full justify-start gap-3 p-3 text-left"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    </Button>
  )
}
