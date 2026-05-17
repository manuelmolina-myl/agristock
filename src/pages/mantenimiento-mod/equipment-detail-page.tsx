import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Tractor, Clock, Calendar, ShieldCheck, Hash, FileBadge,
  Wrench, CheckCircle2, AlertOctagon, CalendarClock, ArrowRight,
  Activity, Package, TrendingDown,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KpiCard } from '@/components/custom/kpi-card'
import { supabase } from '@/lib/supabase'
import type { EquipmentStatus, EquipmentKind, WOStatus, WOType, WOPriority } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  operational: 'Operativo', in_maintenance: 'En mantto.',
  out_of_service: 'Fuera de servicio', disposed: 'Dado de baja',
}
const STATUS_TONE: Record<EquipmentStatus, string> = {
  operational:    'bg-success/15 text-success',
  in_maintenance: 'bg-warning/15 text-warning',
  out_of_service: 'bg-destructive/15 text-destructive',
  disposed:       'bg-muted text-muted-foreground',
}
const KIND_LABEL: Partial<Record<EquipmentKind, string>> = {
  vehicle: 'Vehículo', machinery: 'Maquinaria', implement: 'Implemento',
  installation: 'Instalación', irrigation_system: 'Riego',
  tool: 'Herramienta', other: 'Otro',
}

const WO_STATUS_LABEL: Record<WOStatus, string> = {
  reported: 'Reportada', scheduled: 'Programada', assigned: 'Asignada',
  in_progress: 'En proceso', waiting_parts: 'Espera refacción',
  completed: 'Completada', closed: 'Cerrada', cancelled: 'Cancelada',
}
const WO_STATUS_TONE: Record<WOStatus, string> = {
  reported: 'bg-warning/15 text-warning',
  scheduled: 'bg-usd/15 text-usd',
  assigned: 'bg-usd/15 text-usd',
  in_progress: 'bg-warning/15 text-warning',
  waiting_parts: 'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  closed: 'bg-success/10 text-success/80',
  cancelled: 'bg-destructive/15 text-destructive',
}
const WO_TYPE_LABEL: Record<WOType, string> = {
  corrective: 'Correctivo', preventive: 'Preventivo', predictive: 'Predictivo',
  improvement: 'Mejora', inspection: 'Inspección',
}
const WO_PRIORITY_LABEL: Record<WOPriority, string> = {
  low: 'Baja', medium: 'Normal', high: 'Alta', critical: 'Crítica',
}

interface EquipmentFull {
  id: string
  code: string
  name: string
  kind: EquipmentKind | null
  status: EquipmentStatus
  type: string | null
  brand: string | null
  model: string | null
  plate: string | null
  year: number | null
  current_hours: number | null
  current_km: number | null
  serial_number: string | null
  engine_number: string | null
  location: string | null
  acquisition_date: string | null
  acquisition_cost_native: number | null
  acquisition_currency: string | null
  insurance_policy: string | null
  insurance_expires_at: string | null
  responsible_employee_id: string | null
  responsible?: { full_name: string } | null
  is_active: boolean
}

interface WORow {
  id: string
  folio: string
  wo_type: WOType
  priority: WOPriority
  status: WOStatus
  failure_description: string | null
  reported_at: string
  completed_at: string | null
  total_cost_mxn: number | null
  primary_technician?: { full_name: string } | null
  failure_type?: { label: string } | null
}

interface PlanRow {
  id: string
  name: string
  trigger_type: string
  interval_value: number
  interval_unit: string
  next_execution_value: number
  is_active: boolean
}

interface PartRow {
  id: string
  delivered_quantity: number
  total_cost_mxn: number | null
  created_at: string
  item?: { name: string; sku: string } | null
  wo?: { folio: string } | null
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: eq, isLoading } = useQuery<EquipmentFull | null>({
    queryKey: ['equipment-full', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select(`
          id, code, name, kind, status, type, brand, model, plate, year,
          current_hours, current_km, serial_number, engine_number, location,
          acquisition_date, acquisition_cost_native, acquisition_currency,
          insurance_policy, insurance_expires_at, responsible_employee_id,
          responsible:employees!equipment_responsible_employee_id_fkey(full_name),
          is_active
        `)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as EquipmentFull | null
    },
  })

  const { data: workOrders = [] } = useQuery<WORow[]>({
    queryKey: ['equipment-wos', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('work_orders')
        .select(`
          id, folio, wo_type, priority, status, failure_description,
          reported_at, completed_at, total_cost_mxn,
          primary_technician:employees!work_orders_primary_technician_id_fkey(full_name),
          failure_type:failure_types(label)
        `)
        .eq('equipment_id', id)
        .is('deleted_at', null)
        .order('reported_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as WORow[]
    },
  })

  const { data: plans = [] } = useQuery<PlanRow[]>({
    queryKey: ['equipment-plans', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('maintenance_plans')
        .select('id, name, trigger_type, interval_value, interval_unit, next_execution_value, is_active')
        .eq('equipment_id', id)
        .is('deleted_at', null)
        .order('next_execution_value')
      if (error) throw error
      return (data ?? []) as PlanRow[]
    },
  })

  const { data: parts = [] } = useQuery<PartRow[]>({
    queryKey: ['equipment-parts', id],
    enabled: !!id,
    queryFn: async () => {
      // Parts consumed across all WOs for this equipment.
      const { data, error } = await db
        .from('wo_parts')
        .select(`
          id, delivered_quantity, total_cost_mxn, created_at,
          item:items(name, sku),
          wo:work_orders!inner(folio, equipment_id)
        `)
        .eq('wo.equipment_id', id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as PartRow[]
    },
  })

  // KPIs derived from the work-orders dataset
  const kpis = useMemo(() => {
    const closed   = workOrders.filter((w) => w.status === 'closed' || w.status === 'completed')
    const open     = workOrders.filter((w) => !['closed', 'cancelled', 'completed'].includes(w.status))
    const yearAgo  = Date.now() - 365 * 24 * 60 * 60 * 1000
    const recent   = closed.filter((w) => w.completed_at && new Date(w.completed_at).getTime() > yearAgo)
    const costYear = recent.reduce((acc, w) => acc + (w.total_cost_mxn ?? 0), 0)
    const partsCost = parts.reduce((acc, p) => acc + (p.total_cost_mxn ?? 0), 0)
    return {
      open: open.length,
      closedYear: recent.length,
      costYear,
      partsCost,
      totalParts: parts.length,
    }
  }, [workOrders, parts])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!eq) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="font-heading text-lg font-semibold">Equipo no encontrado</h2>
        <Button onClick={() => navigate('/mantenimiento/equipos')} variant="outline" className="mt-4">
          Volver a Equipos
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start gap-2 min-w-0">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/mantenimiento/equipos')} aria-label="Volver" className="mt-0.5">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-xl font-semibold tracking-[-0.01em]">{eq.name}</h1>
            <span className="font-mono text-sm text-muted-foreground">{eq.code}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[eq.status]}`}>
              {STATUS_LABEL[eq.status]}
            </span>
            {eq.kind && <Badge variant="outline" className="text-[10px]">{KIND_LABEL[eq.kind] ?? eq.kind}</Badge>}
          </div>
          <span aria-hidden className="block h-[2px] w-10 rounded-full bg-warning/80 mt-1.5" />
          <p className="text-sm text-muted-foreground mt-1.5">
            {[eq.brand, eq.model, eq.year].filter(Boolean).join(' · ') || 'Sin datos técnicos'}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Wrench}
          label="OTs abiertas"
          value={kpis.open}
          tone={kpis.open > 0 ? 'warning' : 'success'}
          onClick={() => navigate(`/mantenimiento/ordenes?equipo=${eq.id}`)}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cerradas últ. año"
          value={kpis.closedYear}
        />
        <KpiCard
          icon={TrendingDown}
          label="Costo año"
          value={`$${kpis.costYear.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`}
          hint="MXN — parts + labor + externo"
        />
        <KpiCard
          icon={Package}
          label="Refacciones"
          value={kpis.totalParts}
          hint={`$${kpis.partsCost.toLocaleString('es-MX', { minimumFractionDigits: 0 })} acum.`}
        />
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Tabs defaultValue="historial">
          <TabsList>
            <TabsTrigger value="historial">Historial ({workOrders.length})</TabsTrigger>
            <TabsTrigger value="planes">Planes preventivos ({plans.filter((p) => p.is_active).length})</TabsTrigger>
            <TabsTrigger value="refacciones">Refacciones consumidas ({parts.length})</TabsTrigger>
          </TabsList>

          {/* Historial — full list of work orders */}
          <TabsContent value="historial" className="m-0 mt-4">
            {workOrders.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Aún sin órdenes de trabajo registradas para este equipo.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Folio</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo · Prioridad</th>
                      <th className="px-3 py-2 text-left font-medium">Estatus</th>
                      <th className="px-3 py-2 text-left font-medium">Reportada</th>
                      <th className="px-3 py-2 text-right font-medium">Costo MXN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {workOrders.map((wo) => (
                      <tr
                        key={wo.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/mantenimiento/ordenes/${wo.id}`)}
                      >
                        <td className="px-3 py-2 font-mono text-xs font-medium">{wo.folio}</td>
                        <td className="px-3 py-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">{WO_TYPE_LABEL[wo.wo_type]}</Badge>
                          <span className="text-muted-foreground ml-1">· {WO_PRIORITY_LABEL[wo.priority]}</span>
                          {wo.failure_type?.label && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{wo.failure_type.label}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${WO_STATUS_TONE[wo.status]}`}>
                            {WO_STATUS_LABEL[wo.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {format(new Date(wo.reported_at), 'd MMM yyyy', { locale: es })}
                          {wo.primary_technician?.full_name && (
                            <div className="text-[10px] text-muted-foreground">{wo.primary_technician.full_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {wo.total_cost_mxn != null && wo.total_cost_mxn > 0
                            ? `$${wo.total_cost_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                            : <span className="text-muted-foreground/60">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Planes preventivos */}
          <TabsContent value="planes" className="m-0 mt-4">
            {plans.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Sin planes preventivos configurados.
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => navigate('/mantenimiento/planes')}>
                    Ir a planes preventivos
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {plans.map((p) => {
                  const current = p.trigger_type === 'hours' || p.trigger_type === 'usage_hours'
                    ? eq.current_hours
                    : p.trigger_type === 'kilometers'
                    ? eq.current_km
                    : null
                  const diff = current != null ? p.next_execution_value - current : null
                  const isOverdue = diff != null && diff <= 0
                  return (
                    <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`flex size-8 items-center justify-center rounded-md shrink-0 ${
                        !p.is_active ? 'bg-muted text-muted-foreground' :
                        isOverdue ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
                      }`}>
                        <CalendarClock className="size-4" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Cada {p.interval_value.toLocaleString('es-MX')} {p.interval_unit}
                          {!p.is_active && ' · pausado'}
                        </div>
                      </div>
                      <div className={`text-sm font-mono tabular-nums text-right shrink-0 ${
                        isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                      }`}>
                        {diff != null
                          ? (diff <= 0
                              ? `Vencido por ${Math.abs(diff).toLocaleString('es-MX')}`
                              : `Faltan ${diff.toLocaleString('es-MX')}`)
                          : `${p.next_execution_value.toLocaleString('es-MX')} ${p.interval_unit}`}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          {/* Refacciones consumidas */}
          <TabsContent value="refacciones" className="m-0 mt-4">
            {parts.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Aún sin refacciones consumidas en este equipo.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Refacción</th>
                      <th className="px-3 py-2 text-left font-medium">OT</th>
                      <th className="px-3 py-2 text-right font-medium">Cant.</th>
                      <th className="px-3 py-2 text-right font-medium">Costo MXN</th>
                      <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parts.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium">{p.item?.name ?? '—'}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{p.item?.sku}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{p.wo?.folio ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{p.delivered_quantity}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          ${(p.total_cost_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: es })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr className="text-xs">
                      <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-[0.06em] text-muted-foreground font-medium">
                        Total acumulado
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        ${kpis.partsCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Meta sidebar */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Medidores</h3>
            <dl className="space-y-2 text-sm">
              {eq.current_hours != null && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="size-3" strokeWidth={1.75} />
                    Horómetro
                  </dt>
                  <dd className="font-mono tabular-nums">{Number(eq.current_hours).toLocaleString('es-MX')} hrs</dd>
                </div>
              )}
              {eq.current_km != null && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Activity className="size-3" strokeWidth={1.75} />
                    Kilometraje
                  </dt>
                  <dd className="font-mono tabular-nums">{Number(eq.current_km).toLocaleString('es-MX')} km</dd>
                </div>
              )}
              {!eq.current_hours && !eq.current_km && (
                <div className="text-xs text-muted-foreground/70">Sin lecturas registradas.</div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Identificación</h3>
            <dl className="space-y-2.5 text-sm">
              {eq.serial_number && (
                <div className="flex items-start gap-2">
                  <Hash className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Serie</dt>
                    <dd className="font-mono text-xs break-all">{eq.serial_number}</dd>
                  </div>
                </div>
              )}
              {eq.engine_number && (
                <div className="flex items-start gap-2">
                  <Hash className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Motor</dt>
                    <dd className="font-mono text-xs break-all">{eq.engine_number}</dd>
                  </div>
                </div>
              )}
              {eq.plate && (
                <div className="flex items-start gap-2">
                  <FileBadge className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Placa</dt>
                    <dd className="font-mono text-xs">{eq.plate}</dd>
                  </div>
                </div>
              )}
              {eq.location && (
                <div className="flex items-start gap-2">
                  <Tractor className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Ubicación</dt>
                    <dd>{eq.location}</dd>
                  </div>
                </div>
              )}
              {!eq.serial_number && !eq.engine_number && !eq.plate && !eq.location && (
                <div className="text-xs text-muted-foreground/70">Sin datos.</div>
              )}
            </dl>
          </section>

          {(eq.acquisition_date || eq.acquisition_cost_native || eq.insurance_policy) && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Adquisición & seguro</h3>
              <dl className="space-y-2.5 text-sm">
                {eq.acquisition_date && (
                  <div className="flex items-start gap-2">
                    <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Fecha adquisición</dt>
                      <dd>{format(new Date(eq.acquisition_date), 'd MMM yyyy', { locale: es })}</dd>
                    </div>
                  </div>
                )}
                {eq.acquisition_cost_native != null && (
                  <div className="flex items-start gap-2">
                    <TrendingDown className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Costo adquisición</dt>
                      <dd className="font-mono tabular-nums">
                        ${eq.acquisition_cost_native.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {eq.acquisition_currency ?? 'MXN'}
                      </dd>
                    </div>
                  </div>
                )}
                {eq.insurance_policy && (
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <dt className="text-[11px] text-muted-foreground">Póliza</dt>
                      <dd className="font-mono text-xs break-all">{eq.insurance_policy}</dd>
                      {eq.insurance_expires_at && (
                        <dd className="text-[10px] text-muted-foreground mt-0.5">
                          Vence {format(new Date(eq.insurance_expires_at), 'd MMM yyyy', { locale: es })}
                          {new Date(eq.insurance_expires_at) < new Date() && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-destructive">
                              <AlertOctagon className="size-2.5" />
                              vencida
                            </span>
                          )}
                        </dd>
                      )}
                    </div>
                  </div>
                )}
              </dl>
            </section>
          )}

          {eq.responsible?.full_name && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Responsable</h3>
              <p className="text-sm font-medium">{eq.responsible.full_name}</p>
            </section>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/mantenimiento/ordenes?new=1')}
          >
            <Wrench className="size-4" />
            Reportar falla para este equipo
            <ArrowRight className="size-3 ml-auto" />
          </Button>
        </aside>
      </div>
    </div>
  )
}
