import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PackagePlus,
  PackageMinus,
  ArrowLeftRight,
  AlertTriangle,
  Clock,
} from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
import { supabase } from '@/lib/supabase'
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatHora, cn } from '@/lib/utils'

import { EmptyState } from '@/components/custom/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ────────────────────────────────────────────────────────────────────

interface MovimientoDia {
  id: string
  created_at: string
  movement_type: string
  status: string
  warehouse: { name: string } | null
}

interface AlertaStock {
  quantity: number
  item: {
    name: string
    sku: string
    reorder_point: number
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function isEntrada(type: string) {
  return type.startsWith('entry_')
}

function MovimientoTypeBadge({ type }: { type: string }) {
  const label = isEntrada(type) ? 'Entrada' : 'Salida'
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs',
        isEntrada(type)
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
          : 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400',
      )}
    >
      {label}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Borrador',  cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400' },
    posted:    { label: 'Publicado', cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400' },
    cancelled: { label: 'Cancelado', cls: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400' },
  }
  const s = map[status] ?? { label: status, cls: '' }
  return (
    <Badge variant="outline" className={cn('text-xs', s.cls)}>
      {s.label}
    </Badge>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AlmacenistaDashboardPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization, activeSeason } = useAuth()
  const orgId = organization?.id
  const seasonId = activeSeason?.id

  // Start of today (local midnight → ISO)
  const todayStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // ── Movimientos del día ──────────────────────────────────────────────────────
  const { data: movimientos, isLoading: loadingMov } = useQuery<MovimientoDia[]>({
    queryKey: ['movimientos-dia', orgId, todayStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movements')
        .select('id, created_at, movement_type, status, warehouse:warehouses!stock_movements_warehouse_id_fkey(name)')
        .eq('organization_id', orgId)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as MovimientoDia[]
    },
    enabled: !!orgId,
  })

  // ── Alertas de stock bajo ────────────────────────────────────────────────────
  const { data: alertasRaw, isLoading: loadingAlertas } = useQuery<AlertaStock[]>({
    queryKey: ['alertas-stock', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('quantity, item:items!inner(name, sku, reorder_point)')
        .eq('season_id', seasonId)
        .gt('item.reorder_point', 0)
      if (error) throw error
      return (data ?? []) as AlertaStock[]
    },
    enabled: !!orgId && !!seasonId,
  })

  const alertas = useMemo(
    () => (alertasRaw ?? []).filter((a) => a.quantity < a.item.reorder_point),
    [alertasRaw],
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate(`${basePath}/entradas/nueva`)}
          className="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-card-foreground ring-1 ring-foreground/5 transition-all hover:border-primary/40 hover:bg-primary/5 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <PackagePlus className="size-5" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium">+ Nueva entrada</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(`${basePath}/salidas/nueva`)}
          className="group flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-card-foreground ring-1 ring-foreground/5 transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:ring-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/15">
            <PackageMinus className="size-5" strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium">+ Nueva salida</span>
        </button>
      </div>

      {/* Movimientos del día */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeftRight className="size-4 text-muted-foreground" />
            Movimientos del día
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingMov ? (
            <div className="flex flex-col gap-0 divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
              ))}
            </div>
          ) : !movimientos || movimientos.length === 0 ? (
            <EmptyState
              title="Sin movimientos hoy"
              description="Los movimientos registrados hoy aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border">
              {movimientos.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatHora(m.created_at)}
                  </span>
                  <MovimientoTypeBadge type={m.movement_type} />
                  <span className="text-xs text-muted-foreground">
                    {MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}
                  </span>
                  {m.warehouse && (
                    <span className="text-xs font-medium">{m.warehouse.name}</span>
                  )}
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Alertas de stock bajo */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-muted-foreground" />
            Alertas de stock bajo
            {alertas.length > 0 && (
              <Badge variant="destructive" className="ml-auto text-xs">
                {alertas.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingAlertas ? (
            <div className="flex flex-col gap-0 divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="ml-auto h-4 w-20" />
                </div>
              ))}
            </div>
          ) : alertas.length === 0 ? (
            <EmptyState
              title="Sin alertas activas"
              description="Los artículos por debajo del punto de reorden aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border">
              {alertas.map((a, i) => {
                const deficit = a.item.reorder_point - a.quantity
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.item.name}</p>
                      <p className="text-xs text-muted-foreground">{a.item.sku}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Stock: <strong className="text-foreground">{a.quantity}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Mín: <strong className="text-foreground">{a.item.reorder_point}</strong>
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        −{deficit}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AlmacenistaDashboardPage
