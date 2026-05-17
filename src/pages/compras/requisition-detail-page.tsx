import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useRecordRecent } from '@/features/recents/store'
import {
  ArrowLeft, CheckCircle2, XCircle, FileText, ShoppingCart, Loader2,
  Clock, AlertCircle, User as UserIcon, MapPin, Tractor,
  Send, Search, Mail, MailQuestion, MailX, MailCheck,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import {
  useRequisition, useApproveRequisition, useRejectRequisition,
  useQuoteRequests, useCreateQuoteRequests,
} from '@/features/compras/hooks'
import { usePermissions } from '@/hooks/use-permissions'
import type { RequisitionStatus, QuoteRequestStatus } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<RequisitionStatus, string> = {
  draft: 'Borrador', submitted: 'Enviada', in_quotation: 'En cotización',
  approved: 'Aprobada', rejected: 'Rechazada', po_generated: 'OC generada', cancelled: 'Cancelada',
}

const STATUS_VARIANT: Record<RequisitionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline', submitted: 'secondary', in_quotation: 'secondary',
  approved: 'default', rejected: 'destructive', po_generated: 'default', cancelled: 'outline',
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baja', medium: 'Normal', high: 'Alta', urgent: 'Urgente',
}

interface QuoteReqStatusMeta {
  label: string
  icon: typeof Mail
  iconClass: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  badgeClass: string
}
const QUOTE_REQ_STATUS: Record<QuoteRequestStatus, QuoteReqStatusMeta> = {
  pending: {
    label: 'Pendiente',
    icon: MailQuestion,
    iconClass: 'text-warning',
    variant: 'outline',
    badgeClass: 'border-warning text-warning bg-warning/10',
  },
  responded: {
    label: 'Respondida',
    icon: MailCheck,
    iconClass: 'text-success',
    variant: 'outline',
    badgeClass: 'border-success text-success bg-success/10',
  },
  declined: {
    label: 'Declinada',
    icon: MailX,
    iconClass: 'text-muted-foreground',
    variant: 'outline',
    badgeClass: 'text-muted-foreground',
  },
  expired: {
    label: 'Expirada',
    icon: Mail,
    iconClass: 'text-muted-foreground',
    variant: 'outline',
    badgeClass: 'text-muted-foreground',
  },
}

interface LineWithItem {
  id: string
  item_id: string | null
  free_description: string | null
  quantity: number
  estimated_unit_cost: number | null
  currency: string | null
  notes: string | null
  item?: { name: string; sku: string } | null
}

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const { data: req, isLoading } = useRequisition(id)
  const approve = useApproveRequisition()
  const reject  = useRejectRequisition()
  const { data: quoteRequests = [] } = useQuoteRequests(id)
  const createQuoteRequests = useCreateQuoteRequests()
  const { user } = useAuth()
  useRecordRecent(
    user?.id,
    req ? {
      kind: 'requisition',
      id: req.id,
      label: req.folio,
      sublabel: req.notes ?? null,
      linkPath: `/compras/requisiciones/${req.id}`,
    } : null,
  )

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [askSelectedIds, setAskSelectedIds] = useState<Set<string>>(new Set())
  const [askSearch, setAskSearch] = useState('')
  const [askNotes, setAskNotes] = useState('')

  // Suggested suppliers (everyone in the org's catalog). Includes the fields
  // we need to surface in the "ask for quote" dialog (currencies for matching
  // against requisition lines, rfc for disambiguation).
  const { data: suppliers = [] } = useQuery<
    Array<{
      id: string
      name: string
      rfc: string | null
      currencies: Array<'MXN' | 'USD'>
    }>
  >({
    queryKey: ['suppliers-light'],
    queryFn: async () => {
      const { data, error } = await db
        .from('suppliers')
        .select('id, name, rfc, currencies')
        .is('deleted_at', null)
        .order('name')
        .limit(200)
      if (error) throw error
      return data
    },
  })

  // ── Memos MUST live above every early return ─────────────────────────────
  // React requires the same hook call order on every render.  Returning early
  // for `isLoading` / `!req` and then calling useMemo below caused error #310
  // ("rendered more hooks than the previous render") whenever the query
  // transitioned from loading to loaded.

  // Suppliers already invited for this requisition (used to exclude / annotate).
  const askedSupplierMap = useMemo(() => {
    const m = new Map<string, { status: QuoteRequestStatus; requested_at: string }>()
    for (const r of quoteRequests) {
      m.set(r.supplier_id, { status: r.status, requested_at: r.requested_at })
    }
    return m
  }, [quoteRequests])

  const filteredSuppliers = useMemo(() => {
    const needle = askSearch.trim().toLowerCase()
    return suppliers.filter((s) => {
      if (!needle) return true
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.rfc ?? '').toLowerCase().includes(needle)
      )
    })
  }, [suppliers, askSearch])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!req) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="text-lg font-semibold">Solicitud no encontrada</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          La requisición que buscas no existe o fue eliminada.
        </p>
        <Button onClick={() => navigate('/compras/requisiciones')} variant="outline">
          Volver a Solicitudes
        </Button>
      </div>
    )
  }

  const lines = (req.lines ?? []) as LineWithItem[]
  const estimatedTotal = lines.reduce(
    (acc, l) => acc + (l.quantity * (l.estimated_unit_cost ?? 0)),
    0,
  )

  const canAct = can('purchase.approve')
  const canActStatus = req.status === 'submitted' || req.status === 'in_quotation'
  // "Solicitar cotización" is allowed while the requisition is still actively
  // being shopped, plus 'approved' (operator may want to compare more quotes
  // before committing to an OC).
  const canAskQuotes =
    canAct &&
    (req.status === 'submitted' || req.status === 'in_quotation' || req.status === 'approved')

  const openAskDialog = () => {
    setAskSelectedIds(new Set())
    setAskSearch('')
    setAskNotes('')
    setAskOpen(true)
  }

  const toggleAskSupplier = (sid: string) => {
    setAskSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid); else next.add(sid)
      return next
    })
  }

  const handleSendQuoteRequests = () => {
    if (!id) return
    if (askSelectedIds.size === 0) return
    createQuoteRequests.mutate(
      {
        requisitionId: id,
        supplierIds: Array.from(askSelectedIds),
        notes: askNotes.trim() || undefined,
      },
      {
        onSuccess: (rows) => {
          toast.success(
            rows.length > 0
              ? `Se envió la solicitud a ${rows.length} ${rows.length === 1 ? 'proveedor' : 'proveedores'}`
              : 'Todos los proveedores seleccionados ya tenían una solicitud previa',
          )
          setAskOpen(false)
          setAskSelectedIds(new Set())
          setAskNotes('')
        },
        onError: (e) => {
          const { title, description } = formatSupabaseError(e, 'No se pudo enviar la solicitud')
          toast.error(title, { description })
        },
      },
    )
  }

  const handleApprove = () => {
    approve.mutate(
      { id: req.id, note: undefined },
      {
        onSuccess: () => toast.success('Requisición aprobada'),
        onError: (e) => {
          const { title, description } = formatSupabaseError(e, 'No se pudo aprobar la requisición')
          toast.error(title, { description })
        },
      },
    )
  }

  const handleReject = () => {
    if (rejectReason.trim().length < 3) {
      toast.error('Indica un motivo (mínimo 3 caracteres)')
      return
    }
    reject.mutate(
      { id: req.id, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          toast.success('Requisición rechazada')
          setRejectOpen(false); setRejectReason('')
        },
        onError: (e) => {
          const { title, description } = formatSupabaseError(e, 'No se pudo rechazar la requisición')
          toast.error(title, { description })
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/compras/requisiciones')}
            aria-label="Volver"
            className="mt-0.5"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-mono text-lg font-semibold">{req.folio}</h1>
              <Badge variant={STATUS_VARIANT[req.status]}>{STATUS_LABEL[req.status]}</Badge>
              <Badge variant="outline" className="text-[10px]">
                Prioridad: {PRIORITY_LABEL[req.priority]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Solicitada {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: es })}
              {req.requester?.full_name && ` por ${req.requester.full_name}`}
            </p>
          </div>
        </div>

        {canAct && canActStatus && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRejectOpen(true)}
              disabled={reject.isPending}
            >
              <XCircle className="size-4" />
              Rechazar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleApprove}
              disabled={approve.isPending}
            >
              {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Aprobar
            </Button>
          </div>
        )}
        {canAct && req.status === 'approved' && (
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => navigate(`/compras/ordenes/nueva?req=${req.id}`)}
          >
            <ShoppingCart className="size-4" />
            Generar OC
          </Button>
        )}
      </div>

      {/* Layout: left = lines, right = meta */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Left: lines */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <header className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ítems solicitados ({lines.length})</h2>
            <div className="text-xs text-muted-foreground tabular-nums">
              Estimado: <span className="font-medium text-foreground">${estimatedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
            </div>
          </header>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Ítem</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Costo est.</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    {l.item ? (
                      <div>
                        <div className="font-medium">{l.item.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{l.item.sku}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium italic">{l.free_description ?? '—'}</div>
                        <div className="text-[11px] text-muted-foreground">No catalogado</div>
                      </div>
                    )}
                    {l.notes && (
                      <div className="text-[11px] text-muted-foreground mt-1 italic">{l.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {l.quantity.toLocaleString('es-MX')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {l.estimated_unit_cost != null
                      ? `${l.currency ?? 'MXN'} ${l.estimated_unit_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                    {l.estimated_unit_cost != null
                      ? `$${(l.quantity * l.estimated_unit_cost).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Quote actions */}
          {(req.status === 'submitted' || req.status === 'approved' || req.status === 'in_quotation') && canAct && (
            <div className="border-t bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {req.status === 'approved'
                  ? 'Aprobada — ya puedes generar la OC.'
                  : 'Pide cotizaciones a proveedores para comparar precios.'}
              </div>
              <div className="flex items-center gap-2">
                {canAskQuotes && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={openAskDialog}
                  >
                    <Send className="size-4" />
                    Solicitar cotización
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => navigate(`/compras/cotizaciones/comparar?req=${req.id}`)}
                >
                  <FileText className="size-4" />
                  Comparar cotizaciones
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Quote requests list — full width, sits between the lines table and meta column */}
        {quoteRequests.length > 0 && (
          <section className="rounded-xl border border-border bg-card overflow-hidden lg:col-span-1">
            <header className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Cotizaciones solicitadas ({quoteRequests.length})
              </h2>
            </header>
            <ul className="divide-y">
              {quoteRequests.map((qr) => {
                const statusInfo = QUOTE_REQ_STATUS[qr.status]
                return (
                  <li key={qr.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30">
                    <statusInfo.icon className={`size-4 shrink-0 ${statusInfo.iconClass}`} strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {qr.supplier?.name ?? '—'}
                        </span>
                        <Badge variant={statusInfo.variant} className={statusInfo.badgeClass}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Solicitada {formatDistanceToNow(new Date(qr.requested_at), { addSuffix: true, locale: es })}
                        {qr.requester?.full_name && ` por ${qr.requester.full_name}`}
                        {qr.responded_at && ` · respondió ${formatDistanceToNow(new Date(qr.responded_at), { addSuffix: true, locale: es })}`}
                      </p>
                      {qr.notes && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">{qr.notes}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Right: meta */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Solicitud</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <UserIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Solicitante</dt>
                  <dd className="font-medium truncate">{req.requester?.full_name ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[11px] text-muted-foreground">Fecha de solicitud</dt>
                  <dd>{format(new Date(req.request_date), 'd MMM yyyy', { locale: es })}</dd>
                </div>
              </div>
              {req.crop_lot?.name && (
                <div className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Lote</dt>
                    <dd className="truncate">{req.crop_lot.name}</dd>
                  </div>
                </div>
              )}
              {req.equipment?.name && (
                <div className="flex items-start gap-2">
                  <Tractor className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Equipo</dt>
                    <dd className="truncate">{req.equipment.name}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {req.justification && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Justificación</h3>
              <p className="text-sm whitespace-pre-wrap">{req.justification}</p>
            </section>
          )}

          {req.rejection_reason && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive mb-2 flex items-center gap-1.5">
                <AlertCircle className="size-3" />
                Motivo de rechazo
              </h3>
              <p className="text-sm whitespace-pre-wrap">{req.rejection_reason}</p>
            </section>
          )}

          {req.notes && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notas</h3>
              <p className="text-sm whitespace-pre-wrap">{req.notes}</p>
            </section>
          )}
        </aside>
      </div>

      {/* "Solicitar cotización" dialog */}
      <Dialog open={askOpen} onOpenChange={(o) => { if (!o) setAskOpen(false) }}>
        <DialogContent className="!max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Solicitar cotización a proveedores</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {/* Search */}
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar proveedor por nombre o RFC…"
                value={askSearch}
                onChange={(e) => setAskSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            {/* Supplier list */}
            <div className="border border-border rounded-lg overflow-y-auto flex-1 min-h-[200px] max-h-[40vh]">
              {filteredSuppliers.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No hay proveedores que coincidan con la búsqueda.
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredSuppliers.map((s) => {
                    const previous = askedSupplierMap.get(s.id)
                    const checked = askSelectedIds.has(s.id)
                    return (
                      <li
                        key={s.id}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleAskSupplier(s.id)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleAskSupplier(s.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{s.name}</span>
                            {(s.currencies ?? []).map((c) => (
                              <Badge key={c} variant="outline" className="text-[9px] font-mono">{c}</Badge>
                            ))}
                            {previous && (
                              <Badge
                                variant="outline"
                                className={QUOTE_REQ_STATUS[previous.status].badgeClass}
                              >
                                {QUOTE_REQ_STATUS[previous.status].label}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {s.rfc ?? 'Sin RFC'}
                            {previous && (
                              <> · última solicitud {formatDistanceToNow(new Date(previous.requested_at), { addSuffix: true, locale: es })}</>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ask-notes">Notas para los proveedores (opcional)</Label>
              <Textarea
                id="ask-notes"
                value={askNotes}
                onChange={(e) => setAskNotes(e.target.value)}
                rows={2}
                placeholder="Plazos especiales, condiciones, dudas…"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Se registrará una solicitud por cada proveedor. Si ya pediste cotización a alguno antes, se omitirá.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAskOpen(false)}
              disabled={createQuoteRequests.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendQuoteRequests}
              disabled={askSelectedIds.size === 0 || createQuoteRequests.isPending}
              className="gap-1.5"
            >
              {createQuoteRequests.isPending && <Loader2 className="size-4 animate-spin" />}
              <Send className="size-4" />
              Enviar solicitud a {askSelectedIds.size} {askSelectedIds.size === 1 ? 'proveedor' : 'proveedores'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { if (!o) { setRejectOpen(false); setRejectReason('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar requisición</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Motivo del rechazo <span className="text-destructive">*</span></Label>
            <Textarea
              id="reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explica brevemente por qué se rechaza. El solicitante lo verá."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectReason('') }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={reject.isPending} className="gap-1.5">
              {reject.isPending && <Loader2 className="size-4 animate-spin" />}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
