/**
 * TanqueDetailPage — detalle de un tanque de diésel.
 *
 * Sidebar con capacidad, ubicación, proveedor y umbral. Main column con el
 * nivel actual, la lista de recargas y los dispensings recientes (últimos
 * stock_movement_lines con tank_id = current tank).
 */
import { useMemo, useState } from 'react'
import {
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  Fuel,
  Truck,
  MapPin,
  Building2,
  Clock,
  AlertOctagon,
  ClipboardList,
  ArrowDownToLine,
  ArrowUpFromLine,
  Edit3,
  Tractor,
  User,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatQuantity, formatMoney, formatFechaCorta, cn } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { RegistrarRecargaDialog } from './registrar-recarga-dialog'
import { AjustarTanqueDialog } from './ajustar-tanque-dialog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ───────────────────────────────────────────────────────────────────

interface TankBalance {
  id: string
  organization_id: string
  code: string
  name: string
  type: 'stationary' | 'mobile'
  capacity_liters: number
  current_level_liters: number
  alert_threshold_pct: number
  location: string | null
  supplier_id: string | null
  supplier_name: string | null
  last_load_at: string | null
  is_active: boolean
  fill_pct: number
  level_status: 'low' | 'medium' | 'ok'
  dispensed_30d: number
  loaded_30d: number
}

interface DieselLoad {
  id: string
  tank_id: string
  supplier_id: string | null
  supplier: { name: string } | null
  delivery_date: string
  liters: number
  unit_cost_mxn: number | null
  total_cost_mxn: number | null
  fuel_invoice_folio: string | null
  notes: string | null
  created_at: string
}

interface DispensingLine {
  id: string
  diesel_liters: number | null
  equipment_hours_before: number | null
  equipment_hours_after: number | null
  created_at: string
  movement: {
    posted_at: string | null
    document_number: string | null
  } | null
  equipment: { code: string; name: string } | null
  operator: { full_name: string } | null
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchTank(tankId: string): Promise<TankBalance | null> {
  const { data, error } = await db
    .from('diesel_tank_balance')
    .select('*')
    .eq('id', tankId)
    .maybeSingle()
  if (error) throw error
  return data as TankBalance | null
}

async function fetchLoads(tankId: string): Promise<DieselLoad[]> {
  const { data, error } = await db
    .from('diesel_loads')
    .select('*, supplier:suppliers(name)')
    .eq('tank_id', tankId)
    .order('delivery_date', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as DieselLoad[]
}

async function fetchDispensings(tankId: string): Promise<DispensingLine[]> {
  const { data, error } = await db
    .from('stock_movement_lines')
    .select(
      '*, movement:stock_movements(posted_at, document_number), equipment:equipment(code,name), operator:employees!stock_movement_lines_operator_employee_id_fkey(full_name)',
    )
    .eq('tank_id', tankId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as DispensingLine[]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TanqueDetailPage() {
  const { id: tankId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const { hasRole } = usePermissions()

  const isAdmin = hasRole('admin')
  const canRecargar = isAdmin || hasRole('almacenista')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cameFrom = (location.state as any)?.from as string | undefined
  const backTo = cameFrom && cameFrom.startsWith('/almacen') ? cameFrom : '/almacen/tanques'

  const [recargaOpen, setRecargaOpen] = useState(false)
  const [ajusteOpen, setAjusteOpen] = useState(false)

  const {
    data: tank,
    isLoading: loadingTank,
    error: errTank,
  } = useQuery<TankBalance | null>({
    queryKey: ['tank-balance', tankId],
    queryFn: () => fetchTank(tankId!),
    enabled: !!tankId && !!organization?.id,
  })

  const { data: loads = [], isLoading: loadingLoads } = useQuery<DieselLoad[]>({
    queryKey: ['tank-loads', tankId],
    queryFn: () => fetchLoads(tankId!),
    enabled: !!tankId,
  })

  const { data: dispensings = [], isLoading: loadingDisp } = useQuery<DispensingLine[]>({
    queryKey: ['tank-dispensings', tankId],
    queryFn: () => fetchDispensings(tankId!),
    enabled: !!tankId,
  })

  if (errTank) {
    const { title, description } = formatSupabaseError(errTank, 'Error al cargar el tanque')
    toast.error(title, { description })
  }

  const lastLoadLabel = tank?.last_load_at
    ? formatDistanceToNow(new Date(tank.last_load_at), { addSuffix: true, locale: es })
    : 'sin recargas'

  const Icon = tank?.type === 'mobile' ? Truck : Fuel

  const fillPct = useMemo(() => {
    if (!tank) return 0
    return Math.max(0, Math.min(100, tank.fill_pct ?? 0))
  }, [tank])

  const barColor =
    tank?.level_status === 'low'
      ? 'bg-destructive'
      : tank?.level_status === 'medium'
      ? 'bg-warning'
      : 'bg-success'

  const statusBadge =
    tank?.level_status === 'low' ? (
      <Badge
        variant="outline"
        className="text-[10px] h-5 px-1.5 border-destructive/40 text-destructive gap-0.5"
      >
        <AlertOctagon className="size-3" />
        Bajo nivel
      </Badge>
    ) : tank?.level_status === 'medium' ? (
      <Badge
        variant="outline"
        className="text-[10px] h-5 px-1.5 border-warning/40 text-warning gap-0.5"
      >
        Medio
      </Badge>
    ) : tank ? (
      <Badge
        variant="outline"
        className="text-[10px] h-5 px-1.5 border-success/40 text-success gap-0.5"
      >
        OK
      </Badge>
    ) : null

  if (loadingTank) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (!tank) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <EmptyState
          icon={<Fuel className="size-5" />}
          title="Tanque no encontrado"
          description="El tanque que buscas no existe o fue eliminado."
          action={{ label: 'Volver al listado', onClick: () => navigate(backTo) }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate(backTo)}
          className="mt-1.5"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <PageHeader
            title={tank.name}
            description={
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">{tank.code}</span>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {tank.type === 'mobile' ? 'Móvil' : 'Estacionario'}
                </Badge>
                {statusBadge}
              </div>
            }
            actions={
              canRecargar && (
                <Button size="sm" onClick={() => setRecargaOpen(true)} className="gap-1.5">
                  <ArrowDownToLine className="size-3.5" />
                  Recargar
                </Button>
              )
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <aside className="flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border bg-muted/30 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Información
              </p>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAjusteOpen(true)}
                  className="h-7 text-xs gap-1.5"
                >
                  <Edit3 className="size-3" />
                  Ajustar nivel
                </Button>
              )}
            </div>

            <div className="p-4 flex flex-col gap-3 text-sm">
              <InfoRow
                icon={Icon}
                label="Capacidad"
                value={`${formatQuantity(tank.capacity_liters, 1)} L`}
              />
              {tank.location && (
                <InfoRow icon={MapPin} label="Ubicación" value={tank.location} />
              )}
              {tank.supplier_name && (
                <InfoRow
                  icon={Building2}
                  label="Proveedor habitual"
                  value={tank.supplier_name}
                />
              )}
              <InfoRow
                icon={Clock}
                label="Última recarga"
                value={
                  <div className="flex flex-col">
                    <span>{lastLoadLabel}</span>
                    {tank.last_load_at && (
                      <span className="text-[11px] text-muted-foreground/80">
                        {format(new Date(tank.last_load_at), "d 'de' MMM yyyy, HH:mm", {
                          locale: es,
                        })}
                      </span>
                    )}
                  </div>
                }
              />
              <InfoRow
                icon={AlertOctagon}
                label="Umbral de alerta"
                value={`${formatQuantity(tank.alert_threshold_pct, 0)}%`}
              />
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="lg:col-span-2 flex flex-col gap-6">
          {/* Big level card */}
          <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
            <span
              aria-hidden
              className={cn('absolute left-0 top-0 bottom-0 w-1', barColor)}
            />
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Nivel actual
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-4xl font-bold tabular-nums font-mono text-foreground">
                    {formatQuantity(tank.current_level_liters, 1)}
                  </span>
                  <span className="text-lg text-muted-foreground font-mono">L</span>
                  <span className="ml-2 text-sm text-muted-foreground font-mono">
                    / {formatQuantity(tank.capacity_liters, 1)} L
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Llenado
                </p>
                <p className="text-3xl font-bold tabular-nums font-mono mt-1">
                  {fillPct.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barColor)}
                style={{ width: `${fillPct}%` }}
              />
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <ArrowDownToLine className="size-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Cargado (30d)</p>
                  <p className="text-base font-semibold font-mono tabular-nums">
                    {formatQuantity(tank.loaded_30d ?? 0, 1)} L
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <ArrowUpFromLine className="size-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Consumido (30d)</p>
                  <p className="text-base font-semibold font-mono tabular-nums">
                    {formatQuantity(tank.dispensed_30d ?? 0, 1)} L
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Recargas section */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Recargas
                </p>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {loads.length}
                </Badge>
              </div>
            </div>

            {loadingLoads ? (
              <div className="p-4 flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : loads.length === 0 ? (
              <EmptyState
                icon={<ArrowDownToLine className="size-5" />}
                title="Sin recargas"
                description="Aún no se han registrado recargas para este tanque."
                action={
                  canRecargar
                    ? { label: '+ Registrar recarga', onClick: () => setRecargaOpen(true) }
                    : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-28">Fecha</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="w-24 text-right">Litros</TableHead>
                      <TableHead className="w-32 text-right">Costo unit.</TableHead>
                      <TableHead className="w-32 text-right">Total</TableHead>
                      <TableHead className="w-28">Folio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loads.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="text-xs font-medium tabular-nums">
                            {formatFechaCorta(l.delivery_date)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {l.supplier?.name ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-bold font-mono tabular-nums">
                            {formatQuantity(l.liters, 1)} L
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {l.unit_cost_mxn != null ? (
                            <span className="text-sm font-mono tabular-nums">
                              {formatMoney(l.unit_cost_mxn, 'MXN')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {l.total_cost_mxn != null && l.total_cost_mxn > 0 ? (
                            <span className="text-sm font-mono tabular-nums font-medium">
                              {formatMoney(l.total_cost_mxn, 'MXN')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">
                            {l.fuel_invoice_folio ?? '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Dispensings section */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="size-3.5 text-muted-foreground" />
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Dispensings recientes
                </p>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {dispensings.length}
                </Badge>
              </div>
            </div>

            {loadingDisp ? (
              <div className="p-4 flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : dispensings.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="size-5" />}
                title="Sin dispensings"
                description="Aún no se han registrado salidas de combustible desde este tanque. Las cargas a tractores se asociarán aquí cuando indiquen el tanque de origen."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                      <TableHead className="w-28">Fecha</TableHead>
                      <TableHead>Equipo</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead className="w-24 text-right">Litros</TableHead>
                      <TableHead className="w-36">Horómetro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispensings.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <span className="text-xs font-medium tabular-nums">
                            {formatFechaCorta(
                              d.movement?.posted_at ?? d.created_at,
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {d.equipment ? (
                            <div className="flex items-center gap-1.5">
                              <Tractor className="size-3 text-muted-foreground shrink-0" />
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium leading-tight">
                                  {d.equipment.name}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {d.equipment.code}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.operator ? (
                            <div className="flex items-center gap-1.5">
                              <User className="size-3 text-muted-foreground shrink-0" />
                              <span className="text-sm">{d.operator.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-bold font-mono tabular-nums">
                            {d.diesel_liters != null
                              ? `${formatQuantity(d.diesel_liters, 1)} L`
                              : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {d.equipment_hours_before != null &&
                          d.equipment_hours_after != null ? (
                            <span className="text-xs tabular-nums text-muted-foreground font-mono">
                              {formatQuantity(d.equipment_hours_before, 1)} →{' '}
                              {formatQuantity(d.equipment_hours_after, 1)} h
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </main>
      </div>

      <RegistrarRecargaDialog
        open={recargaOpen}
        tankId={tank.id}
        tankName={tank.name}
        tankCode={tank.code}
        capacityLiters={tank.capacity_liters}
        currentLevel={tank.current_level_liters}
        defaultSupplierId={tank.supplier_id}
        onClose={() => setRecargaOpen(false)}
      />

      {isAdmin && (
        <AjustarTanqueDialog
          open={ajusteOpen}
          tankId={tank.id}
          tankName={tank.name}
          tankCode={tank.code}
          capacityLiters={tank.capacity_liters}
          currentLevel={tank.current_level_liters}
          onClose={() => setAjusteOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface InfoRowProps {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}

function InfoRow({ icon: Icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        className="size-3.5 text-muted-foreground shrink-0 mt-0.5"
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
  )
}
