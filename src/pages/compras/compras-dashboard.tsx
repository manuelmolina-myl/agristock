import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, ClipboardList, FileText, Receipt,
  AlertOctagon, TrendingUp, Building2, ArrowRight, PenLine,
  CalendarClock, CheckCircle2, PackageOpen, Wallet,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/custom/kpi-card'
import {
  useComprasKpis,
  useTopSuppliersThisMonth,
  usePaymentsKpis,
  usePendingReceptions,
  usePendingSignaturePOs,
} from '@/features/compras/dashboard-hooks'
import { useRequisitions } from '@/features/compras/hooks'
import { useAuth } from '@/hooks/use-auth'

function fmtMoney(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 10_000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
}

const PO_STATUS_LABEL: Record<string, string> = {
  sent: 'Enviada',
  confirmed: 'Confirmada',
  partially_received: 'Parcial',
}

export default function ComprasDashboard() {
  const navigate = useNavigate()
  const { roles } = useAuth()
  const isAdmin = roles.includes('admin')

  const { data: kpis, isLoading: loadingKpis } = useComprasKpis()
  const { data: payments, isLoading: loadingPayments } = usePaymentsKpis()
  const { data: topSuppliers = [], isLoading: loadingSuppliers } = useTopSuppliersThisMonth(5)
  const { data: pendingReceptions = [], isLoading: loadingReceptions } = usePendingReceptions(5)
  const { data: pendingSignature = [], isLoading: loadingSignature } = usePendingSignaturePOs(isAdmin, 5)
  const { data: recentReqs = [] } = useRequisitions({ status: 'submitted' })

  const spendMonth = kpis?.spend_month_mxn ?? 0
  const submittedCount = kpis?.requisitions.submitted ?? 0
  const pendingSignatureCount = pendingSignature.length

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

      {/* ─── Top KPI row (4) ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Gasto del mes"
          value={fmtMoney(spendMonth)}
          hint="OCs emitidas (MXN)"
          isLoading={loadingKpis}
          onClick={() => navigate('/compras/ordenes')}
        />
        <KpiCard
          icon={ClipboardList}
          label="Solicitudes pendientes"
          value={submittedCount}
          hint="Esperando revisión"
          tone={submittedCount > 3 ? 'warning' : 'default'}
          isLoading={loadingKpis}
          onClick={() => navigate('/compras/requisiciones?status=submitted')}
        />
        <KpiCard
          icon={PenLine}
          label="OCs pendientes de firma"
          value={pendingSignatureCount}
          hint={pendingSignatureCount > 0 ? 'Esperando aprobación' : 'Sin pendientes'}
          tone={pendingSignatureCount > 0 ? 'warning' : 'default'}
          isLoading={loadingSignature}
          onClick={() => navigate('/compras/ordenes?status=pending_signature')}
        />
        <KpiCard
          icon={AlertOctagon}
          label="Por pagar (vencidas)"
          value={fmtMoney(payments?.overdue_total ?? 0)}
          hint={
            payments && payments.overdue_count > 0
              ? `${payments.overdue_count} factura(s) vencida(s)`
              : 'Al corriente'
          }
          tone={(payments?.overdue_total ?? 0) > 0 ? 'critical' : 'success'}
          isLoading={loadingPayments}
          onClick={() => navigate('/compras/facturas')}
        />
      </div>

      {/* ─── Secondary KPI row (4) ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CalendarClock}
          label="Por vencer (≤ 7 días)"
          value={fmtMoney(payments?.due_soon_total ?? 0)}
          hint={
            payments && payments.due_soon_count > 0
              ? `${payments.due_soon_count} factura(s)`
              : 'Sin vencimientos próximos'
          }
          tone={(payments?.due_soon_count ?? 0) > 0 ? 'warning' : 'default'}
          isLoading={loadingPayments}
          onClick={() => navigate('/compras/facturas')}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Pagado este mes"
          value={fmtMoney(payments?.paid_this_month_total ?? 0)}
          hint={
            payments && payments.paid_this_month_count > 0
              ? `${payments.paid_this_month_count} factura(s) liquidada(s)`
              : 'Aún sin pagos'
          }
          tone="success"
          isLoading={loadingPayments}
          onClick={() => navigate('/compras/facturas?status=paid')}
        />
        <KpiCard
          icon={ShoppingCart}
          label="OCs por recibir"
          value={(kpis?.orders.awaiting_reception ?? 0) + (kpis?.orders.partially_received ?? 0)}
          hint={`${kpis?.orders.partially_received ?? 0} parcial(es)`}
          isLoading={loadingKpis}
          onClick={() => navigate('/compras/ordenes?status=sent')}
        />
        <KpiCard
          icon={Receipt}
          label="Facturas con discrepancia"
          value={kpis?.invoices.with_discrepancy ?? 0}
          hint="OC vs factura"
          tone={(kpis?.invoices.with_discrepancy ?? 0) > 0 ? 'critical' : 'default'}
          isLoading={loadingKpis}
          onClick={() => navigate('/compras/facturas?status=discrepancy')}
        />
      </div>

      {/* ─── Bandeja de aprobación (admin only) ───────────────────────── */}
      {isAdmin && (
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <PenLine className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Bandeja de aprobación</h3>
              {pendingSignatureCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold tabular-nums">
                  {pendingSignatureCount}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/compras/ordenes?status=pending_signature')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ver todas <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingSignature ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : pendingSignature.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay OCs esperando firma.
              </div>
            ) : (
              pendingSignature.map((po) => (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => navigate(`/compras/ordenes/${po.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{po.folio}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                        Firma pendiente
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {po.supplier_name} · emitida {po.issue_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-mono tabular-nums">{fmtMoney(po.total_mxn)}</div>
                    <span className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                      Ir a firmar <ArrowRight className="size-3" />
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {/* ─── Two-column lower section: Top suppliers + Pending receptions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top suppliers (this month) */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Top proveedores este mes</h3>
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
                Aún sin gasto registrado este mes.
              </div>
            ) : (
              topSuppliers.map((s) => (
                <button
                  key={s.supplier_id}
                  type="button"
                  onClick={() => navigate(`/compras/proveedores/${s.supplier_id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.supplier_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.po_count} {s.po_count === 1 ? 'OC' : 'OCs'}
                    </div>
                  </div>
                  <div className="text-sm font-mono tabular-nums shrink-0">
                    {fmtMoney(s.total_mxn)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Pending receptions */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <PackageOpen className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold">Recepciones pendientes</h3>
              {pendingReceptions.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold tabular-nums">
                  {pendingReceptions.length}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/compras/recepciones')}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Ir a recepciones <ArrowRight className="size-3" />
            </button>
          </header>
          <div className="divide-y">
            {loadingReceptions ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
              ))
            ) : pendingReceptions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin OCs por recibir.
              </div>
            ) : (
              pendingReceptions.map((po) => (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => navigate(`/compras/ordenes/${po.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{po.folio}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {PO_STATUS_LABEL[po.status] ?? po.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {po.supplier_name}
                      {po.expected_delivery_date && ` · entrega ${po.expected_delivery_date}`}
                    </div>
                  </div>
                  <div className="text-sm font-mono tabular-nums shrink-0">
                    {fmtMoney(po.total_mxn)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ─── Actividad reciente: requisitions awaiting action ──────────── */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">Actividad reciente</h3>
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
            <div className="px-4 py-8 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
              <Wallet className="size-4" />
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">URGENTE</span>
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
  )
}
