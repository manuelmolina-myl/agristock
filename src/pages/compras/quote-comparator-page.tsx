import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Trophy, Trash2, ShoppingCart, Loader2,
  FileText, Building2, Paperclip, X as XIcon, Sparkles, History,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/custom/empty-state'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useGeneratePOFromRequisition, useRequisition, useQuoteRequests,
} from '@/features/compras/hooks'
import { formatDistanceToNow } from 'date-fns'
import { MailQuestion } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface QuotationLineRow {
  id: string
  requisition_line_id: string
  unit_cost: number
  currency: 'MXN' | 'USD'
  discount_pct: number | null
  tax_pct: number | null
  available: boolean
  notes: string | null
}

interface QuotationRow {
  id: string
  folio: string
  supplier_id: string
  quotation_date: string
  status: 'requested' | 'received' | 'selected' | 'discarded'
  delivery_days: number | null
  validity_days: number | null
  payment_terms: string | null
  notes: string | null
  pdf_url: string | null
  supplier?: { name: string; rfc: string | null } | null
  lines?: QuotationLineRow[]
}

/** Opens the attachment for a quotation in a new tab.
 *  Bucket `cotizaciones` is private — we resolve a 60-second signedUrl on demand. */
async function openQuotationAttachment(path: string) {
  try {
    const { data, error } = await supabase.storage
      .from('cotizaciones')
      .createSignedUrl(path, 60)
    if (error) throw error
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  } catch (err) {
    const { title, description } = formatSupabaseError(err, 'No se pudo abrir el archivo')
    toast.error(title, { description })
  }
}

function fmt(n: number, cur: 'MXN' | 'USD' = 'MXN') {
  return `${cur === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
}

export default function QuoteComparatorPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const reqId = params.get('req')
  const qc = useQueryClient()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const generatePO = useGeneratePOFromRequisition()

  const { data: req, isLoading: loadingReq } = useRequisition(reqId ?? undefined)
  const { data: quoteRequests = [] } = useQuoteRequests(reqId ?? undefined)

  const { data: quotations = [], isLoading: loadingQuots } = useQuery<QuotationRow[]>({
    queryKey: ['quotations-compare', reqId],
    enabled: !!reqId,
    queryFn: async () => {
      const { data, error } = await db
        .from('quotations')
        .select(`
          id, folio, supplier_id, quotation_date, status,
          delivery_days, validity_days, payment_terms, notes, pdf_url,
          supplier:suppliers(name, rfc),
          lines:quotation_lines(*)
        `)
        .eq('requisition_id', reqId)
        .order('quotation_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as QuotationRow[]
    },
  })

  const { data: suppliers = [] } = useQuery<Array<{ id: string; name: string; rfc: string | null; default_currency: 'MXN' | 'USD'; currencies: Array<'MXN' | 'USD'> }>>({
    queryKey: ['suppliers-light', organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('suppliers')
        .select('id, name, rfc, default_currency, currencies')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data
    },
  })

  const [newQuotOpen, setNewQuotOpen] = useState(false)

  // Existing draft PO for this requisition (if any). When the user changes the
  // winning quotation we want to REGENERATE the PO atomically via the RPC
  // replace_po_quotation instead of silently leaving stale lines around.
  const { data: existingPo } = useQuery<{ id: string; status: string } | null>({
    queryKey: ['po-for-requisition', reqId],
    enabled: !!reqId,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('id, status')
        .eq('requisition_id', reqId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  // Latest USD/MXN FX rate for normalizing cross-currency comparisons.
  // Falls back to 18 if no FX history exists (a safe MX agro default).
  const { data: latestFx } = useQuery<number>({
    queryKey: ['fx-rate-latest'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('fx_rates')
        .select('rate')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.rate ?? 18
    },
  })
  const fxRate = latestFx ?? 18

  // ── Price history per catalog item ────────────────────────────────────────
  // For each requisition line that points to a catalog item, surface the last
  // 3 historical unit_costs from the `price_history` view (cotizaciones
  // anteriores agrupadas por (item_id, supplier_id)).  This lets compras
  // sanity-check si los precios de las cotizaciones actuales están alineados
  // con lo que se ha pagado en el pasado.
  const itemIdsFromReq = useMemo(() => {
    const ids = new Set<string>()
    for (const rl of req?.lines ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemId = (rl as any).item_id as string | null | undefined
      if (itemId) ids.add(itemId)
    }
    return Array.from(ids).sort()
  }, [req])

  const { data: priceHistoryByItem } = useQuery<
    Map<string, Array<{ unit_cost: number; currency: 'MXN' | 'USD'; observed_on: string }>>
  >({
    queryKey: ['price-history', { orgId: organization?.id, itemIds: itemIdsFromReq }],
    enabled: !!organization?.id && itemIdsFromReq.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Pull a generous slice and group client-side so a single trip to the
      // view covers every requisition line.  `limit = ids * 5` gives enough
      // headroom to keep at least the 3 most recent entries per item even
      // when one supplier dominates the history.
      const { data, error } = await db
        .from('price_history')
        .select('item_id, unit_cost, currency, observed_on')
        .in('item_id', itemIdsFromReq)
        .order('observed_on', { ascending: false })
        .limit(itemIdsFromReq.length * 5)
      if (error) throw error
      const map = new Map<
        string,
        Array<{ unit_cost: number; currency: 'MXN' | 'USD'; observed_on: string }>
      >()
      for (const row of (data ?? []) as Array<{
        item_id: string; unit_cost: number; currency: 'MXN' | 'USD'; observed_on: string
      }>) {
        const arr = map.get(row.item_id) ?? []
        if (arr.length < 3) {
          arr.push({ unit_cost: row.unit_cost, currency: row.currency, observed_on: row.observed_on })
          map.set(row.item_id, arr)
        }
      }
      return map
    },
  })

  // Compute totals per quotation across its lines.
  const totals = useMemo(() => {
    const map = new Map<string, { subtotal: number; tax: number; total: number; currency: 'MXN' | 'USD' }>()
    for (const q of quotations) {
      const reqLines = req?.lines ?? []
      let subtotal = 0, tax = 0
      let currency: 'MXN' | 'USD' = 'MXN'
      for (const ql of q.lines ?? []) {
        const rl = reqLines.find((r) => r.id === ql.requisition_line_id)
        if (!rl) continue
        currency = ql.currency
        const base = rl.quantity * ql.unit_cost
        const afterDiscount = base * (1 - (ql.discount_pct ?? 0) / 100)
        const lineTax = afterDiscount * ((ql.tax_pct ?? 0) / 100)
        subtotal += afterDiscount
        tax      += lineTax
      }
      map.set(q.id, { subtotal, tax, total: subtotal + tax, currency })
    }
    return map
  }, [quotations, req])

  // Find the cheapest quotation by normalizing every total to MXN using
  // the latest USD/MXN FX rate.  Previously this used a hardcoded factor
  // of 17 and didn't surface the equivalent to the operator, which made
  // mixed-currency comparisons confusing (e.g. US$3,584 looked smaller
  // than $3,654 MXN because the raw numbers were close).
  const totalsMxn = useMemo(() => {
    const m = new Map<string, number>()
    for (const [id, t] of totals.entries()) {
      const mxn = t.currency === 'USD' ? t.total * fxRate : t.total
      m.set(id, mxn)
    }
    return m
  }, [totals, fxRate])

  const cheapestId = useMemo(() => {
    let best: string | null = null
    let bestTotal = Infinity
    for (const [id, mxn] of totalsMxn.entries()) {
      if (mxn > 0 && mxn < bestTotal) {
        bestTotal = mxn; best = id
      }
    }
    return best
  }, [totalsMxn])

  const selectMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      // If there's already a PO in 'draft' for this requisition, regenerate
      // it atomically with the new winning quotation (RPC replace_po_quotation
      // updates supplier, lines, FX, totals + marks the rest as discarded).
      // Otherwise just toggle the status flags.
      if (existingPo && existingPo.status === 'draft') {
        const { error } = await db.rpc('replace_po_quotation', {
          p_po_id: existingPo.id,
          p_quotation_id: quotationId,
        })
        if (error) throw error
        return { mode: 'regenerated' as const, poId: existingPo.id }
      }

      const updates = quotations.map((q) =>
        db.from('quotations')
          .update({ status: q.id === quotationId ? 'selected' : 'discarded' })
          .eq('id', q.id),
      )
      const results = await Promise.all(updates)
      for (const r of results) if (r.error) throw r.error
      return { mode: 'marked' as const }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['quotations-compare', reqId] })
      qc.invalidateQueries({ queryKey: ['po-for-requisition', reqId] })
      if (result.mode === 'regenerated') {
        toast.success('OC actualizada con la nueva cotización', {
          description: 'Las líneas, precios y proveedor se sincronizaron.',
        })
        // Bust the PO detail cache so the preview iframe regenerates with new lines.
        qc.invalidateQueries({ queryKey: ['compras', 'purchase-orders', 'detail', result.poId] })
        qc.invalidateQueries({ queryKey: ['compras', 'purchase-orders'] })
      } else {
        toast.success('Cotización seleccionada')
      }
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo seleccionar la cotización')
      toast.error(title, { description })
    },
  })

  const discardMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      const { error } = await db.from('quotations').update({ status: 'discarded' }).eq('id', quotationId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations-compare', reqId] }),
  })

  if (!reqId) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Falta el parámetro <code>?req=</code> en la URL.</p>
        <Button onClick={() => navigate('/compras/cotizaciones')} variant="outline" className="mt-4">
          Volver a Cotizaciones
        </Button>
      </div>
    )
  }

  if (loadingReq || loadingQuots) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  // Defensive: catch orphan requisitions (0 lines) — usually leftover from
  // the pre-039 bug where parent + lines weren't atomic.  Migración 039
  // auto-soft-deleta los huérfanos viejos pero seguimos avisando si por
  // alguna razón el usuario llega a uno.
  if (req && (req.lines ?? []).length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-3xl mx-auto w-full">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/compras/requisiciones')}
          className="self-start gap-1"
        >
          <ArrowLeft className="size-4" /> Volver a Solicitudes
        </Button>
        <EmptyState
          icon={<FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />}
          title="Esta requisición no tiene líneas"
          description={
            'Fue creada antes de que la inserción fuera transaccional. ' +
            'Bórrala desde la lista y captura una nueva — los nuevos creates ya no pueden quedar huérfanos.'
          }
          action={{
            label: '+ Nueva requisición',
            onClick: () => navigate('/compras/requisiciones?new=1'),
          }}
        />
      </div>
    )
  }

  const selected = quotations.find((q) => q.status === 'selected')
  const canSelect = can('purchase.create')

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/compras/requisiciones/${reqId}`)} aria-label="Volver" className="mt-0.5">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-[-0.01em]">
              Comparar cotizaciones
            </h1>
            <span aria-hidden className="block h-[2px] w-10 rounded-full bg-warning/80 mt-1" />
            <p className="text-sm text-muted-foreground mt-1.5">
              Requisición <span className="font-mono">{req?.folio}</span> ·
              {' '}{quotations.length} {quotations.length === 1 ? 'cotización' : 'cotizaciones'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canSelect && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNewQuotOpen(true)}>
              <Plus className="size-4" /> Nueva cotización
            </Button>
          )}
          {selected && req?.status !== 'po_generated' && canSelect && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                generatePO.mutate({
                  requisitionId: reqId,
                  supplierId: selected.supplier_id,
                  quotationId: selected.id,
                  warehouseId: undefined,
                  expectedDate: undefined,
                  paymentTerms: selected.payment_terms ?? undefined,
                }, {
                  onSuccess: (poId) => {
                    toast.success('OC generada', { description: 'Lista para revisión y envío al proveedor.' })
                    navigate(`/compras/ordenes/${poId}`)
                  },
                  onError: (e) => {
                    const { title, description } = formatSupabaseError(e, 'No se pudo generar la OC')
                    toast.error(title, { description })
                  },
                })
              }}
              disabled={generatePO.isPending}
            >
              {generatePO.isPending && <Loader2 className="size-4 animate-spin" />}
              <ShoppingCart className="size-4" />
              Generar OC con esta cotización
            </Button>
          )}
        </div>
      </div>

      {/* Pending outreach: suppliers asked but not yet responded */}
      {(() => {
        const supplierIdsWithQuotation = new Set(quotations.map((q) => q.supplier_id))
        const pendingOutreach = quoteRequests.filter(
          (qr) => qr.status === 'pending' && !supplierIdsWithQuotation.has(qr.supplier_id),
        )
        if (pendingOutreach.length === 0) return null
        return (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <MailQuestion className="size-4 text-warning" strokeWidth={1.75} />
              <p className="text-sm font-medium">
                Cotizaciones solicitadas pendientes ({pendingOutreach.length})
              </p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {pendingOutreach.map((qr) => (
                <li key={qr.id}>
                  <Badge variant="outline" className="border-warning/40 text-foreground bg-card text-[11px] gap-1">
                    <span className="truncate max-w-[180px]">{qr.supplier?.name ?? '—'}</span>
                    <span className="text-muted-foreground">
                      · solicitada {formatDistanceToNow(new Date(qr.requested_at), { addSuffix: true, locale: es })}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      {quotations.length === 0 ? (
        <EmptyState
          title="Sin cotizaciones todavía"
          description="Agrega la primera cotización para empezar a comparar precios entre proveedores."
          icon={<FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <>
          {/* Mobile / Tablet (<md): card per quotation with collapsible per-line pricing */}
          <div className="md:hidden flex flex-col gap-3">
            {quotations.map((q) => {
              const t = totals.get(q.id) ?? { subtotal: 0, tax: 0, total: 0, currency: 'MXN' as const }
              const isSelected = q.status === 'selected'
              const isCheapest = q.id === cheapestId && !selected
              const mxnEquiv = totalsMxn.get(q.id) ?? 0
              return (
                <details
                  key={q.id}
                  className={`group rounded-xl border bg-card overflow-hidden ${
                    isSelected ? 'border-success/60 bg-success/5'
                      : isCheapest ? 'border-warning/60 bg-warning/5'
                      : 'border-border'
                  }`}
                >
                  <summary className="list-none cursor-pointer p-3 flex flex-col gap-2">
                    {/* Encabezado: proveedor + folio + badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                          <span className="text-sm font-semibold truncate">{q.supplier?.name ?? '—'}</span>
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{q.folio}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isSelected && (
                          <Badge className="text-[10px] gap-0.5 bg-success text-success-foreground">
                            <Trophy className="size-2.5" /> Seleccionada
                          </Badge>
                        )}
                        {isCheapest && !isSelected && (
                          <Badge variant="outline" className="text-[10px] border-warning text-warning">
                            Mejor precio
                          </Badge>
                        )}
                        {q.status === 'discarded' && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Descartada
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Meta: fecha, entrega, vigencia */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                      <span>{format(new Date(q.quotation_date), 'd MMM', { locale: es })}</span>
                      {q.delivery_days != null && <span>· entrega {q.delivery_days}d</span>}
                      {q.validity_days != null && <span>· vigencia {q.validity_days}d</span>}
                    </div>

                    {/* Totales */}
                    <div className="flex items-end justify-between gap-2 pt-2 border-t border-border/60">
                      <div className="text-[11px] text-muted-foreground">
                        <div>Subtotal · <span className="font-mono tabular-nums">{fmt(t.subtotal, t.currency)}</span></div>
                        <div>IVA · <span className="font-mono tabular-nums">{fmt(t.tax, t.currency)}</span></div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Total</div>
                        <div className="font-mono tabular-nums text-lg font-semibold">
                          {fmt(t.total, t.currency)}
                        </div>
                        {t.currency === 'USD' && (
                          <div className="text-[10px] text-muted-foreground">
                            ≈ {fmt(mxnEquiv, 'MXN')} MXN
                          </div>
                        )}
                      </div>
                    </div>

                    {q.pdf_url && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openQuotationAttachment(q.pdf_url!) }}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline self-start"
                      >
                        <Paperclip className="size-3" />
                        Ver archivo del proveedor
                      </button>
                    )}

                    {/* Acciones */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {q.status !== 'selected' && canSelect && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 gap-1.5"
                          onClick={(e) => { e.preventDefault(); selectMutation.mutate(q.id) }}
                          disabled={selectMutation.isPending}
                        >
                          <Trophy className="size-3.5" /> Elegir
                        </Button>
                      )}
                      {q.status !== 'discarded' && q.status !== 'selected' && canSelect && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10 px-3 gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); discardMutation.mutate(q.id) }}
                        >
                          <Trash2 className="size-3.5" />
                          Descartar
                        </Button>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground group-open:hidden">
                        Ver precios por ítem
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground hidden group-open:inline">
                        Ocultar precios
                      </span>
                    </div>
                  </summary>

                  {/* Detalle: precios por línea */}
                  <div className="border-t border-border bg-muted/20 px-3 py-2 flex flex-col gap-2">
                    {(req?.lines ?? []).map((rl) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const itemRel = (rl as any).item as { name: string; sku: string } | null | undefined
                      const ql = (q.lines ?? []).find((x) => x.requisition_line_id === rl.id)
                      const subtotal = ql ? rl.quantity * ql.unit_cost * (1 - (ql.discount_pct ?? 0) / 100) : 0
                      return (
                        <div key={rl.id} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {itemRel?.name ?? rl.free_description ?? '—'}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {itemRel?.sku ?? 'libre'} · qty {rl.quantity.toLocaleString('es-MX')}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {ql ? (
                              <>
                                <div className="font-mono tabular-nums">{fmt(ql.unit_cost, ql.currency)}</div>
                                {(ql.discount_pct ?? 0) > 0 && (
                                  <div className="text-[10px] text-warning">−{ql.discount_pct}% desc.</div>
                                )}
                                <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                  = {fmt(subtotal, ql.currency)}
                                </div>
                              </>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 italic">sin precio</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>

          {/* Desktop (md:+): existing comparison table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            {/* Header row: req item description + one column per quotation */}
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium w-[280px] border-b border-border">
                  Ítem solicitado
                </th>
                {quotations.map((q) => {
                  const isSelected = q.status === 'selected'
                  const isCheapest = q.id === cheapestId && !selected
                  return (
                    <th
                      key={q.id}
                      className={`px-3 py-2 text-left font-medium border-b align-top min-w-[200px] ${
                        isSelected ? 'border-success border-b-2' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 normal-case tracking-normal">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Building2 className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                            <span className="text-xs font-semibold text-foreground truncate">
                              {q.supplier?.name ?? '—'}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">{q.folio}</div>
                          {q.supplier?.rfc && (
                            <div className="font-mono text-[10px] text-muted-foreground">{q.supplier.rfc}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isSelected && (
                            <Badge className="text-[10px] gap-0.5 bg-success text-success-foreground">
                              <Trophy className="size-2.5" /> Seleccionada
                            </Badge>
                          )}
                          {isCheapest && !isSelected && (
                            <Badge variant="outline" className="text-[10px] border-warning text-warning">
                              Mejor precio
                            </Badge>
                          )}
                          {q.status === 'discarded' && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Descartada
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground normal-case tracking-normal">
                        <span>{format(new Date(q.quotation_date), 'd MMM', { locale: es })}</span>
                        {q.delivery_days != null && <span>· entrega {q.delivery_days}d</span>}
                        {q.validity_days != null && <span>· vigencia {q.validity_days}d</span>}
                      </div>

                      {q.pdf_url && (
                        <button
                          type="button"
                          onClick={() => openQuotationAttachment(q.pdf_url!)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline normal-case tracking-normal"
                        >
                          <Paperclip className="size-2.5" />
                          Ver archivo del proveedor
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {/* One row per requisition line */}
              {(req?.lines ?? []).map((rl) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const itemRel = (rl as any).item as { name: string; sku: string } | null | undefined
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rlItemId = (rl as any).item_id as string | null | undefined
                const hist = (rlItemId && priceHistoryByItem?.get(rlItemId)) || []
                return (
                  <tr key={rl.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-sm font-medium">
                        {itemRel?.name ?? rl.free_description ?? '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {itemRel?.sku ?? 'libre'}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Cantidad: <span className="font-mono tabular-nums">{rl.quantity.toLocaleString('es-MX')}</span>
                      </div>
                      {hist.length > 0 && (
                        <div
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          title="Últimos 3 precios cotizados para este ítem"
                        >
                          <History className="size-2.5 shrink-0" strokeWidth={1.75} />
                          <span className="font-mono tabular-nums">
                            Hist: {hist.map((h) => fmt(h.unit_cost, h.currency)).join(', ')}
                          </span>
                        </div>
                      )}
                    </td>
                    {quotations.map((q) => {
                      const ql = (q.lines ?? []).find((x) => x.requisition_line_id === rl.id)
                      const subtotal = ql ? rl.quantity * ql.unit_cost * (1 - (ql.discount_pct ?? 0) / 100) : 0
                      return (
                        <td key={q.id} className="px-3 py-2.5 align-top">
                          {ql ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="font-mono tabular-nums text-sm">
                                {fmt(ql.unit_cost, ql.currency)}
                              </div>
                              {(ql.discount_pct ?? 0) > 0 && (
                                <div className="text-[10px] text-warning">−{ql.discount_pct}% desc.</div>
                              )}
                              <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                = {fmt(subtotal, ql.currency)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 italic">sin precio</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Totals row */}
              <tr className="bg-muted/40">
                <td className="px-3 py-3 align-top">
                  <div className="text-xs uppercase tracking-[0.06em] text-muted-foreground font-medium">
                    Subtotal
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mt-3">IVA</div>
                  <div className="text-xs uppercase tracking-[0.06em] text-foreground font-semibold mt-3">
                    Total
                  </div>
                </td>
                {quotations.map((q) => {
                  const t = totals.get(q.id) ?? { subtotal: 0, tax: 0, total: 0, currency: 'MXN' as const }
                  const isSelected = q.status === 'selected'
                  const isCheapest = q.id === cheapestId && !selected
                  const mxnEquiv = totalsMxn.get(q.id) ?? 0
                  return (
                    <td
                      key={q.id}
                      className={`px-3 py-3 align-top font-mono tabular-nums ${
                        isSelected ? 'bg-success/10' : isCheapest ? 'bg-warning/5' : ''
                      }`}
                    >
                      <div className="text-sm">{fmt(t.subtotal, t.currency)}</div>
                      <div className="text-sm text-muted-foreground mt-2">{fmt(t.tax, t.currency)}</div>
                      <div className="text-base font-semibold mt-2">{fmt(t.total, t.currency)}</div>
                      {t.currency === 'USD' && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                          ≈ {fmt(mxnEquiv, 'MXN')} MXN
                          <span className="ml-1 opacity-70">@ {fxRate.toFixed(2)}</span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>

              {/* Action row */}
              <tr>
                <td className="px-3 py-3 text-xs text-muted-foreground">Acciones</td>
                {quotations.map((q) => (
                  <td key={q.id} className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      {q.status !== 'selected' && canSelect && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => selectMutation.mutate(q.id)}
                          disabled={selectMutation.isPending}
                        >
                          <Trophy className="size-3" /> Elegir
                        </Button>
                      )}
                      {q.status !== 'discarded' && q.status !== 'selected' && canSelect && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Descartar"
                          onClick={() => discardMutation.mutate(q.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          </div>
        </>
      )}

      <NewQuotationDialog
        open={newQuotOpen}
        requisitionId={reqId}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requisitionLines={(req?.lines ?? []) as any}
        suppliers={suppliers}
        onClose={() => setNewQuotOpen(false)}
        onSaved={() => {
          setNewQuotOpen(false)
          qc.invalidateQueries({ queryKey: ['quotations-compare', reqId] })
        }}
      />
    </div>
  )
}

// ─── New quotation dialog ────────────────────────────────────────────────────

interface NewQuotProps {
  open: boolean
  requisitionId: string
  requisitionLines: Array<{
    id: string
    item_id: string | null
    free_description: string | null
    quantity: number
    item?: { name: string; sku: string } | null
  }>
  suppliers: Array<{ id: string; name: string; default_currency: 'MXN' | 'USD'; currencies: Array<'MXN' | 'USD'> }>
  onClose: () => void
  onSaved: () => void
}

interface NewQuotLine {
  requisition_line_id: string
  unit_cost: string
  currency: 'MXN' | 'USD'
  discount_pct: string
  tax_pct: string
}

function NewQuotationDialog({
  open, requisitionId, requisitionLines, suppliers, onClose, onSaved,
}: NewQuotProps) {
  const { organization } = useAuth()
  const [supplierId, setSupplierId] = useState('')
  const [folio, setFolio] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [deliveryDays, setDeliveryDays] = useState('')
  const [validityDays, setValidityDays] = useState('15')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<NewQuotLine[]>([])
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractionNotes, setExtractionNotes] = useState<Record<number, string>>({})

  const supplier = suppliers.find((s) => s.id === supplierId)
  const defaultCurrency = supplier?.default_currency ?? 'MXN'

  // Seed `lines` whenever the dialog opens (or the source list changes).
  //
  // PREVIOUS BUG: this used `useState(() => setLines(...))` (lazy initializer
  // as side-effect, anti-pattern that only fires on first mount) plus a
  // `useMemo` with side-effects.  When the dialog opened the FIRST time with
  // open=false, the initializer's `if (open)` guard skipped seeding; the
  // subsequent open=true render never re-fired.  Result: `lines` stayed `[]`,
  // and `setLine`'s `prev.map(...)` was a no-op on the empty array, so
  // typing into a unit_cost input did nothing → "no se puede agregar items".
  useEffect(() => {
    if (!open) return
    setLines((prev) => {
      // Build a position-indexed map of any values the user already typed so
      // a re-seed (e.g. when the supplier changes) doesn't wipe their entry.
      const byReqLine = new Map(prev.map((l) => [l.requisition_line_id, l]))
      return requisitionLines.map((rl) => {
        const existing = byReqLine.get(rl.id)
        return {
          requisition_line_id: rl.id,
          unit_cost:    existing?.unit_cost    ?? '',
          currency:     existing?.currency     ?? defaultCurrency,
          discount_pct: existing?.discount_pct ?? '0',
          tax_pct:      existing?.tax_pct      ?? '16',
        }
      })
    })
  }, [open, requisitionLines, defaultCurrency])

  // Re-seed lines when supplier changes (for currency).
  const handleSupplierChange = (v: string) => {
    setSupplierId(v)
    const newDefault = suppliers.find((s) => s.id === v)?.default_currency ?? 'MXN'
    setLines((prev) => prev.map((l) => ({ ...l, currency: newDefault })))
  }

  const setLine = (idx: number, field: keyof NewQuotLine, value: string) => {
    setLines((prev) => {
      // Defensive: if `lines` somehow hasn't been seeded yet, hydrate now so
      // the user's input is not silently dropped by `[].map(...)`.
      const base = prev.length === requisitionLines.length
        ? prev
        : requisitionLines.map((rl) => ({
            requisition_line_id: rl.id,
            unit_cost: '',
            currency: defaultCurrency,
            discount_pct: '0',
            tax_pct: '16',
          }))
      return base.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error('Sin organización')
      if (!supplierId) throw new Error('Selecciona un proveedor')
      const filledLines = lines.filter((l) => Number(l.unit_cost) > 0)
      if (filledLines.length === 0) throw new Error('Captura al menos un precio')

      // Get folio
      const { data: folioData, error: folioErr } = await db.rpc('next_folio', {
        p_org: organization.id, p_type: 'quotation',
      })
      if (folioErr) throw folioErr
      const generatedFolio = folio.trim() || (folioData as string)

      const { data: quot, error: qErr } = await db.from('quotations').insert({
        organization_id: organization.id,
        requisition_id: requisitionId,
        supplier_id: supplierId,
        folio: generatedFolio,
        quotation_date: new Date().toISOString().slice(0, 10),
        status: 'received',
        payment_terms: paymentTerms || null,
        delivery_days: deliveryDays ? Number(deliveryDays) : null,
        validity_days: validityDays ? Number(validityDays) : null,
        notes: notes || null,
      }).select().single()
      if (qErr) throw qErr

      const linesPayload = filledLines.map((l) => ({
        quotation_id: quot.id,
        requisition_line_id: l.requisition_line_id,
        unit_cost: Number(l.unit_cost),
        currency: l.currency,
        discount_pct: Number(l.discount_pct) || 0,
        tax_pct: Number(l.tax_pct) || 0,
        available: true,
      }))

      const { error: lErr } = await db.from('quotation_lines').insert(linesPayload)
      if (lErr) throw lErr

      // Upload attachment (PDF or photo of the supplier's quote) if provided.
      // Stored at cotizaciones/<orgId>/<quotationId>/<timestamp>.<ext>.
      // The bucket is private (migración 038) so we store the storage path
      // in pdf_url and resolve to a signedUrl on read.
      if (attachment) {
        const ext = attachment.name.split('.').pop() ?? 'pdf'
        const storagePath = `${organization.id}/${quot.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('cotizaciones')
          .upload(storagePath, attachment, { upsert: true, contentType: attachment.type })
        if (upErr) {
          // Surface the upload failure but keep the quotation row — the user
          // can re-attach later.  We only warn, not throw, because losing the
          // priced lines for a single missed upload would be worse UX.
          toast.warning('Cotización guardada, pero falló subir el archivo', {
            description: upErr.message,
          })
        } else {
          await db.from('quotations').update({ pdf_url: storagePath }).eq('id', quot.id)
        }
      }

      return quot.id
    },
    onSuccess: () => {
      toast.success('Cotización registrada')
      // Reset form
      setSupplierId(''); setFolio(''); setPaymentTerms('')
      setDeliveryDays(''); setValidityDays('15'); setNotes(''); setLines([])
      setAttachment(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onSaved()
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar la cotización')
      toast.error(title, { description })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Proveedor <span className="text-destructive">*</span></Label>
              <Select value={supplierId} onValueChange={(v) => handleSupplierChange(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona proveedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qfolio">Folio del proveedor</Label>
              <Input id="qfolio" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Opcional — se genera si vacío" className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qpay">Condiciones de pago</Label>
              <Input id="qpay" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Contado, 30 días, etc." className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qdel">Entrega (días)</Label>
              <Input id="qdel" type="number" min="0" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qval">Vigencia (días)</Label>
              <Input id="qval" type="number" min="0" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Line prices */}
          <div className="flex flex-col gap-1.5">
            <Label>Precios por ítem</Label>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Ítem</th>
                    <th className="px-2 py-2 text-right font-medium w-24">Precio unit.</th>
                    <th className="px-2 py-2 text-right font-medium w-20">Moneda</th>
                    <th className="px-2 py-2 text-right font-medium w-20">% Desc.</th>
                    <th className="px-2 py-2 text-right font-medium w-20">% IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requisitionLines.map((rl, idx) => {
                    const line = lines[idx] ?? {
                      requisition_line_id: rl.id, unit_cost: '', currency: defaultCurrency, discount_pct: '0', tax_pct: '16',
                    }
                    return (
                      <tr key={rl.id}>
                        <td className="px-3 py-2 align-top">
                          <div className="text-xs font-medium truncate max-w-[200px]">
                            {rl.item?.name ?? rl.free_description ?? '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {rl.item?.sku ?? 'libre'} · qty {rl.quantity}
                          </div>
                          {extractionNotes[idx] && (
                            <div className="mt-1 inline-flex items-start gap-1 text-[10px] text-warning bg-warning/10 rounded px-1.5 py-0.5 max-w-[260px]">
                              <Sparkles className="size-2.5 mt-px shrink-0" />
                              <span className="leading-tight">{extractionNotes[idx]}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min="0" step="0.01" placeholder="0.00"
                            value={line.unit_cost}
                            onChange={(e) => setLine(idx, 'unit_cost', e.target.value)}
                            className="h-8 text-right font-mono tabular-nums text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {/* Restrict currency options to what the supplier actually accepts. */}
                          {(() => {
                            const availableCurrencies = (supplier?.currencies && supplier.currencies.length > 0)
                              ? supplier.currencies
                              : (['MXN', 'USD'] as const)
                            // If supplier accepts only one currency, render a static label instead of a select.
                            if (availableCurrencies.length === 1) {
                              return (
                                <div className="h-8 px-2 inline-flex items-center justify-center rounded-md border border-input bg-muted/30 text-xs font-mono">
                                  {availableCurrencies[0]}
                                </div>
                              )
                            }
                            return (
                              <Select value={line.currency} onValueChange={(v) => setLine(idx, 'currency', v ?? availableCurrencies[0])}>
                                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {availableCurrencies.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          })()}
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min="0" max="100" step="0.5" value={line.discount_pct}
                            onChange={(e) => setLine(idx, 'discount_pct', e.target.value)}
                            className="h-8 text-right font-mono tabular-nums text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number" min="0" max="100" step="0.5" value={line.tax_pct}
                            onChange={(e) => setLine(idx, 'tax_pct', e.target.value)}
                            className="h-8 text-right font-mono tabular-nums text-xs"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Si el proveedor no cotizó un ítem, déjalo en 0 y se omitirá.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qnotes">Notas</Label>
            <Textarea id="qnotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Attachment — supplier's PDF / photo of the quote */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qfile">Archivo del proveedor (opcional)</Label>
            <input
              ref={fileInputRef}
              id="qfile"
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (f.size > 10 * 1024 * 1024) {
                  toast.error('El archivo no puede superar 10 MB')
                  e.target.value = ''
                  return
                }
                setAttachment(f)
              }}
            />
            {attachment ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <Paperclip className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{attachment.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {(attachment.size / 1024).toFixed(0)} KB
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setAttachment(null)
                      setExtractionNotes({})
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Quitar archivo"
                    disabled={extracting}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>

                {/* Auto-extract button — calls the extract-quotation-prices edge function */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start gap-1.5"
                  disabled={extracting || requisitionLines.length === 0}
                  onClick={async () => {
                    if (!attachment) return
                    setExtracting(true)
                    try {
                      const fd = new FormData()
                      fd.append('file', attachment)
                      fd.append('requisitionLines', JSON.stringify(
                        requisitionLines.map((rl, idx) => ({
                          index: idx,
                          description: rl.item
                            ? `${rl.item.sku ?? ''} ${rl.item.name ?? ''}`.trim()
                            : (rl.free_description ?? ''),
                          quantity: rl.quantity,
                          unit: null,
                        })),
                      ))
                      const { data, error } = await supabase.functions.invoke(
                        'extract-quotation-prices',
                        { body: fd },
                      )
                      if (error) throw error
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const extracted = (data as any)?.lines as Array<{
                        index: number
                        unit_price: number | null
                        currency: 'MXN' | 'USD'
                        matched: boolean
                        supplier_description: string | null
                        notes: string | null
                      }>
                      if (!Array.isArray(extracted)) throw new Error('Respuesta inválida')

                      // Apply extracted prices into the form.
                      setLines((prev) => {
                        const base = prev.length === requisitionLines.length
                          ? prev
                          : requisitionLines.map((rl) => ({
                              requisition_line_id: rl.id,
                              unit_cost: '',
                              currency: defaultCurrency,
                              discount_pct: '0',
                              tax_pct: '16',
                            }))
                        return base.map((l, i) => {
                          const hit = extracted.find((e) => e.index === i)
                          if (!hit?.matched || hit.unit_price == null) return l
                          return {
                            ...l,
                            unit_cost: String(hit.unit_price),
                            currency: hit.currency ?? l.currency,
                          }
                        })
                      })

                      // Per-line notes from the extractor (for UI hints).
                      const notesMap: Record<number, string> = {}
                      for (const e of extracted) {
                        const bits = []
                        if (e.supplier_description) bits.push(`"${e.supplier_description}"`)
                        if (e.notes) bits.push(e.notes)
                        if (!e.matched) bits.push('No encontrado en el archivo')
                        if (bits.length) notesMap[e.index] = bits.join(' · ')
                      }
                      setExtractionNotes(notesMap)

                      const matched = extracted.filter((e) => e.matched && e.unit_price != null).length
                      toast.success(
                        `${matched} de ${requisitionLines.length} ítems extraídos`,
                        { description: matched < requisitionLines.length ? 'Revisa los renglones sin match.' : undefined },
                      )
                    } catch (err) {
                      const { title, description } = formatSupabaseError(err, 'No se pudieron extraer los precios')
                      toast.error(title, { description })
                    } finally {
                      setExtracting(false)
                    }
                  }}
                >
                  {extracting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Extrayendo precios…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Extraer precios del archivo (AI)
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="justify-start gap-2 h-9 text-muted-foreground"
              >
                <Paperclip className="size-4" />
                Adjuntar PDF o foto de la cotización
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              PDF / PNG / JPG · máximo 10 MB. Adjunta primero el archivo y luego usa
              "Extraer precios" para llenar la tabla automáticamente; siempre puedes ajustar manual.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar cotización
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
