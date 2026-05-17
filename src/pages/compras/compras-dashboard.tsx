import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, ClipboardList, FileText, ArrowDownToLine, Receipt,
  AlertOctagon, TrendingUp, Building2, ArrowRight,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/custom/kpi-card'
import { useComprasKpis, useTopSuppliersThisYear } from '@/features/compras/dashboard-hooks'
import { useRequisitions } from '@/features/compras/hooks'

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
}

export default function ComprasDashboard() {
  const navigate = useNavigate()
  const { data: kpis, isLoading } = useComprasKpis()
  const { data: topSuppliers = [], isLoading: loadingSuppliers } = useTopSuppliersThisYear(5)
  const { data: recentReqs = [] } = useRequisitions({ status: 'submitted' })

  if (isLoading || !kpis) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Compras"
        description="Control end-to-end del procurement: solicitudes, cotizaciones, OCs, recepciones y facturas."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/compras/requisiciones?new=1')}>
            <ClipboardList className="size-4" />
            Nueva solicitud
          </Button>
        }
      />

      {/* Top KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={ClipboardList}
          label="Solicitudes nuevas"
          value={kpis.requisitions.submitted}
          hint="Esperando revisión"
          tone={kpis.requisitions.submitted > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/compras/requisiciones?status=submitted')}
        />
        <KpiCard
          icon={FileText}
          label="En cotización"
          value={kpis.requisitions.in_quotation}
          hint="Pidiendo precios"
          onClick={() => navigate('/compras/requisiciones?status=in_quotation')}
        />
        <KpiCard
          icon={ShoppingCart}
          label="OCs por recibir"
          value={kpis.orders.awaiting_reception + kpis.orders.partially_received}
          hint={`${kpis.orders.partially_received} parciales`}
          onClick={() => navigate('/compras/ordenes?status=sent')}
        />
        <KpiCard
          icon={AlertOctagon}
          label="OCs atrasadas"
          value={kpis.orders.overdue}
          hint="Pasaron fecha esperada"
          tone={kpis.orders.overdue > 0 ? 'critical' : 'default'}
          onClick={() => navigate('/compras/ordenes?status=sent')}
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Receipt}
          label="Facturas pendientes"
          value={kpis.invoices.pending}
          hint="Por conciliar"
          tone={kpis.invoices.pending > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/compras/facturas?status=pending')}
        />
        <KpiCard
          icon={AlertOctagon}
          label="Con discrepancia"
          value={kpis.invoices.with_discrepancy}
          hint="OC vs factura"
          tone={kpis.invoices.with_discrepancy > 0 ? 'critical' : 'default'}
          onClick={() => navigate('/compras/facturas?status=discrepancy')}
        />
        <KpiCard
          icon={TrendingUp}
          label="Gasto del mes"
          value={fmtMoney(kpis.spend_month_mxn)}
          hint="OCs emitidas (MXN)"
        />
        <KpiCard
          icon={ArrowDownToLine}
          label="Valor abierto"
          value={fmtMoney(kpis.open_value_mxn)}
          hint="OCs sin cerrar"
        />
      </div>

      {/* Two-column lower section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top suppliers */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Top proveedores este año</h3>
            </div>
            <button
              onClick={() => navigate('/compras/proveedores')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todos <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingSuppliers ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : topSuppliers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aún sin gasto registrado este año.
              </div>
            ) : (
              topSuppliers.map((s) => (
                <div key={s.supplier_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.supplier_name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.po_count} {s.po_count === 1 ? 'OC' : 'OCs'}</div>
                  </div>
                  <div className="text-sm font-mono tabular-nums shrink-0">
                    {fmtMoney(s.total_mxn)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent submitted requisitions awaiting action */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Solicitudes para revisar</h3>
            </div>
            <button
              onClick={() => navigate('/compras/requisiciones?status=submitted')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todas <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {recentReqs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay solicitudes pendientes. Buen trabajo.
              </div>
            ) : (
              recentReqs.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/compras/requisiciones/${r.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{r.folio}</span>
                      {r.priority === 'urgent' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-medium">URGENTE</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {r.requester?.full_name ?? '—'}
                      {r.equipment?.name && ` · ${r.equipment.name}`}
                      {r.crop_lot?.name && ` · ${r.crop_lot.name}`}
                    </div>
                  </div>
                  {r.estimated_total_mxn != null && (
                    <div className="text-xs font-mono tabular-nums shrink-0 text-muted-foreground">
                      {fmtMoney(r.estimated_total_mxn)}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
