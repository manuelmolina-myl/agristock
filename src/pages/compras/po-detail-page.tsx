import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Calendar, Warehouse as WarehouseIcon, ArrowDownToLine,
  AlertCircle, CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { usePurchaseOrder } from '@/features/compras/hooks'
import { usePermissions } from '@/hooks/use-permissions'
import type { POStatus } from '@/lib/database.types'

import { ReceptionWizard } from './reception-wizard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Borrador', sent: 'Enviada', confirmed: 'Confirmada',
  partially_received: 'Parcialmente recibida', received: 'Recibida',
  closed: 'Cerrada', cancelled: 'Cancelada',
}

const STATUS_TONE: Record<POStatus, string> = {
  draft:              'bg-muted text-muted-foreground',
  sent:               'bg-usd/15 text-usd',
  confirmed:          'bg-usd/15 text-usd',
  partially_received: 'bg-warning/15 text-warning',
  received:           'bg-success/15 text-success',
  closed:             'bg-success/10 text-success/80',
  cancelled:          'bg-destructive/15 text-destructive',
}

const STATUS_ICON: Record<POStatus, React.ElementType> = {
  draft: Clock, sent: ArrowDownToLine, confirmed: CheckCircle2,
  partially_received: AlertCircle, received: CheckCircle2,
  closed: CheckCircle2, cancelled: XCircle,
}

export default function PoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const { data: po, isLoading } = usePurchaseOrder(id)
  const [wizardOpen, setWizardOpen] = useState(false)

  // Existing receptions for this PO (for the timeline).
  const { data: receptions = [] } = useQuery({
    queryKey: ['po-receptions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('receptions')
        .select('id, folio, reception_date, status, warehouse:warehouses(name), received_by, profile:profiles!receptions_received_by_fkey(full_name)')
        .eq('po_id', id)
        .order('reception_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const linesProgress = useMemo(() => {
    if (!po?.lines) return { full: 0, total: 0 }
    const total = po.lines.length
    const full  = po.lines.filter((l) => l.received_quantity >= l.quantity).length
    return { full, total }
  }, [po])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="font-heading text-lg font-semibold">Orden no encontrada</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          La OC que buscas no existe o fue eliminada.
        </p>
        <Button onClick={() => navigate('/compras/ordenes')} variant="outline">
          Volver a Órdenes
        </Button>
      </div>
    )
  }

  const StatusIcon = STATUS_ICON[po.status]
  const canReceive = can('stock_exit.create') /* almacenista || admin */
                  && ['sent', 'confirmed', 'partially_received'].includes(po.status)

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/compras/ordenes')}
            aria-label="Volver"
            className="mt-0.5"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-xl font-semibold tracking-[-0.01em] font-mono">{po.folio}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[po.status]}`}>
                <StatusIcon className="size-3" strokeWidth={2} />
                {STATUS_LABEL[po.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {po.supplier?.name ?? '—'} · emisión {format(new Date(po.issue_date), 'd MMM yyyy', { locale: es })}
              {' · '}{linesProgress.full}/{linesProgress.total} líneas completas
            </p>
          </div>
        </div>

        {canReceive && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setWizardOpen(true)}>
            <ArrowDownToLine className="size-4" />
            Registrar recepción
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Left — lines + reception history */}
        <div className="flex flex-col gap-4">
          {/* Lines */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 py-3 border-b">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
                Partidas ({po.lines?.length ?? 0})
              </h2>
            </header>
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Ítem</th>
                  <th className="px-3 py-2 text-right font-medium">Cant.</th>
                  <th className="px-3 py-2 text-right font-medium">Recibido</th>
                  <th className="px-3 py-2 text-right font-medium">Costo</th>
                  <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(po.lines ?? []).map((l) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const itemRel = (l as any).item as { name: string; sku: string } | undefined
                  const subtotal = l.quantity * l.unit_cost
                  const pending  = l.quantity - l.received_quantity
                  return (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 min-w-0">
                        <div className="font-medium truncate">{itemRel?.name ?? '—'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{itemRel?.sku ?? ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {l.quantity.toLocaleString('es-MX')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className={pending === 0 ? 'text-success' : pending < l.quantity ? 'text-warning' : 'text-muted-foreground'}>
                          {l.received_quantity.toLocaleString('es-MX')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground text-xs">
                        {l.currency} {l.unit_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                        ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {po.total_mxn != null && (
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="px-4 py-2.5 text-xs uppercase tracking-[0.06em] text-muted-foreground">
                      Total MXN (con IVA)
                    </td>
                    <td colSpan={3} />
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-base">
                      ${po.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {/* Receptions timeline */}
          <section className="rounded-xl border border-border bg-card">
            <header className="px-4 py-3 border-b">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
                Recepciones ({receptions.length})
              </h2>
            </header>
            {receptions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aún sin recepciones. Cuando llegue material, registrarlo aquí.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(receptions as any[]).map((r) => (
                  <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-success/15 text-success shrink-0">
                      <CheckCircle2 className="size-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{r.folio}</span>
                        <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {format(new Date(r.reception_date), 'd MMM yyyy', { locale: es })}
                        {r.warehouse?.name && ` · ${r.warehouse.name}`}
                        {r.profile?.full_name && ` · ${r.profile.full_name}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right — meta panel */}
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
              {po.expected_delivery_date && (
                <div className="flex items-start gap-2">
                  <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Entrega esperada</dt>
                    <dd>
                      {format(new Date(po.expected_delivery_date), 'd MMM yyyy', { locale: es })}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({formatDistanceToNow(new Date(po.expected_delivery_date), { addSuffix: true, locale: es })})
                      </span>
                    </dd>
                  </div>
                </div>
              )}
              {po.warehouse?.name && (
                <div className="flex items-start gap-2">
                  <WarehouseIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Almacén destino</dt>
                    <dd className="truncate">{po.warehouse.name}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {po.payment_terms && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Condiciones de pago
              </h3>
              <p className="text-sm whitespace-pre-wrap">{po.payment_terms}</p>
            </section>
          )}
        </aside>
      </div>

      {/* Reception wizard */}
      {po && (
        <ReceptionWizard
          open={wizardOpen}
          po={po}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}

