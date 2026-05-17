import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  Wrench, AlertOctagon, Clock, CheckCircle2, TrendingDown,
  Tractor, ArrowRight, CalendarClock, Plus,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/custom/kpi-card'
import { useWorkOrders } from '@/features/mantenimiento/hooks'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString('es-MX')}`
}

interface MaintHistoryRow {
  equipment_id: string
  equipment_code: string
  equipment_name: string
  corrective_count: number
  preventive_count: number
  open_count: number
  mttr_hours: number | null
  total_cost_mxn_last_year: number | null
}

export default function MantenimientoDashboard() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { data: allWOs = [], isLoading } = useWorkOrders({})

  // Top costly equipment (current calendar year)
  const { data: history = [], isLoading: loadingHist } = useQuery<MaintHistoryRow[]>({
    queryKey: ['mv-maintenance-history', organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('mv_maintenance_history')
        .select('equipment_id, equipment_code, equipment_name, corrective_count, preventive_count, open_count, mttr_hours, total_cost_mxn_last_year')
        .order('total_cost_mxn_last_year', { ascending: false, nullsFirst: false })
        .limit(5)
      if (error) throw error
      return (data ?? []) as MaintHistoryRow[]
    },
  })

  const kpis = useMemo(() => {
    const open = allWOs.filter((w) => !['closed', 'cancelled'].includes(w.status))
    return {
      open: open.length,
      critical: open.filter((w) => w.priority === 'critical').length,
      waitingParts: open.filter((w) => w.status === 'waiting_parts').length,
      completedToday: allWOs.filter((w) =>
        w.status === 'completed'
        && w.completed_at
        && new Date(w.completed_at).toDateString() === new Date().toDateString(),
      ).length,
    }
  }, [allWOs])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Mantenimiento"
        description="Estado de la flotilla, órdenes de trabajo abiertas y planes preventivos."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/mantenimiento/ordenes?new=1')}>
            <Plus className="size-4" />
            Reportar falla
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Wrench}
          label="OTs abiertas"
          value={kpis.open}
          onClick={() => navigate('/mantenimiento/ordenes')}
        />
        <KpiCard
          icon={AlertOctagon}
          label="Críticas"
          value={kpis.critical}
          hint="Equipo parado"
          tone={kpis.critical > 0 ? 'critical' : 'default'}
        />
        <KpiCard
          icon={Clock}
          label="Esperando refacción"
          value={kpis.waitingParts}
          tone={kpis.waitingParts > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cerradas hoy"
          value={kpis.completedToday}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top costly equipment */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Equipos con más costo (12 meses)</h3>
            </div>
            <button
              onClick={() => navigate('/mantenimiento/equipos')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todos <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingHist ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : history.length === 0 || history.every((h) => !h.total_cost_mxn_last_year) ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aún sin OTs cerradas en el último año.
              </div>
            ) : (
              history.map((eq) => (
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
                    <div className="text-sm font-mono tabular-nums">{fmtMoney(eq.total_cost_mxn_last_year ?? 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{eq.corrective_count} corr · {eq.preventive_count} prev</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Open critical / urgent */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Urgentes y de alta prioridad</h3>
            </div>
            <button
              onClick={() => navigate('/mantenimiento/ordenes')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Tablero <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {(() => {
              const urgent = allWOs.filter((w) =>
                !['closed', 'cancelled'].includes(w.status)
                && (w.priority === 'critical' || w.priority === 'high'),
              ).slice(0, 5)
              if (urgent.length === 0) {
                return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nada urgente. 👍</div>
              }
              return urgent.map((wo) => (
                <button
                  key={wo.id}
                  type="button"
                  onClick={() => navigate(`/mantenimiento/ordenes/${wo.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{wo.folio}</span>
                      {wo.priority === 'critical' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-medium">CRÍTICA</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {wo.equipment?.code} — {wo.equipment?.name}
                    </div>
                  </div>
                </button>
              ))
            })()}
          </div>
        </section>
      </div>
    </div>
  )
}
