/**
 * CockpitPage — vista principal de /plataforma.
 *
 * KPIs globales (cross-tenant) + tabla de orgs con métricas por tenant.
 * Datos vía RPCs SECURITY DEFINER (platform_overview + platform_orgs_summary)
 * que sólo responden si el caller es platform_admin.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Building2,
  Users,
  Activity,
  Wrench,
  ClipboardList,
  Fuel,
  Package,
  Tractor,
  Network,
  Loader2,
  Search,
  Calendar,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { formatQuantity, formatMoney } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { EmptyState } from '@/components/custom/empty-state'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlatformOverview {
  orgs_total: number
  orgs_active_30d: number
  users_total: number
  users_active_30d: number
  movements_today: number
  movements_30d: number
  open_work_orders: number
  pending_requisitions: number
  diesel_liters_30d: number
  diesel_cost_30d_mxn: number
}

interface OrgSummary {
  org_id: string
  org_name: string
  rfc: string | null
  base_currency: 'MXN' | 'USD'
  created_at: string
  users_count: number
  users_active_30d: number
  items_count: number
  equipment_count: number
  open_work_orders: number
  movements_30d: number
  last_movement_at: string | null
  diesel_liters_30d: number
  active_tanks: number
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CockpitPage() {
  const [search, setSearch] = useState('')

  const overviewQuery = useQuery<PlatformOverview | null>({
    queryKey: ['platform-overview'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('platform_overview')
      if (error) throw error
      // PG returns a table → array with one row
      return (data?.[0] as PlatformOverview) ?? null
    },
  })

  const orgsQuery = useQuery<OrgSummary[]>({
    queryKey: ['platform-orgs-summary'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('platform_orgs_summary')
      if (error) throw error
      return (data ?? []) as OrgSummary[]
    },
  })

  const overview = overviewQuery.data
  const orgs = orgsQuery.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter(
      (o) =>
        o.org_name.toLowerCase().includes(q) ||
        (o.rfc ?? '').toLowerCase().includes(q),
    )
  }, [orgs, search])

  const errorMsg = overviewQuery.error
    ? formatSupabaseError(overviewQuery.error, 'No se pudo cargar el cockpit').description
    : orgsQuery.error
    ? formatSupabaseError(orgsQuery.error, 'No se pudo cargar el resumen de orgs').description
    : null

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Cockpit de plataforma"
        description="Orquestación cross-tenant — métricas y salud de todas las organizaciones"
        actions={
          (overviewQuery.isFetching || orgsQuery.isFetching) && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Actualizando…
            </span>
          )
        }
      />

      {errorMsg && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Building2}
          label="Organizaciones"
          value={String(overview?.orgs_total ?? 0)}
          hint={
            overview
              ? `${overview.orgs_active_30d} activas (30d)`
              : undefined
          }
          loading={overviewQuery.isLoading}
        />
        <KpiCard
          icon={Users}
          label="Usuarios"
          value={String(overview?.users_total ?? 0)}
          hint={
            overview
              ? `${overview.users_active_30d} con login en 30d`
              : undefined
          }
          loading={overviewQuery.isLoading}
        />
        <KpiCard
          icon={Activity}
          label="Movimientos hoy"
          value={String(overview?.movements_today ?? 0)}
          hint={
            overview
              ? `${overview.movements_30d} en 30 días`
              : undefined
          }
          loading={overviewQuery.isLoading}
        />
        <KpiCard
          icon={Wrench}
          label="OTs abiertas"
          value={String(overview?.open_work_orders ?? 0)}
          hint="Suma cross-tenant"
          loading={overviewQuery.isLoading}
          tone={
            overview && overview.open_work_orders > 0 ? 'warning' : 'default'
          }
        />
        <KpiCard
          icon={Fuel}
          label="Diésel 30d"
          value={`${formatQuantity(overview?.diesel_liters_30d ?? 0, 0)} L`}
          hint={
            overview
              ? formatMoney(overview.diesel_cost_30d_mxn, 'MXN')
              : undefined
          }
          loading={overviewQuery.isLoading}
        />
      </div>

      {/* Pending requisitions banner (si hay) */}
      {overview && overview.pending_requisitions > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 flex items-center gap-2.5 text-sm">
          <ClipboardList className="size-4 text-warning shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{overview.pending_requisitions}</span>
            {' '}requisiciones pendientes de aprobación en el conjunto de tenants
          </span>
        </div>
      )}

      {/* Orgs table */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Organizaciones
            </h2>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {orgs.length}
            </Badge>
          </div>

          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2 w-full sm:w-auto">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground sr-only">
                Buscar
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o RFC…"
                  className="h-8 pl-8 text-sm w-full sm:w-64"
                />
              </div>
            </div>
          </div>
        </div>

        {orgsQuery.isLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={orgs.length === 0 ? 'Sin organizaciones' : 'Sin resultados'}
            description={
              orgs.length === 0
                ? 'Aún no hay tenants registrados en la plataforma.'
                : 'Ajusta la búsqueda para encontrar la organización.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent text-xs uppercase tracking-wide text-muted-foreground">
                  <TableHead>Organización</TableHead>
                  <TableHead className="text-right">Usuarios</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Equipos</TableHead>
                  <TableHead className="text-right">OTs abiertas</TableHead>
                  <TableHead className="text-right">Mov. 30d</TableHead>
                  <TableHead className="text-right">Diésel 30d</TableHead>
                  <TableHead>Última actividad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const lastActivity = o.last_movement_at
                    ? formatDistanceToNow(new Date(o.last_movement_at), {
                        addSuffix: true,
                        locale: es,
                      })
                    : null
                  const inactive =
                    !o.last_movement_at ||
                    Date.now() - new Date(o.last_movement_at).getTime() >
                      30 * 24 * 60 * 60 * 1000
                  return (
                    <TableRow key={o.org_id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-medium text-foreground leading-tight">
                            {o.org_name}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {o.rfc && <span className="font-mono">{o.rfc}</span>}
                            <Calendar className="size-2.5" />
                            <span>
                              Alta{' '}
                              {formatDistanceToNow(new Date(o.created_at), {
                                locale: es,
                                addSuffix: false,
                              })}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0 leading-tight">
                          <span className="text-sm font-semibold tabular-nums font-mono">
                            {o.users_count}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {o.users_active_30d} activos
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1 text-sm tabular-nums font-mono">
                          <Package className="size-3 text-muted-foreground" />
                          {o.items_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1 text-sm tabular-nums font-mono">
                          <Tractor className="size-3 text-muted-foreground" />
                          {o.equipment_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {o.open_work_orders > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning text-[10px] h-5 px-1.5 gap-1 tabular-nums font-mono"
                          >
                            <Wrench className="size-2.5" />
                            {o.open_work_orders}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-mono">
                        {o.movements_30d > 0 ? (
                          o.movements_30d
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {o.diesel_liters_30d > 0 ? (
                          <span className="text-sm tabular-nums font-mono">
                            {formatQuantity(o.diesel_liters_30d, 0)} L
                          </span>
                        ) : o.active_tanks > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            0 L · {o.active_tanks} tanques
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {lastActivity ? (
                          <span
                            className={
                              inactive
                                ? 'text-xs text-muted-foreground'
                                : 'text-xs text-foreground'
                            }
                          >
                            {lastActivity}
                          </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 border-muted-foreground/30 text-muted-foreground"
                          >
                            Sin actividad
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
