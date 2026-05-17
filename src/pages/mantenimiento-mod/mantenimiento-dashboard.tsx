import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wrench, AlertOctagon, CheckCircle2, TrendingDown,
  Tractor, ArrowRight, CalendarClock, Plus, AlertTriangle,
  Inbox, Gauge, Activity, Wallet, Timer, FileWarning,
  Sparkles, Loader2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { KpiCard, type KpiTone } from '@/components/custom/kpi-card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatSupabaseError } from '@/lib/errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

function fmtMoney(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 10_000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
}

// ───────────────────────── Types ─────────────────────────────────────────────

interface DashboardKpis {
  open_wos: number
  open_critical_wos: number
  overdue_wos: number
  wos_completed_this_month: number
  pm_compliance_pct: number | null
  avg_mttr_hours: number | null
  downtime_hours_this_month: number | null
  cost_this_month_mxn: number | null
  open_service_requests: number
}

type ServiceRequestStatus = 'open' | 'triaged' | 'converted' | 'duplicate' | 'rejected'
type Urgency = 'low' | 'medium' | 'high' | 'critical'

interface ServiceRequestRow {
  id: string
  folio: string
  reported_at: string
  status: ServiceRequestStatus
  urgency: Urgency
  description: string
  equipment_id: string | null
  reported_by: string | null
  equipment: { code: string; name: string } | null
  reporter: { full_name: string | null } | null
}

interface WoOverdueRow {
  id: string
  folio: string
  equipment_id: string
  equipment_code: string
  equipment_name: string
  scheduled_date: string
  days_overdue: number
  priority: Urgency
  wo_type: string
}

interface TopFailureRow {
  equipment_id: string
  equipment_code: string
  equipment_name: string
  failures: number
}

interface UpcomingPmRow {
  id: string
  folio: string
  equipment_id: string
  scheduled_date: string
  status: string
  equipment: { code: string; name: string } | null
}

interface DuePmRow {
  plan_id: string
  plan_name: string
  equipment_id: string
  equipment_code: string
  equipment_name: string
  trigger_type: 'calendar' | 'hours' | 'kilometers' | 'cycles' | string
  current_value: number | null
  next_execution: number | null
  due_by: string | null
  has_open_wo: boolean
}

// ───────────────────────── Hooks ─────────────────────────────────────────────

function useMaintenanceKpis() {
  const { organization } = useAuth()
  return useQuery<DashboardKpis>({
    queryKey: ['mantto-dashboard-kpis', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('maintenance_dashboard_kpis')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row ?? {
        open_wos: 0,
        open_critical_wos: 0,
        overdue_wos: 0,
        wos_completed_this_month: 0,
        pm_compliance_pct: null,
        avg_mttr_hours: null,
        downtime_hours_this_month: null,
        cost_this_month_mxn: null,
        open_service_requests: 0,
      }) as DashboardKpis
    },
  })
}

function usePendingServiceRequests(limit = 10) {
  const { organization } = useAuth()
  return useQuery<ServiceRequestRow[]>({
    queryKey: ['mantto-pending-service-requests', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('service_requests')
        .select(`
          id, folio, reported_at, status, urgency, description,
          equipment_id, reported_by,
          equipment:equipment!service_requests_equipment_id_fkey(code, name),
          reporter:profiles!service_requests_reported_by_fkey(full_name)
        `)
        .in('status', ['open', 'triaged'])
        .is('deleted_at', null)
        .order('reported_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as ServiceRequestRow[]
    },
  })
}

function useOverdueWorkOrders(limit = 10) {
  const { organization } = useAuth()
  return useQuery<WoOverdueRow[]>({
    queryKey: ['mantto-wo-overdue', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('wo_overdue')
        .select('id, folio, equipment_id, equipment_code, equipment_name, scheduled_date, days_overdue, priority, wo_type')
        .order('days_overdue', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as WoOverdueRow[]
    },
  })
}

function useTopFailingEquipment(limit = 5) {
  const { organization } = useAuth()
  return useQuery<TopFailureRow[]>({
    queryKey: ['mantto-top-failures-90d', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const { data, error } = await db
        .from('work_orders')
        .select(`
          equipment_id,
          equipment:equipment!work_orders_equipment_id_fkey(code, name)
        `)
        .eq('wo_type', 'corrective')
        .is('deleted_at', null)
        .gte('reported_at', cutoff.toISOString())
        .limit(2000)
      if (error) throw error

      const rows = (data ?? []) as Array<{
        equipment_id: string
        equipment: { code: string; name: string } | null
      }>

      const counts = new Map<string, TopFailureRow>()
      for (const r of rows) {
        if (!r.equipment_id) continue
        const cur = counts.get(r.equipment_id)
        if (cur) {
          cur.failures += 1
        } else {
          counts.set(r.equipment_id, {
            equipment_id: r.equipment_id,
            equipment_code: r.equipment?.code ?? '',
            equipment_name: r.equipment?.name ?? 'Sin nombre',
            failures: 1,
          })
        }
      }
      return [...counts.values()]
        .sort((a, b) => b.failures - a.failures)
        .slice(0, limit)
    },
  })
}

function useUpcomingPMs(limit = 10) {
  const { organization } = useAuth()
  return useQuery<UpcomingPmRow[]>({
    queryKey: ['mantto-upcoming-pms', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date()
      const horizon = new Date()
      horizon.setDate(horizon.getDate() + 30)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      const { data, error } = await db
        .from('work_orders')
        .select(`
          id, folio, equipment_id, scheduled_date, status,
          equipment:equipment!work_orders_equipment_id_fkey(code, name)
        `)
        .eq('wo_type', 'preventive')
        .gte('scheduled_date', fmt(today))
        .lte('scheduled_date', fmt(horizon))
        .not('status', 'in', '(completed,closed,cancelled)')
        .is('deleted_at', null)
        .order('scheduled_date', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as UpcomingPmRow[]
    },
  })
}

function useDuePMs() {
  const { organization } = useAuth()
  return useQuery<DuePmRow[]>({
    queryKey: ['pms-due', organization?.id],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('list_due_pms')
      if (error) throw error
      return (data ?? []) as DuePmRow[]
    },
  })
}

// ───────────────────────── Helpers ───────────────────────────────────────────

const URGENCY_LABEL: Record<Urgency, string> = {
  low: 'Baja', medium: 'Normal', high: 'Alta', critical: 'Crítica',
}
const URGENCY_TONE: Record<Urgency, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-usd/15 text-usd',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

function pmComplianceTone(pct: number | null): KpiTone {
  if (pct == null) return 'default'
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'
  return 'critical'
}

function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

const TRIGGER_LABEL: Record<string, string> = {
  calendar: 'calendario',
  hours: 'horas',
  kilometers: 'km',
  cycles: 'ciclos',
}

function describePmTrigger(row: DuePmRow): string {
  if (row.trigger_type === 'calendar' && row.due_by) {
    const days = daysFromToday(row.due_by)
    if (days === 0) return 'calendario: vence hoy'
    if (days === 1) return 'calendario: mañana'
    if (days < 0) return `calendario: ${Math.abs(days)} día(s) tarde`
    return `calendario: en ${days} días`
  }
  const label = TRIGGER_LABEL[row.trigger_type] ?? row.trigger_type
  const cur = row.current_value
  const next = row.next_execution
  if (cur != null && next != null) {
    return `${label}: ${Number(cur).toLocaleString('es-MX')} / próximo ${Number(next).toLocaleString('es-MX')}`
  }
  if (next != null) return `${label}: próximo ${Number(next).toLocaleString('es-MX')}`
  return label
}

// ───────────────────────── Component ─────────────────────────────────────────

export default function MantenimientoDashboard() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { hasAnyRole } = usePermissions()
  const qc = useQueryClient()
  const canGeneratePMs = hasAnyRole(['admin', 'mantenimiento'])
  const [generateOpen, setGenerateOpen] = useState(false)

  const { data: kpis, isLoading: loadingKpis, error: kpisError } = useMaintenanceKpis()
  const { data: requests = [], isLoading: loadingRequests } = usePendingServiceRequests(10)
  const { data: overdue = [], isLoading: loadingOverdue } = useOverdueWorkOrders(10)
  const { data: topFailures = [], isLoading: loadingFailures } = useTopFailingEquipment(5)
  const { data: upcomingPMs = [], isLoading: loadingPMs } = useUpcomingPMs(10)
  const { data: duePMs = [], isLoading: loadingDuePMs } = useDuePMs()

  const generateMutation = useMutation<{ generated_count: number; plan_ids: string[] }, unknown>({
    mutationFn: async () => {
      const { data, error } = await db.rpc('generate_due_pms', { p_dry_run: false })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return {
        generated_count: row?.generated_count ?? 0,
        plan_ids: row?.plan_ids ?? [],
      }
    },
    onSuccess: (res) => {
      const n = res.generated_count ?? 0
      if (n > 0) {
        toast.success(`${n} OT${n === 1 ? '' : 's'} generada${n === 1 ? '' : 's'}`, {
          description: 'Las OTs preventivas se crearon en estado Programada.',
        })
      } else {
        toast.info('No se generaron OTs nuevas', {
          description: 'No hay planes vencidos pendientes o ya tienen OT abierta.',
        })
      }
      qc.invalidateQueries({ queryKey: ['pms-due', organization?.id] })
      qc.invalidateQueries({ queryKey: ['cmms'] })
      qc.invalidateQueries({ queryKey: ['mantto-dashboard-kpis', organization?.id] })
      qc.invalidateQueries({ queryKey: ['mantto-upcoming-pms', organization?.id] })
      setGenerateOpen(false)
      if (n > 0) navigate('/mantenimiento/ordenes')
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudieron generar las OTs')
      toast.error(title, { description })
    },
  })

  const pendingDueCount = duePMs.filter((r) => !r.has_open_wo).length

  if (!organization?.id) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }

  const openWos          = kpis?.open_wos ?? 0
  const criticalWos      = kpis?.open_critical_wos ?? 0
  const overdueCount     = kpis?.overdue_wos ?? 0
  const pmCompliance     = kpis?.pm_compliance_pct ?? null
  const avgMttr          = kpis?.avg_mttr_hours ?? null
  const costMonth        = kpis?.cost_this_month_mxn ?? 0
  const pendingRequests  = kpis?.open_service_requests ?? 0
  const downtimeMonth    = kpis?.downtime_hours_this_month ?? null
  const completedMonth   = kpis?.wos_completed_this_month ?? 0

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Mantenimiento"
        description="Estado de la flotilla, OTs abiertas, cumplimiento de preventivos y costos."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/mantenimiento/ordenes?new=1')}>
            <Plus className="size-4" />
            Reportar falla
          </Button>
        }
      />

      {kpisError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div className="font-medium">No se pudieron cargar los KPIs.</div>
          <div className="text-xs mt-0.5 opacity-80">{formatSupabaseError(kpisError).description}</div>
        </div>
      )}

      {/* ─── Top KPI row (4) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Wrench}
          label="OTs abiertas"
          value={openWos}
          hint="Sin completar/cerrar"
          isLoading={loadingKpis}
          onClick={() => navigate('/mantenimiento/ordenes?status=open')}
        />
        <KpiCard
          icon={AlertOctagon}
          label="OTs críticas"
          value={criticalWos}
          hint="Equipo crítico o prioridad crítica"
          tone={criticalWos > 0 ? 'critical' : 'default'}
          isLoading={loadingKpis}
          onClick={() => navigate('/mantenimiento/ordenes?priority=critical')}
        />
        <KpiCard
          icon={AlertTriangle}
          label="OTs vencidas"
          value={overdueCount}
          hint={overdueCount > 0 ? 'Programadas con fecha pasada' : 'Sin atrasos'}
          tone={overdueCount > 0 ? 'warning' : 'default'}
          isLoading={loadingKpis}
          onClick={() => navigate('/mantenimiento/ordenes?status=overdue')}
        />
        <KpiCard
          icon={Gauge}
          label="PM compliance"
          value={pmCompliance == null ? '—' : `${pmCompliance}%`}
          hint="Preventivos a tiempo (mes)"
          tone={pmComplianceTone(pmCompliance)}
          isLoading={loadingKpis}
          onClick={() => navigate('/mantenimiento/planes')}
        />
      </div>

      {/* ─── Secondary KPI row (4) ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Timer}
          label="MTTR (90 días)"
          value={avgMttr == null ? '—' : `${Number(avgMttr).toFixed(1)} h`}
          hint="Promedio por reparación"
          isLoading={loadingKpis}
        />
        <KpiCard
          icon={Activity}
          label="Downtime del mes"
          value={downtimeMonth == null ? '—' : `${Number(downtimeMonth).toFixed(1)} h`}
          hint={`${completedMonth} OT(s) completadas`}
          isLoading={loadingKpis}
        />
        <KpiCard
          icon={Wallet}
          label="Costo del mes"
          value={fmtMoney(costMonth)}
          hint="OTs completadas (MXN)"
          isLoading={loadingKpis}
        />
        <KpiCard
          icon={Inbox}
          label="Solicitudes pendientes"
          value={pendingRequests}
          hint={pendingRequests > 0 ? 'Esperando triage' : 'Sin pendientes'}
          tone={pendingRequests > 0 ? 'warning' : 'default'}
          isLoading={loadingKpis}
          onClick={() => navigate('/mantenimiento/solicitudes')}
        />
      </div>

      {/* ─── Bandeja de triage (Service Requests pendientes) ───────────── */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">Bandeja de triage</h3>
            {requests.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                {requests.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/mantenimiento/solicitudes')}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            Ver todas <ArrowRight className="size-3" />
          </button>
        </header>
        <div className="divide-y">
          {loadingRequests ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
            ))
          ) : requests.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="size-5 text-success/70" strokeWidth={1.75} />
              Sin solicitudes pendientes.
            </div>
          ) : (
            requests.map((sr) => (
              <button
                key={sr.id}
                type="button"
                onClick={() => navigate(`/mantenimiento/solicitudes/${sr.id}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-medium">{sr.folio}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${URGENCY_TONE[sr.urgency]}`}>
                      {URGENCY_LABEL[sr.urgency]}
                    </span>
                    {sr.status === 'triaged' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        Triagada
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {sr.equipment
                      ? `${sr.equipment.code} — ${sr.equipment.name}`
                      : 'Sin equipo asignado'}
                    {sr.reporter?.full_name && ` · ${sr.reporter.full_name}`}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(sr.reported_at), { addSuffix: true, locale: es })}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ─── Two-column: Overdue WOs + Top failing equipment ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Overdue WOs */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">OTs vencidas</h3>
              {overdue.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                  {overdue.length}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/mantenimiento/ordenes?status=overdue')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todas <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingOverdue ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : overdue.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="size-5 text-success/70" strokeWidth={1.75} />
                Sin OTs vencidas. Buen trabajo.
              </div>
            ) : (
              overdue.map((wo) => (
                <button
                  key={wo.id}
                  type="button"
                  onClick={() => navigate(`/mantenimiento/ordenes/${wo.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{wo.folio}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium tabular-nums">
                        {wo.days_overdue}d
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {wo.equipment_code} — {wo.equipment_name}
                      {wo.scheduled_date && ` · programada ${wo.scheduled_date}`}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Top failing equipment (last 90 days) */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Top equipos con más fallas (90 días)</h3>
            </div>
            <button
              onClick={() => navigate('/mantenimiento/equipos')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todos <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingFailures ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : topFailures.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Tractor className="size-5 text-muted-foreground/60" strokeWidth={1.75} />
                Sin fallas registradas en los últimos 90 días.
              </div>
            ) : (
              topFailures.map((eq) => (
                <button
                  key={eq.equipment_id}
                  type="button"
                  onClick={() => navigate(`/mantenimiento/equipos/${eq.equipment_id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Tractor className="size-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{eq.equipment_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{eq.equipment_code}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono tabular-nums">
                      {eq.failures} {eq.failures === 1 ? 'falla' : 'fallas'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ─── PMs por generar ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">PMs por generar</h3>
            {duePMs.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                {duePMs.length}
              </span>
            )}
          </div>
          {canGeneratePMs && pendingDueCount > 0 && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setGenerateOpen(true)}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <Sparkles className="size-4" />}
              Generar OTs preventivas
            </Button>
          )}
        </header>
        <div className="divide-y">
          {loadingDuePMs ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
            ))
          ) : duePMs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="size-5 text-success/70" strokeWidth={1.75} />
              Todo al día. Sin planes vencidos.
            </div>
          ) : (
            <>
              {duePMs.slice(0, 5).map((row) => (
                <div
                  key={`${row.plan_id}-${row.equipment_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{row.plan_name}</span>
                      {row.has_open_wo && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          Ya tiene OT abierta
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {row.equipment_code} — {row.equipment_name}
                      <span className="mx-1">·</span>
                      <span className="text-warning">{describePmTrigger(row)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {duePMs.length > 5 && (
                <button
                  type="button"
                  onClick={() => navigate('/mantenimiento/planes')}
                  className="w-full flex items-center justify-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  Ver todos ({duePMs.length}) <ArrowRight className="size-3" />
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* ─── Upcoming PMs (próximos 30 días) ────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">PMs próximos (próximos 30 días)</h3>
            {upcomingPMs.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold tabular-nums">
                {upcomingPMs.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/mantenimiento/planes')}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            Plan preventivo <ArrowRight className="size-3" />
          </button>
        </header>
        <div className="divide-y">
          {loadingPMs ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
            ))
          ) : upcomingPMs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <FileWarning className="size-5 text-muted-foreground/60" strokeWidth={1.75} />
              Sin PMs programados en los próximos 30 días.
            </div>
          ) : (
            upcomingPMs.map((pm) => {
              const days = daysFromToday(pm.scheduled_date)
              const daysLabel =
                days === 0 ? 'hoy'
                  : days === 1 ? 'mañana'
                    : days < 0 ? `${Math.abs(days)} días tarde`
                      : `en ${days} días`
              const daysTone =
                days <= 3 ? 'bg-warning/15 text-warning'
                  : 'bg-muted text-muted-foreground'
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => navigate(`/mantenimiento/ordenes/${pm.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{pm.folio}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${daysTone}`}>
                        {daysLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {pm.equipment
                        ? `${pm.equipment.code} — ${pm.equipment.name}`
                        : 'Sin equipo'}
                      {` · ${pm.scheduled_date}`}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>

      <AlertDialog open={generateOpen} onOpenChange={(o) => { if (!o) setGenerateOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generar OTs preventivas</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán {pendingDueCount} OT{pendingDueCount === 1 ? '' : 's'} preventiva{pendingDueCount === 1 ? '' : 's'} con estado Programada. Las que ya tengan OT abierta se omiten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generateMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); generateMutation.mutate() }}
              disabled={generateMutation.isPending}
              className="gap-1.5"
            >
              {generateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Generar {pendingDueCount} OT{pendingDueCount === 1 ? '' : 's'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
