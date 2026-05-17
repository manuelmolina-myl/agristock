import { useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Tractor, Clock, Calendar, ShieldCheck, Hash, FileBadge,
  Wrench, AlertOctagon, CalendarClock, ArrowRight,
  Activity, TrendingDown, Timer, Gauge, DollarSign,
  ShieldAlert, Link2, Layers, QrCode, StickyNote, Pencil, Loader2,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { KpiCard } from '@/components/custom/kpi-card'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { useAuth } from '@/hooks/use-auth'
import type { EquipmentStatus, EquipmentKind, WOStatus, WOType, WOPriority } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type Criticality = 'low' | 'medium' | 'high' | 'critical'

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

const CRITICALITY_LABEL: Record<Criticality, string> = {
  low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica',
}
const CRITICALITY_TONE: Record<Criticality, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-border/60 text-foreground',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/15 text-destructive',
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
  parent_id: string | null
  criticality: Criticality
  qr_code: string | null
  notes: string | null
  parent?: { id: string; name: string; code: string } | null
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

interface EquipmentKpiRow {
  equipment_id: string
  organization_id: string
  code: string
  name: string
  type: string | null
  criticality: Criticality
  location: string | null
  total_wos: number
  corrective_wos: number
  preventive_wos: number
  open_wos: number
  last_failure_at: string | null
  preventive_pct: number | null
  mtbf_hours: number | null
  mttr_hours: number | null
  downtime_hours_last_year: number | null
  total_cost_mxn: number | null
  cost_last_year_mxn: number | null
}

interface ChildRow {
  id: string
  code: string
  name: string
  kind: EquipmentKind | null
  status: EquipmentStatus
  criticality: Criticality
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [editOpen, setEditOpen] = useState(false)

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
          is_active, parent_id, criticality, qr_code, notes,
          parent:equipment!equipment_parent_id_fkey(id, name, code)
        `)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as EquipmentFull | null
    },
  })

  const { data: kpiData } = useQuery<EquipmentKpiRow | null>({
    queryKey: ['equipment-kpis', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment_kpis')
        .select('*')
        .eq('equipment_id', id)
        .maybeSingle()
      if (error) throw error
      return data as EquipmentKpiRow | null
    },
  })

  // Last 20 WOs for the work-history table.
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
        .limit(20)
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

  // Child equipment (sub-componentes).
  const { data: children = [] } = useQuery<ChildRow[]>({
    queryKey: ['equipment-children', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name, kind, status, criticality')
        .eq('parent_id', id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return (data ?? []) as ChildRow[]
    },
  })

  // Accumulated parts cost — kept for the refacciones tab footer.
  const partsCost = useMemo(
    () => parts.reduce((acc, p) => acc + (p.total_cost_mxn ?? 0), 0),
    [parts],
  )

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

  // Derived KPI display values.
  const mtbf = kpiData?.mtbf_hours
  const mttr = kpiData?.mttr_hours
  const downtime = kpiData?.downtime_hours_last_year ?? 0
  const costYear = kpiData?.cost_last_year_mxn ?? 0
  const openWos = kpiData?.open_wos ?? 0
  const preventivePct = kpiData?.preventive_pct

  const downtimeTone: 'default' | 'warning' | 'critical' =
    downtime > 200 ? 'critical' : downtime > 100 ? 'warning' : 'default'
  const preventiveTone: 'default' | 'warning' | 'critical' | 'success' =
    preventivePct == null
      ? 'default'
      : preventivePct >= 70
      ? 'success'
      : preventivePct >= 40
      ? 'warning'
      : 'critical'

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
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" />
          Editar
        </Button>
      </div>

      {/* Desempeño operativo — CMMS KPIs from equipment_kpis view */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Desempeño operativo
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KpiCard
            icon={Timer}
            label="MTBF"
            value={mtbf != null ? `${Number(mtbf).toLocaleString('es-MX', { maximumFractionDigits: 1 })} h` : '—'}
            hint="Tiempo promedio entre fallas correctivas"
          />
          <KpiCard
            icon={Gauge}
            label="MTTR"
            value={mttr != null ? `${Number(mttr).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h` : '—'}
            hint="Tiempo promedio de reparación"
          />
          <KpiCard
            icon={Clock}
            label="Downtime (último año)"
            value={`${Number(downtime).toLocaleString('es-MX', { maximumFractionDigits: 1 })} h`}
            tone={downtimeTone}
          />
          <KpiCard
            icon={DollarSign}
            label="Costo (último año)"
            value={`$${Number(costYear).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            hint="MXN"
          />
          <KpiCard
            icon={Wrench}
            label="OTs abiertas"
            value={openWos}
            tone={openWos > 0 ? 'warning' : 'default'}
            onClick={() => navigate(`/mantenimiento/ordenes?equipo=${eq.id}`)}
          />
          <KpiCard
            icon={ShieldCheck}
            label="% Preventivo"
            value={preventivePct != null ? `${Number(preventivePct).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%` : '—'}
            tone={preventiveTone}
            hint={kpiData ? `${kpiData.preventive_wos} prev · ${kpiData.corrective_wos} corr` : undefined}
          />
        </div>
      </section>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Tabs defaultValue="historial">
          <TabsList>
            <TabsTrigger value="historial">Historial ({workOrders.length})</TabsTrigger>
            <TabsTrigger value="planes">Planes preventivos ({plans.filter((p) => p.is_active).length})</TabsTrigger>
            <TabsTrigger value="refacciones">Refacciones consumidas ({parts.length})</TabsTrigger>
          </TabsList>

          {/* Historial — last 20 work orders */}
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
                        onClick={() => navigate(`/mantenimiento/ordenes/${wo.id}`, { state: { from: location.pathname } })}
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
                          <div title={format(new Date(wo.reported_at), 'd MMM yyyy HH:mm', { locale: es })}>
                            {formatDistanceToNow(new Date(wo.reported_at), { addSuffix: true, locale: es })}
                          </div>
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
                        ${partsCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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
          {/* Activo: criticidad + jerarquía + ubicación + QR + notas */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Activo</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <ShieldAlert className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Criticidad</dt>
                  <dd>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium ${CRITICALITY_TONE[eq.criticality]}`}>
                      {CRITICALITY_LABEL[eq.criticality]}
                    </span>
                  </dd>
                </div>
              </div>

              {eq.parent && (
                <div className="flex items-start gap-2">
                  <Link2 className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Parte de</dt>
                    <dd>
                      <button
                        type="button"
                        className="text-sm font-medium text-foreground hover:underline truncate text-left"
                        onClick={() => navigate(`/mantenimiento/equipos/${eq.parent!.id}`)}
                      >
                        {eq.parent.name}
                      </button>
                      <div className="font-mono text-[10px] text-muted-foreground">{eq.parent.code}</div>
                    </dd>
                  </div>
                </div>
              )}

              {eq.location && (
                <div className="flex items-start gap-2">
                  <Tractor className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Ubicación</dt>
                    <dd className="break-words">{eq.location}</dd>
                  </div>
                </div>
              )}

              {eq.qr_code && (
                <div className="flex items-start gap-2">
                  <QrCode className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Código QR</dt>
                    <dd className="font-mono text-xs break-all">{eq.qr_code}</dd>
                  </div>
                </div>
              )}

              {eq.notes && (
                <div className="flex items-start gap-2">
                  <StickyNote className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Notas</dt>
                    <dd className="text-xs whitespace-pre-wrap break-words">{eq.notes}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {/* Sub-componentes (children) */}
          {children.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3 inline-flex items-center gap-1">
                <Layers className="size-3" strokeWidth={1.75} />
                Sub-componentes ({children.length})
              </h3>
              <ul className="space-y-1.5">
                {children.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/mantenimiento/equipos/${c.id}`)}
                      className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{c.code}</div>
                      </div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${CRITICALITY_TONE[c.criticality]}`}>
                        {CRITICALITY_LABEL[c.criticality]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
              {!eq.serial_number && !eq.engine_number && !eq.plate && (
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

      {/* Edit dialog */}
      {editOpen && (
        <EditEquipmentDialog
          equipment={eq}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Edit dialog ─────────────────────────────────────────────────────────────

interface EditEquipmentDialogProps {
  equipment: EquipmentFull
  onClose: () => void
}

function EditEquipmentDialog({ equipment, onClose }: EditEquipmentDialogProps) {
  const qc = useQueryClient()
  const { organization } = useAuth()
  const [parentId, setParentId] = useState<string>(equipment.parent_id ?? '__none__')
  const [criticality, setCriticality] = useState<Criticality>(equipment.criticality)
  const [locationText, setLocationText] = useState(equipment.location ?? '')
  const [notes, setNotes] = useState(equipment.notes ?? '')
  const [qrCode, setQrCode] = useState(equipment.qr_code ?? '')

  const { data: candidates = [] } = useQuery<Array<{ id: string; name: string; code: string }>>({
    queryKey: ['equipment-parent-candidates', organization?.id, equipment.id],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, name, code')
        .is('deleted_at', null)
        .neq('id', equipment.id)
        .order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string; code: string }>
    },
  })

  const update = useMutation({
    mutationFn: async () => {
      const payload = {
        parent_id: parentId === '__none__' ? null : parentId,
        criticality,
        location: locationText.trim() || null,
        notes: notes.trim() || null,
        qr_code: qrCode.trim() || null,
      }
      const { error } = await db.from('equipment').update(payload).eq('id', equipment.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Equipo actualizado')
      qc.invalidateQueries({ queryKey: ['equipment-full', equipment.id] })
      qc.invalidateQueries({ queryKey: ['equipment-kpis', equipment.id] })
      qc.invalidateQueries({ queryKey: ['equipment-children'] })
      qc.invalidateQueries({ queryKey: ['equipment-list'] })
      onClose()
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar')
      toast.error(title, { description })
    },
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar equipo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Equipo padre</Label>
            <Select value={parentId} onValueChange={(v) => setParentId(v ?? '__none__')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Sin padre" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin padre</SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} <span className="text-muted-foreground font-mono text-xs ml-1">{c.code}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Criticidad</Label>
            <Select value={criticality} onValueChange={(v) => setCriticality(v as Criticality)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-location">Ubicación</Label>
            <Input
              id="eq-location"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="Ej. Bodega 1, Lote 3, Taller…"
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-qr">Código QR</Label>
            <Input
              id="eq-qr"
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="Texto / URL del QR"
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eq-notes">Notas</Label>
            <Textarea
              id="eq-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas sobre el equipo…"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancelar</Button>
          <Button onClick={() => update.mutate()} disabled={update.isPending} className="gap-1.5">
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
