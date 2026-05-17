import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Calendar, Warehouse as WarehouseIcon, ArrowDownToLine,
  AlertCircle, CheckCircle2, Clock, XCircle, FileDown, Loader2, PenLine, Send, RotateCcw, Ban,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { SignaturePad, type SignaturePadHandle } from '@/components/custom/signature-pad'
import { supabase } from '@/lib/supabase'
import { usePurchaseOrder } from '@/features/compras/hooks'
import { usePermissions } from '@/hooks/use-permissions'
import { useAuth } from '@/hooks/use-auth'
import { formatSupabaseError } from '@/lib/errors'
import type { POStatus } from '@/lib/database.types'

import { ReceptionWizard } from './reception-wizard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Borrador',
  pending_signature: 'Pendiente de firma',
  sent: 'Firmada',
  confirmed: 'Confirmada',
  partially_received: 'Parcialmente recibida',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
}

const STATUS_TONE: Record<POStatus, string> = {
  draft:              'bg-muted text-muted-foreground',
  pending_signature:  'bg-warning/15 text-warning',
  sent:               'bg-usd/15 text-usd',
  confirmed:          'bg-usd/15 text-usd',
  partially_received: 'bg-warning/15 text-warning',
  received:           'bg-success/15 text-success',
  closed:             'bg-success/10 text-success/80',
  cancelled:          'bg-destructive/15 text-destructive',
}

const STATUS_ICON: Record<POStatus, React.ElementType> = {
  draft: Clock,
  pending_signature: PenLine,
  sent: ArrowDownToLine,
  confirmed: CheckCircle2,
  partially_received: AlertCircle,
  received: CheckCircle2,
  closed: CheckCircle2,
  cancelled: XCircle,
}

export default function PoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can, hasRole } = usePermissions()
  const isAdmin = hasRole('admin')
  const qc = useQueryClient()

  const { data: po, isLoading } = usePurchaseOrder(id)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(true)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const signaturePadRef = useRef<SignaturePadHandle>(null)
  const { organization, user } = useAuth()

  const creatorName = user?.user_metadata?.full_name ?? user?.email ?? undefined

  // ── Signature flow mutations ──────────────────────────────────────────────
  function invalidatePo() {
    if (!id) return
    qc.invalidateQueries({ queryKey: ['compras', 'purchase-orders', 'detail', id] })
    qc.invalidateQueries({ queryKey: ['compras', 'purchase-orders'] })
  }

  const submitForSignature = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('submit_po_for_signature', { p_po_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('OC enviada a firma', { description: 'El admin verá la OC pendiente y podrá firmarla.' })
      invalidatePo()
    },
    onError: (e: unknown) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo enviar a firma')
      toast.error(title, { description })
    },
  })

  const signPo = useMutation({
    mutationFn: async (signatureDataUrl: string) => {
      if (!po || !organization) throw new Error('Sin contexto de OC')
      // 1) Upload PNG to private bucket cotizaciones/<org>/signatures/<po_id>.png
      const blob = await (await fetch(signatureDataUrl)).blob()
      const path = `${organization.id}/signatures/${po.id}.png`
      const { error: upErr } = await supabase.storage
        .from('cotizaciones')
        .upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (upErr) throw upErr
      // 2) Stamp the PO with the signature path + admin metadata.
      const { error } = await db.rpc('sign_po', { p_po_id: id, p_signature_url: path })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('OC firmada', { description: 'Tu firma quedó grabada en el PDF.' })
      setSignDialogOpen(false)
      invalidatePo()
    },
    onError: (e: unknown) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo firmar la OC')
      toast.error(title, { description })
    },
  })

  const revertSignature = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('revert_po_signature', { p_po_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Firma revertida', { description: 'La OC volvió a borrador para corrección.' })
      setConfirmRevertOpen(false)
      invalidatePo()
    },
    onError: (e: unknown) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo revertir la firma')
      toast.error(title, { description })
    },
  })

  const rejectSignature = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('reject_po_signature', { p_po_id: id, p_reason: null })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Firma rechazada', { description: 'La OC volvió a borrador para corrección.' })
      invalidatePo()
    },
    onError: (e: unknown) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo rechazar la firma')
      toast.error(title, { description })
    },
  })

  const cancelPo = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await db.rpc('cancel_po', { p_po_id: id, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('OC cancelada', { description: 'La OC quedó marcada como cancelada.' })
      setCancelDialogOpen(false)
      setCancelReason('')
      invalidatePo()
    },
    onError: (e: unknown) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo cancelar la OC')
      toast.error(title, { description })
    },
  })

  async function handleDownloadPdf() {
    if (!po || !organization) return
    setDownloadingPdf(true)
    try {
      const { generatePoPDF } = await import('@/lib/generate-po-pdf')
      await generatePoPDF({ po, organization, createdByName: creatorName })
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo generar el PDF')
      toast.error(title, { description })
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Auto-generate the preview blob URL whenever the PO data changes.
  // Re-fires on po.id, line edits, status changes, or org logo updates so
  // the embedded iframe always reflects the latest persisted state.
  // The fingerprint key prevents redundant re-renders for unrelated state.
  const previewKey = useMemo(() => {
    if (!po) return ''
    return JSON.stringify({
      id: po.id,
      status: po.status,
      issue_date: po.issue_date,
      lines: po.lines?.map((l) => [l.id, l.quantity, l.unit_cost, l.currency, l.received_quantity]),
      total: po.total_mxn,
      logo: organization?.logo_url,
    })
  }, [po, organization?.logo_url])

  useEffect(() => {
    if (!po || !organization) return
    let cancelled = false
    let createdUrl: string | null = null
    setPreviewing(true)
    setPreviewError(null)

    ;(async () => {
      try {
        const { previewPoPDF } = await import('@/lib/generate-po-pdf')
        const url = await previewPoPDF({ po, organization, createdByName: creatorName })
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        createdUrl = url
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (err) {
        if (!cancelled) {
          const { description } = formatSupabaseError(err, 'No se pudo generar la vista previa')
          setPreviewError(description)
        }
      } finally {
        if (!cancelled) setPreviewing(false)
      }
    })()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  // Final cleanup on unmount in case the latest blob URL outlives the page.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
          >
            {downloadingPdf
              ? <Loader2 className="size-4 animate-spin" />
              : <FileDown className="size-4" />}
            {downloadingPdf ? 'Generando…' : 'Descargar PDF'}
          </Button>

          {/* Compras/admin: pasar a firma cuando está en draft */}
          {po.status === 'draft' && can('purchase.create') && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => submitForSignature.mutate()}
              disabled={submitForSignature.isPending}
            >
              {submitForSignature.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <Send className="size-4" />}
              Pasar a firma
            </Button>
          )}

          {/* Admin: firmar / rechazar cuando está pending_signature */}
          {po.status === 'pending_signature' && isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => rejectSignature.mutate()}
                disabled={rejectSignature.isPending}
              >
                {rejectSignature.isPending
                  ? <Loader2 className="size-4 animate-spin" />
                  : <RotateCcw className="size-4" />}
                Devolver a borrador
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setSignDialogOpen(true)}
                disabled={signPo.isPending}
              >
                <PenLine className="size-4" />
                Firmar OC
              </Button>
            </>
          )}

          {/* Admin: reversar firma cuando está sent y aún no hay recepciones */}
          {po.status === 'sent' && isAdmin && receptions.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmRevertOpen(true)}
              disabled={revertSignature.isPending}
            >
              <RotateCcw className="size-4" />
              Reversar firma
            </Button>
          )}

          {/* Banner informativo cuando pending_signature y NO eres admin */}
          {po.status === 'pending_signature' && !isAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <PenLine className="size-3.5" />
              Esperando firma del admin
            </span>
          )}

          {canReceive && (
            <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}>
              <ArrowDownToLine className="size-4" />
              Registrar recepción
            </Button>
          )}

          {/* Admin: cancelar OC (no aplica si ya cerró, recibió o canceló) */}
          {isAdmin && !['cancelled', 'closed', 'received'].includes(po.status) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelDialogOpen(true)}
            >
              <Ban className="size-4" />
              Cancelar OC
            </Button>
          )}
        </div>
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
                  <th className="px-3 py-2 text-right font-medium">IVA</th>
                  <th className="px-4 py-2 text-right font-medium">Total línea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(po.lines ?? []).map((l) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const itemRel = (l as any).item as { name: string; sku: string } | undefined
                  const subtotal = l.quantity * l.unit_cost
                  const taxPct   = l.tax_pct ?? 16
                  const taxAmt   = subtotal * (taxPct / 100)
                  const total    = subtotal + taxAmt
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
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground text-xs">
                        <div>{taxAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] opacity-70">{taxPct}%</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                        ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {po.total_mxn != null && (
                <tfoot className="bg-muted/20">
                  {po.subtotal_mxn != null && (
                    <tr className="border-t border-border">
                      <td colSpan={4} className="px-4 py-1.5 text-right text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        Subtotal
                      </td>
                      <td colSpan={2} className="px-4 py-1.5 text-right font-mono tabular-nums text-sm text-muted-foreground">
                        ${po.subtotal_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  {po.tax_mxn != null && (
                    <tr>
                      <td colSpan={4} className="px-4 py-1.5 text-right text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        IVA total
                      </td>
                      <td colSpan={2} className="px-4 py-1.5 text-right font-mono tabular-nums text-sm text-muted-foreground">
                        ${po.tax_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-border">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-xs uppercase tracking-[0.06em] font-semibold text-foreground">
                      Total MXN (con IVA)
                    </td>
                    <td colSpan={2} className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-base">
                      ${po.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>

          {/* PDF preview — debajo de Partidas, mismo ancho que la columna */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 py-3 border-b flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
                Vista previa del documento
              </h2>
              {previewing && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Generando…
                </span>
              )}
            </header>
            <div className="relative bg-muted/30">
              {previewError ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <p className="text-destructive font-medium mb-1">No se pudo generar la vista previa</p>
                  <p>{previewError}</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`Vista previa de OC ${po.folio}`}
                  className="w-full h-[70vh] min-h-[480px] bg-card"
                />
              ) : (
                <div className="h-[70vh] min-h-[480px] flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Cargando vista previa…
                </div>
              )}
            </div>
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
              {po.approved_at && (
                <div className="flex items-start gap-2">
                  <PenLine className="size-3.5 text-success mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Firmada</dt>
                    <dd className="text-success font-medium">
                      {format(new Date(po.approved_at), 'd MMM yyyy · HH:mm', { locale: es })}
                    </dd>
                    <dd className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(po.approved_at), { addSuffix: true, locale: es })}
                    </dd>
                  </div>
                </div>
              )}
              {po.status === 'cancelled' && po.cancelled_at && (
                <div className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Cancelada</dt>
                    <dd className="text-destructive font-medium">
                      {format(new Date(po.cancelled_at), 'd MMM yyyy · HH:mm', { locale: es })}
                    </dd>
                    {po.cancellation_reason && (
                      <dd className="text-[11px] italic text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                        {po.cancellation_reason}
                      </dd>
                    )}
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

      {/* Signature dialog — admin only */}
      <Dialog
        open={signDialogOpen}
        onOpenChange={(open) => {
          if (!open) signaturePadRef.current?.clear()
          setSignDialogOpen(open)
        }}
      >
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar OC {po.folio}</DialogTitle>
            <DialogDescription>
              Dibuja tu firma con mouse, lápiz o el dedo. Quedará incrustada en el PDF
              y registrada como firma del admin que aprobó.
            </DialogDescription>
          </DialogHeader>

          <SignaturePad ref={signaturePadRef} height={200} />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSignDialogOpen(false)}
              disabled={signPo.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => {
                const dataUrl = signaturePadRef.current?.toDataUrl()
                if (!dataUrl) {
                  toast.error('Dibuja tu firma antes de aprobar')
                  return
                }
                signPo.mutate(dataUrl)
              }}
              disabled={signPo.isPending}
            >
              {signPo.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <PenLine className="size-4" />}
              Confirmar firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel OC dialog — admin only */}
      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!open) setCancelReason('')
          setCancelDialogOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar OC {po.folio}</DialogTitle>
            <DialogDescription>
              La OC pasará a cancelada y no podrá modificarse. No se permite cancelar
              si hay recepciones registradas o facturas conciliadas/pagadas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">
              Motivo de cancelación
            </label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Explica brevemente por qué se cancela la OC…"
              rows={4}
              disabled={cancelPo.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Requerido (mínimo 3 caracteres).
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelPo.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => cancelPo.mutate(cancelReason.trim())}
              disabled={cancelPo.isPending || cancelReason.trim().length < 3}
            >
              {cancelPo.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <Ban className="size-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert signature confirm dialog */}
      <Dialog open={confirmRevertOpen} onOpenChange={setConfirmRevertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Reversar firma de {po.folio}?</DialogTitle>
            <DialogDescription>
              La OC volverá al estado <strong>Borrador</strong> y se borrará la firma actual,
              la fecha de aprobación y los metadatos. Compras tendrá que pasarla a firma
              de nuevo. Esta acción no es posible si la OC ya tiene recepciones registradas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevertOpen(false)} disabled={revertSignature.isPending}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => revertSignature.mutate()}
              disabled={revertSignature.isPending}
            >
              {revertSignature.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <RotateCcw className="size-4" />}
              Reversar firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

