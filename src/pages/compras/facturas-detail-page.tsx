/**
 * Facturas detail — vista de las facturas asociadas a una OC.
 *
 * Mirroring del po-detail-page: header con folio + status + acciones,
 * sidebar con info de la OC, listado de invoices en la columna principal.
 * Click "Adjuntar factura" abre el dialog del invoices-page con poContext
 * pre-seteado. Cada invoice muestra fecha, CFDI, monto, links a PDF/XML,
 * acciones Conciliar / Marcar pagada según status.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Building2, Calendar, Paperclip, FileText, ExternalLink,
  CheckCircle2, AlertOctagon, ShoppingCart, Receipt,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatSupabaseError } from '@/lib/errors'
import {
  useReconcileInvoice, useMarkInvoicePaid,
} from '@/features/compras/invoice-hooks'
import type { InvoiceStatus, Currency, POStatus } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/custom/empty-state'

import {
  CreateInvoiceDialog,
  ConfirmReconcileDialog,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
} from './invoices-page'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface PoDetail {
  id: string
  folio: string
  status: POStatus
  supplier_id: string
  total_mxn: number | null
  total_usd: number | null
  issue_date: string
  expected_delivery_date: string | null
  supplier?: { name: string; rfc: string | null } | null
  invoices: Array<{
    id: string
    invoice_folio: string
    issue_date: string
    due_date: string | null
    subtotal: number | null
    tax: number | null
    total: number | null
    currency: Currency
    status: InvoiceStatus
    pdf_url: string | null
    xml_url: string | null
    cfdi_uuid: string | null
    discrepancies: unknown
    notes: string | null
  }>
}

export default function FacturasDetailPage() {
  const { poId } = useParams<{ poId: string }>()
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const canWrite = can('purchase.create')

  const reconcile = useReconcileInvoice()
  const markPaid  = useMarkInvoicePaid()

  const [adjuntarOpen, setAdjuntarOpen] = useState(false)
  const [reconcileTarget, setReconcileTarget] = useState<string | null>(null)

  const { data: po, isLoading } = useQuery<PoDetail | null>({
    queryKey: ['po-with-invoices-detail', { id: poId, orgId: organization?.id }],
    enabled: !!poId && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select(`
          id, folio, status, supplier_id, total_mxn, total_usd,
          issue_date, expected_delivery_date,
          supplier:suppliers(name, rfc),
          invoices:supplier_invoices(
            id, invoice_folio, issue_date, due_date, subtotal, tax, total, currency,
            status, pdf_url, xml_url, cfdi_uuid, discrepancies, notes
          )
        `)
        .eq('id', poId)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any
      return { ...row, invoices: row.invoices ?? [] } as PoDetail
    },
  })

  const invs = useMemo(() => po?.invoices ?? [], [po])
  const totalInvoiced = useMemo(() => invs.reduce((s, i) => s + (i.total ?? 0), 0), [invs])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="font-heading text-lg font-semibold">OC no encontrada</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          La OC que buscas no existe, fue eliminada o no está disponible para facturación.
        </p>
        <Button onClick={() => navigate('/compras/facturas')} variant="outline">
          Volver a Facturas
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/compras/facturas')}
            aria-label="Volver"
            className="mt-0.5"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <h1 className="font-heading text-xl font-semibold tracking-[-0.01em] font-mono">{po.folio}</h1>
              {invs.length === 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/15 text-warning">
                  Sin factura
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/15 text-success">
                  <CheckCircle2 className="size-2.5" />
                  {invs.length} factura{invs.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {po.supplier?.name ?? '—'} · emitida {format(new Date(po.issue_date), 'd MMM yyyy', { locale: es })}
            </p>
          </div>
        </div>

        {canWrite && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAdjuntarOpen(true)}>
            <Paperclip className="size-4" />
            Adjuntar factura
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Lista de facturas */}
        <div className="flex flex-col gap-3">
          {invs.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-8 text-muted-foreground" strokeWidth={1.5} />}
              title="Sin facturas aún"
              description="Cuando el proveedor entregue la factura, adjúntala aquí. Puedes subir PDF + XML del CFDI."
              action={canWrite ? { label: '+ Adjuntar factura', onClick: () => setAdjuntarOpen(true) } : undefined}
            />
          ) : (
            invs.map((inv) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const discrep = inv.discrepancies as any
              const diff    = discrep?.diff as number | undefined
              const diffPct = discrep?.diff_pct as number | undefined
              return (
                <section key={inv.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <header className="px-4 py-3 border-b flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Receipt className="size-3.5 text-muted-foreground" />
                        <span className="font-mono text-sm font-medium">{inv.invoice_folio}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${INVOICE_STATUS_TONE[inv.status]}`}>
                          {inv.status === 'discrepancy' && <AlertOctagon className="size-2.5" strokeWidth={2.5} />}
                          {inv.status === 'reconciled' && <CheckCircle2 className="size-2.5" strokeWidth={2.5} />}
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Emitida {format(new Date(inv.issue_date), 'd MMM yyyy', { locale: es })}
                        {inv.due_date && ` · vence ${formatDistanceToNow(new Date(inv.due_date), { addSuffix: true, locale: es })}`}
                      </p>
                      {inv.cfdi_uuid && (
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
                          CFDI {inv.cfdi_uuid}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold font-mono tabular-nums">
                        {inv.currency === 'USD' ? 'US$' : '$'}
                        {(inv.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inv.currency}
                        {inv.tax != null && ` · IVA $${inv.tax.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                      </div>
                    </div>
                  </header>

                  {inv.status === 'discrepancy' && diff != null && (
                    <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-xs text-destructive flex items-start gap-2">
                      <AlertOctagon className="size-3.5 shrink-0 mt-0.5" />
                      <div>
                        Diferencia de <span className="font-mono tabular-nums font-semibold">
                          {inv.currency === 'USD' ? 'US$' : '$'}{Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                        {diffPct != null && <> ({diffPct.toFixed(2)}%)</>} vs OC.
                        {' '}{diff > 0 ? 'Factura mayor que OC.' : 'Factura menor que OC.'}
                      </div>
                    </div>
                  )}

                  {inv.notes && (
                    <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/20 border-b">
                      <span className="font-medium">Notas:</span> {inv.notes}
                    </div>
                  )}

                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    {inv.pdf_url && (
                      <a
                        href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent text-foreground transition-colors"
                      >
                        <FileText className="size-3" /> PDF <ExternalLink className="size-2.5" />
                      </a>
                    )}
                    {inv.xml_url && (
                      <a
                        href={inv.xml_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent text-foreground transition-colors"
                      >
                        XML <ExternalLink className="size-2.5" />
                      </a>
                    )}
                    {canWrite && inv.status === 'pending' && (
                      <Button
                        size="sm" className="h-7 px-2 text-xs gap-1 ml-auto"
                        onClick={() => setReconcileTarget(inv.id)}
                        disabled={reconcile.isPending}
                      >
                        <CheckCircle2 className="size-3" /> Conciliar
                      </Button>
                    )}
                    {canWrite && inv.status === 'discrepancy' && (
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 ml-auto"
                        onClick={() => setReconcileTarget(inv.id)}
                      >
                        Conciliar igual
                      </Button>
                    )}
                    {canWrite && inv.status === 'reconciled' && (
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 ml-auto"
                        onClick={() => markPaid.mutate(inv.id, {
                          onSuccess: () => toast.success('Marcada como pagada'),
                        })}
                      >
                        Marcar pagada
                      </Button>
                    )}
                  </div>

                  {/* Preview del PDF del proveedor — iframe inline */}
                  {inv.pdf_url ? (
                    <div className="border-t bg-muted/30">
                      <iframe
                        src={inv.pdf_url}
                        title={`Vista previa de factura ${inv.invoice_folio}`}
                        className="w-full h-[65vh] min-h-[420px] bg-card"
                      />
                    </div>
                  ) : (
                    <div className="border-t bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                      Sin archivo PDF adjunto. La factura puede conciliarse igual con los metadatos.
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
              Orden de compra
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Proveedor</dt>
                  <dd className="font-medium truncate">{po.supplier?.name ?? '—'}</dd>
                  {po.supplier?.rfc && (
                    <dd className="text-[10px] font-mono text-muted-foreground">{po.supplier.rfc}</dd>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[11px] text-muted-foreground">Emisión</dt>
                  <dd>{format(new Date(po.issue_date), 'd MMM yyyy', { locale: es })}</dd>
                </div>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
              Resumen
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-xs">OC total</dt>
                <dd className="font-mono tabular-nums font-semibold">
                  ${(po.total_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-xs">Facturado</dt>
                <dd className={`font-mono tabular-nums ${invs.length === 0 ? 'text-muted-foreground' : ''}`}>
                  ${totalInvoiced.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div className="border-t pt-2 mt-1 flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-[11px]">Pendiente</dt>
                <dd className={`font-mono tabular-nums text-xs ${
                  (po.total_mxn ?? 0) - totalInvoiced > 0.01 ? 'text-warning font-medium' : 'text-success'
                }`}>
                  ${((po.total_mxn ?? 0) - totalInvoiced).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>
          </section>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate(`/compras/ordenes/${po.id}`)}
          >
            <ShoppingCart className="size-3.5" />
            Ver OC completa
          </Button>
        </aside>
      </div>

      {/* Adjuntar dialog */}
      {adjuntarOpen && (
        <CreateInvoiceDialog
          open={adjuntarOpen}
          poContext={{
            id: po.id,
            folio: po.folio,
            supplier_id: po.supplier_id,
            supplier_name: po.supplier?.name ?? '—',
            total_mxn: po.total_mxn,
            total_usd: po.total_usd,
          }}
          onClose={() => setAdjuntarOpen(false)}
        />
      )}

      <ConfirmReconcileDialog
        open={!!reconcileTarget}
        onConfirm={(note) => {
          if (!reconcileTarget) return
          reconcile.mutate({ id: reconcileTarget, note }, {
            onSuccess: () => {
              toast.success('Factura conciliada')
              setReconcileTarget(null)
            },
            onError: (e) => {
              const { title, description } = formatSupabaseError(e, 'No se pudo conciliar')
              toast.error(title, { description })
            },
          })
        }}
        onClose={() => setReconcileTarget(null)}
        isPending={reconcile.isPending}
      />
    </div>
  )
}
