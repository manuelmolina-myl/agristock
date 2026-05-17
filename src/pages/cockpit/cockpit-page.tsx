/**
 * Cockpit del Director — executive cross-module dashboard.
 *
 * One-screen pulse view that crosses Compras, Mantenimiento, Almacén and
 * Diésel. Unlike the per-module dashboards this one prioritises
 * cash-flow signals (gasto del mes) and bottlenecks (OTs abiertas,
 * requisiciones pendientes) over operational counters.
 *
 * Sections:
 *   1) Top KPIs — Gasto del mes, OTs abiertas, Requisiciones pendientes,
 *      Diesel del mes (with trend hints comparing to previous month).
 *   2) Spend by category (horizontal bar chart, lazy-loaded Recharts).
 *   3) Cross-module audit-log feed with filter chips.
 *   4) Quick links to each module dashboard.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  Wrench,
  ClipboardList,
  Fuel,
  Activity,
  Warehouse,
  ShoppingCart,
  ArrowRight,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatMoney, formatQuantity, formatRelativo, cn } from '@/lib/utils'
import {
  actionLabel,
  entityLabel,
  actionBadgeColor,
  userInitial,
  moduleForEntity,
  type AuditModule,
} from '@/lib/audit-helpers'
import type { AuditLog } from '@/lib/database.types'

// Lazy-load the Recharts wrapper so the heavy chart chunk only loads on this page
const SpendByCategoryBarChart = lazy(
  () => import('@/components/charts/spend-by-category-bar-chart'),
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Date utils ─────────────────────────────────────────────────────────────

function monthBounds(offset = 0): { start: string; end: string } {
  // offset 0 → current month, -1 → previous month
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

// ─── KPI 1: Gasto del mes (entries + POs) ──────────────────────────────────

interface GastoMesData {
  current: number
  previous: number
}

function useGastoMes(orgId: string | undefined) {
  return useQuery<GastoMesData>({
    queryKey: ['cockpit-gasto-mes', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const cur = monthBounds(0)
      const prev = monthBounds(-1)

      // Stock-movement entries (entry_%) posted in each window
      const fetchEntries = async (startIso: string, endIso: string) => {
        const { data, error } = await db
          .from('stock_movements')
          .select('total_mxn, movement_type, status, posted_at')
          .eq('organization_id', orgId)
          .eq('status', 'posted')
          .like('movement_type', 'entry_%')
          .gte('posted_at', startIso)
          .lt('posted_at', endIso)
          .not('total_mxn', 'is', null)
        if (error) throw error
        return ((data ?? []) as Array<{ total_mxn: number | null }>).reduce(
          (s, r) => s + (r.total_mxn ?? 0),
          0,
        )
      }

      // Purchase orders issued in each window (use issue_date, date column)
      const fetchPOs = async (startIso: string, endIso: string) => {
        const startDate = startIso.slice(0, 10)
        const endDate = endIso.slice(0, 10)
        const { data, error } = await db
          .from('purchase_orders')
          .select('total_mxn, issue_date, status')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .gte('issue_date', startDate)
          .lt('issue_date', endDate)
          .not('total_mxn', 'is', null)
        if (error) throw error
        return ((data ?? []) as Array<{ total_mxn: number | null }>).reduce(
          (s, r) => s + (r.total_mxn ?? 0),
          0,
        )
      }

      const [curEntries, curPOs, prevEntries, prevPOs] = await Promise.all([
        fetchEntries(cur.start, cur.end),
        fetchPOs(cur.start, cur.end),
        fetchEntries(prev.start, prev.end),
        fetchPOs(prev.start, prev.end),
      ])

      return {
        current: curEntries + curPOs,
        previous: prevEntries + prevPOs,
      }
    },
  })
}

// ─── KPI 2: OTs abiertas ────────────────────────────────────────────────────

interface OTsData {
  open: number
  critical: number
}

function useOTsAbiertas(orgId: string | undefined) {
  return useQuery<OTsData>({
    queryKey: ['cockpit-ots-abiertas', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('work_orders')
        .select('status, priority')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .in('status', [
          'reported',
          'scheduled',
          'assigned',
          'in_progress',
          'waiting_parts',
        ])
      if (error) throw error
      const rows = (data ?? []) as Array<{ status: string; priority: string }>
      return {
        open: rows.length,
        critical: rows.filter((r) => r.priority === 'critical').length,
      }
    },
  })
}

// ─── KPI 3: Requisiciones pendientes ───────────────────────────────────────

function useRequisicionesPendientes(orgId: string | undefined) {
  return useQuery<number>({
    queryKey: ['cockpit-reqs-pendientes', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from('purchase_requisitions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('status', 'submitted')
      if (error) throw error
      return count ?? 0
    },
  })
}

// ─── KPI 4: Diesel del mes (current + previous) ───────────────────────────

interface DieselMesData {
  current: number
  previous: number
}

function useDieselMes(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<DieselMesData>({
    queryKey: ['cockpit-diesel-mes', orgId, seasonId],
    enabled: !!orgId && !!seasonId,
    staleTime: 60_000,
    queryFn: async () => {
      const fetch = async (startIso: string, endIso: string) => {
        const { data, error } = await db
          .from('stock_movement_lines')
          .select(
            'diesel_liters, item:items!inner(is_diesel), movement:stock_movements!inner(organization_id, season_id, status, posted_at)',
          )
          .eq('item.is_diesel', true)
          .eq('movement.organization_id', orgId)
          .eq('movement.season_id', seasonId)
          .eq('movement.status', 'posted')
          .gte('movement.posted_at', startIso)
          .lt('movement.posted_at', endIso)
        if (error) throw error
        return ((data ?? []) as Array<{ diesel_liters: number | null }>).reduce(
          (s, r) => s + (r.diesel_liters ?? 0),
          0,
        )
      }

      const cur = monthBounds(0)
      const prev = monthBounds(-1)
      const [current, previous] = await Promise.all([
        fetch(cur.start, cur.end),
        fetch(prev.start, prev.end),
      ])
      return { current, previous }
    },
  })
}

// ─── Section 2: Spend by category ───────────────────────────────────────────

interface CategorySpendRow {
  category: string
  total_mxn: number
}

function useSpendByCategory(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<CategorySpendRow[]>({
    queryKey: ['cockpit-spend-by-category', orgId, seasonId],
    enabled: !!orgId && !!seasonId,
    staleTime: 60_000,
    queryFn: async () => {
      const { start, end } = monthBounds(0)
      const { data, error } = await db
        .from('stock_movement_lines')
        .select(
          'line_total_mxn, item:items!inner(category_id, category:categories(name)), movement:stock_movements!inner(organization_id, season_id, status, posted_at, movement_type)',
        )
        .eq('movement.organization_id', orgId)
        .eq('movement.season_id', seasonId)
        .eq('movement.status', 'posted')
        .like('movement.movement_type', 'entry_%')
        .gte('movement.posted_at', start)
        .lt('movement.posted_at', end)
      if (error) throw error

      const rows = (data ?? []) as Array<{
        line_total_mxn: number | null
        item: {
          category_id: string | null
          category: { name: string } | null
        } | null
      }>

      const agg = new Map<string, number>()
      for (const r of rows) {
        const name = r.item?.category?.name ?? 'Sin categoría'
        const value = r.line_total_mxn ?? 0
        if (value <= 0) continue
        agg.set(name, (agg.get(name) ?? 0) + value)
      }

      return Array.from(agg.entries())
        .map(([category, total_mxn]) => ({ category, total_mxn }))
        .sort((a, b) => b.total_mxn - a.total_mxn)
        .slice(0, 8)
    },
  })
}

// ─── Section 3: Audit-log feed (limit 30) ──────────────────────────────────

function useActividadCockpit(orgId: string | undefined) {
  return useQuery<AuditLog[]>({
    queryKey: ['cockpit-audit-log', orgId],
    enabled: !!orgId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('audit_log')
        .select('*')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as AuditLog[]
    },
  })
}

// ─── Filter chips ───────────────────────────────────────────────────────────

type FeedFilter = 'all' | AuditModule

const FILTER_CHIPS: Array<{ id: FeedFilter; label: string }> = [
  { id: 'all',           label: 'Todo' },
  { id: 'compras',       label: 'Compras' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'almacen',       label: 'Almacén' },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export function CockpitPage() {
  const { organization, activeSeason } = useAuth()
  const navigate = useNavigate()
  const orgId = organization?.id
  const seasonId = activeSeason?.id

  const gastoQ = useGastoMes(orgId)
  const otsQ = useOTsAbiertas(orgId)
  const reqsQ = useRequisicionesPendientes(orgId)
  const dieselQ = useDieselMes(orgId, seasonId)
  const spendCatQ = useSpendByCategory(orgId, seasonId)
  const actividadQ = useActividadCockpit(orgId)

  const [filter, setFilter] = useState<FeedFilter>('all')

  const filteredFeed = useMemo(() => {
    const entries = actividadQ.data ?? []
    if (filter === 'all') return entries
    return entries.filter((e) => moduleForEntity(e.entity_type) === filter)
  }, [actividadQ.data, filter])

  // KPI trends
  const gastoPctVsPrev = useMemo(() => {
    if (!gastoQ.data) return null
    const { current, previous } = gastoQ.data
    if (previous <= 0) return null
    return ((current - previous) / previous) * 100
  }, [gastoQ.data])

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      <PageHeader
        title="Cockpit del Director"
        description="Vista ejecutiva — gasto, requisiciones, mantenimiento y diésel del mes."
      />

      {/* ─── Section 1: Top KPIs ─── */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Gasto del mes"
          value={formatMoney(gastoQ.data?.current ?? 0)}
          icon={DollarSign}
          tone="default"
          isLoading={gastoQ.isLoading}
          hint={
            gastoPctVsPrev === null
              ? 'MXN · entradas + OCs'
              : `${gastoPctVsPrev > 0 ? '+' : ''}${gastoPctVsPrev.toFixed(0)}% vs mes anterior`
          }
        />
        <KpiCard
          label="OTs abiertas"
          value={String(otsQ.data?.open ?? 0)}
          icon={Wrench}
          tone={(otsQ.data?.open ?? 0) > 5 ? 'warning' : 'default'}
          isLoading={otsQ.isLoading}
          hint={
            (otsQ.data?.critical ?? 0) > 0
              ? `${otsQ.data?.critical} críticas`
              : 'Sin OTs críticas'
          }
          onClick={() => navigate('/mantenimiento/ordenes')}
        />
        <KpiCard
          label="Requisiciones pendientes"
          value={String(reqsQ.data ?? 0)}
          icon={ClipboardList}
          tone={(reqsQ.data ?? 0) > 3 ? 'warning' : 'default'}
          isLoading={reqsQ.isLoading}
          hint="Para revisión"
          onClick={() => navigate('/compras/requisiciones')}
        />
        <KpiCard
          label="Diésel del mes"
          value={`${formatQuantity(dieselQ.data?.current ?? 0)} L`}
          icon={Fuel}
          tone="info"
          isLoading={dieselQ.isLoading}
          hint={
            dieselQ.data
              ? `vs ${formatQuantity(dieselQ.data.previous)} L mes anterior`
              : 'Consumo acumulado'
          }
          onClick={() => navigate('/almacen/diesel')}
        />
      </div>

      {/* ─── Section 2: Spend by category ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Gasto por categoría — mes actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {spendCatQ.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !spendCatQ.data?.length ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Sin entradas registradas este mes
              </p>
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <SpendByCategoryBarChart data={spendCatQ.data} />
            </Suspense>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 3: Cross-module activity ─── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="size-4" />
              Actividad reciente — todos los módulos
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors border',
                    filter === chip.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
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
          ) : !filteredFeed.length ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {filter === 'all'
                  ? 'Sin actividad registrada'
                  : 'Sin actividad para este filtro'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredFeed.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
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

      {/* ─── Section 4: Quick links ─── */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
        <QuickLinkCard
          icon={Warehouse}
          label="Ver Almacén"
          description="Inventario, entradas, salidas y diésel."
          onClick={() => navigate('/almacen')}
        />
        <QuickLinkCard
          icon={ShoppingCart}
          label="Ver Compras"
          description="Requisiciones, cotizaciones y órdenes de compra."
          onClick={() => navigate('/compras')}
        />
        <QuickLinkCard
          icon={Wrench}
          label="Ver Mantenimiento"
          description="Órdenes de trabajo, equipos y planes preventivos."
          onClick={() => navigate('/mantenimiento')}
        />
      </div>
    </div>
  )
}

interface QuickLinkCardProps {
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
}

function QuickLinkCard({ icon: Icon, label, description, onClick }: QuickLinkCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card',
        'flex items-start gap-3 p-4 text-left transition-all duration-150',
        'hover:border-foreground/20 hover:shadow-sm cursor-pointer',
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <ArrowRight
        className="size-4 text-muted-foreground/60 shrink-0 mt-1 group-hover:text-foreground transition-colors"
        strokeWidth={1.75}
      />
    </button>
  )
}

export default CockpitPage
