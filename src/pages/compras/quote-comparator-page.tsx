import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Trophy, Trash2, ShoppingCart, Loader2,
  FileText, Building2,
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
  supplier?: { name: string; rfc: string | null } | null
  lines?: QuotationLineRow[]
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
          delivery_days, validity_days, payment_terms, notes,
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

  // Find the cheapest quotation (in MXN-equivalent for crude comparison).
  const cheapestId = useMemo(() => {
    let best: string | null = null
    let bestTotal = Infinity
    for (const [id, t] of totals.entries()) {
      // Treat USD as ~17 MXN for ranking; this is heuristic, the user picks.
      const mxn = t.currency === 'USD' ? t.total * 17 : t.total
      if (mxn > 0 && mxn < bestTotal) {
        bestTotal = mxn; best = id
      }
    }
    return best
  }, [totals])

  const selectMutation = useMutation({
    mutationFn: async (quotationId: string) => {
      // Mark this quotation as 'selected'; all others on this requisition → 'discarded'.
      const updates = quotations.map((q) =>
        db.from('quotations')
          .update({ status: q.id === quotationId ? 'selected' : 'discarded' })
          .eq('id', q.id),
      )
      const results = await Promise.all(updates)
      for (const r of results) if (r.error) throw r.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations-compare', reqId] })
      toast.success('Cotización seleccionada')
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
        <div className="overflow-x-auto">
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

  const supplier = suppliers.find((s) => s.id === supplierId)
  const defaultCurrency = supplier?.default_currency ?? 'MXN'

  // Reset state when opening with a new request.
  useState(() => {
    if (open) {
      setLines(requisitionLines.map((rl) => ({
        requisition_line_id: rl.id,
        unit_cost: '',
        currency: defaultCurrency,
        discount_pct: '0',
        tax_pct: '16',
      })))
    }
  })

  // Re-seed lines when supplier changes (for currency).
  const handleSupplierChange = (v: string) => {
    setSupplierId(v)
    const newDefault = suppliers.find((s) => s.id === v)?.default_currency ?? 'MXN'
    setLines((prev) => prev.map((l) => ({ ...l, currency: newDefault })))
  }

  // Seed on open.
  useMemo(() => {
    if (open && lines.length === 0) {
      setLines(requisitionLines.map((rl) => ({
        requisition_line_id: rl.id,
        unit_cost: '',
        currency: defaultCurrency,
        discount_pct: '0',
        tax_pct: '16',
      })))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requisitionLines.length])

  const setLine = (idx: number, field: keyof NewQuotLine, value: string) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
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

      return quot.id
    },
    onSuccess: () => {
      toast.success('Cotización registrada')
      // Reset form
      setSupplierId(''); setFolio(''); setPaymentTerms('')
      setDeliveryDays(''); setValidityDays('15'); setNotes(''); setLines([])
      onSaved()
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar la cotización')
      toast.error(title, { description })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="!max-w-2xl max-h-[92vh] overflow-y-auto">
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
