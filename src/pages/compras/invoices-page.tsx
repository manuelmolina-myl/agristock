import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Search, Receipt, AlertOctagon, CheckCircle2, ExternalLink,
  Loader2, FileText, Paperclip, X as XIcon, ShoppingCart,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatSupabaseError } from '@/lib/errors'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useCreateInvoice, useReconcileInvoice, useMarkInvoicePaid,
} from '@/features/compras/invoice-hooks'
import type { InvoiceStatus, Currency, POStatus } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: 'Pendiente', reconciled: 'Conciliada', paid: 'Pagada',
  cancelled: 'Cancelada', discrepancy: 'Discrepancia',
}

const STATUS_TONE: Record<InvoiceStatus, string> = {
  pending:     'bg-muted text-muted-foreground',
  reconciled:  'bg-usd/15 text-usd',
  paid:        'bg-success/15 text-success',
  cancelled:   'bg-muted text-muted-foreground',
  discrepancy: 'bg-destructive/15 text-destructive',
}

const invoiceSchema = z.object({
  po_id:         z.string().uuid('Selecciona la OC'),
  invoice_folio: z.string().min(1, 'Folio requerido').max(50),
  cfdi_uuid:     z.string().max(40).optional().nullable(),
  issue_date:    z.string().min(1, 'Fecha requerida'),
  due_date:      z.string().optional().nullable(),
  subtotal:      z.number().nonnegative().nullable(),
  tax:           z.number().nonnegative().nullable(),
  total:         z.number().positive('Total mayor a 0'),
  currency:      z.enum(['MXN', 'USD']),
  pdf_url:       z.string().url().optional().or(z.literal('')).nullable(),
  xml_url:       z.string().url().optional().or(z.literal('')).nullable(),
  notes:         z.string().max(500).optional().nullable(),
})

type InvoiceForm = z.infer<typeof invoiceSchema>

// ─── PO-centric row type ───────────────────────────────────────────────────
interface POWithInvoices {
  id: string
  folio: string
  status: POStatus
  supplier_id: string
  supplier?: { name: string; rfc: string | null } | null
  total_mxn: number | null
  total_usd: number | null
  issue_date: string
  expected_delivery_date: string | null
  invoices: Array<{
    id: string
    invoice_folio: string
    issue_date: string
    due_date: string | null
    total: number | null
    currency: Currency
    status: InvoiceStatus
    pdf_url: string | null
    xml_url: string | null
    cfdi_uuid: string | null
    discrepancies: unknown
  }>
}

type Filter = 'all' | 'missing' | 'with_invoice'

export default function InvoicesPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [adjuntarPo, setAdjuntarPo] = useState<POWithInvoices | null>(null)
  const [viewPo, setViewPo] = useState<POWithInvoices | null>(null)
  const [reconcileTarget, setReconcileTarget] = useState<string | null>(null)
  const { organization } = useAuth()
  const { can } = usePermissions()
  const reconcile = useReconcileInvoice()
  const markPaid  = useMarkInvoicePaid()
  const canWrite  = can('purchase.create')

  // Lista de OCs (firmadas en adelante) con sus facturas asociadas.
  // Facturas comes BEFORE recepciones — esta es la vista principal del módulo.
  const { data: pos = [], isLoading } = useQuery<POWithInvoices[]>({
    queryKey: ['pos-with-invoices', { orgId: organization?.id }],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select(`
          id, folio, status, supplier_id, total_mxn, total_usd,
          issue_date, expected_delivery_date,
          supplier:suppliers(name, rfc),
          invoices:supplier_invoices(
            id, invoice_folio, issue_date, due_date, total, currency, status,
            pdf_url, xml_url, cfdi_uuid, discrepancies
          )
        `)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .in('status', ['sent', 'confirmed', 'partially_received', 'received', 'closed'])
        .order('issue_date', { ascending: false })
        .limit(200)
      if (error) throw error
      // PostgREST can return `null` for empty 1:N embeds — normaliza a [] para
      // que po.invoices.length etc. nunca crashe.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        invoices: row.invoices ?? [],
      })) as POWithInvoices[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pos.filter((po) => {
      const invs = po.invoices ?? []
      if (filter === 'missing' && invs.length > 0) return false
      if (filter === 'with_invoice' && invs.length === 0) return false
      if (q) {
        const haystack = [
          po.folio,
          po.supplier?.name ?? '',
          ...invs.map((i) => `${i.invoice_folio} ${i.cfdi_uuid ?? ''}`),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [pos, filter, search])

  const counts = useMemo(() => ({
    all: pos.length,
    missing: pos.filter((p) => (p.invoices ?? []).length === 0).length,
    with_invoice: pos.filter((p) => (p.invoices ?? []).length > 0).length,
  }), [pos])

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Facturas"
        description="Adjunta la factura del proveedor (PDF/XML) a cada Orden de Compra antes de registrar la recepción."
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio de OC, proveedor o factura…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter((v ?? 'all') as Filter)}>
          <SelectTrigger className="h-9 sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="missing">Sin factura ({counts.missing})</SelectItem>
            <SelectItem value="with_invoice">Con factura ({counts.with_invoice})</SelectItem>
            <SelectItem value="all">Todas las OC ({counts.all})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || filter !== 'all' ? 'Sin resultados' : 'Sin OC para facturar'}
          description={
            filter === 'missing'
              ? 'Todas las OC firmadas ya tienen factura. Cuando llegue una nueva, aparecerá aquí.'
              : filter === 'with_invoice'
                ? 'Aún no se ha cargado ninguna factura. Cambia el filtro a "Sin factura" para empezar.'
                : 'Cuando se firmen OCs, aparecerán aquí para que adjuntes la factura del proveedor.'
          }
          icon={<Receipt className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((po) => {
            const invs = po.invoices ?? []
            const hasInvoice = invs.length > 0
            const totalInvoiced = invs.reduce((s, i) => s + (i.total ?? 0), 0)
            const hasDiscrepancy = invs.some((i) => i.status === 'discrepancy')
            const railTone = !hasInvoice ? 'bg-warning'
              : hasDiscrepancy ? 'bg-destructive'
              : invs.every((i) => i.status === 'paid') ? 'bg-success'
              : invs.every((i) => ['reconciled', 'paid'].includes(i.status)) ? 'bg-usd'
              : 'bg-border'

            return (
              <div
                key={po.id}
                className="rounded-xl border border-border bg-card overflow-hidden flex"
              >
                <span aria-hidden className={`w-1 shrink-0 ${railTone}`} />
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ShoppingCart className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-sm font-medium">{po.folio}</span>
                        {!hasInvoice && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/15 text-warning">
                            Sin factura
                          </span>
                        )}
                        {hasInvoice && !hasDiscrepancy && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                            <CheckCircle2 className="size-2.5" />
                            {invs.length} factura{invs.length === 1 ? '' : 's'}
                          </span>
                        )}
                        {hasDiscrepancy && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive">
                            <AlertOctagon className="size-2.5" />
                            Discrepancia
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {po.supplier?.name ?? '—'}
                        {' · emitida '}{format(new Date(po.issue_date), 'd MMM yyyy', { locale: es })}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold font-mono tabular-nums">
                        ${(po.total_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        MXN · OC total
                        {hasInvoice && (
                          <> · facturado <span className="font-mono">${totalInvoiced.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {hasInvoice ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setViewPo(po)}
                        >
                          <FileText className="size-3" />
                          Ver facturas ({invs.length})
                        </Button>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setAdjuntarPo(po)}
                          >
                            <Paperclip className="size-3" />
                            Adjuntar otra
                          </Button>
                        )}
                      </>
                    ) : canWrite ? (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 ml-auto"
                        onClick={() => setAdjuntarPo(po)}
                      >
                        <Paperclip className="size-3" />
                        Adjuntar factura
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Attach invoice dialog */}
      {adjuntarPo && (
        <CreateInvoiceDialog
          open={!!adjuntarPo}
          poContext={{
            id: adjuntarPo.id,
            folio: adjuntarPo.folio,
            supplier_id: adjuntarPo.supplier_id,
            supplier_name: adjuntarPo.supplier?.name ?? '—',
            total_mxn: adjuntarPo.total_mxn,
            total_usd: adjuntarPo.total_usd,
          }}
          onClose={() => setAdjuntarPo(null)}
        />
      )}

      {/* View invoices for a PO */}
      {viewPo && (
        <Dialog open={!!viewPo} onOpenChange={(o) => !o && setViewPo(null)}>
          <DialogContent className="!max-w-2xl">
            <DialogHeader>
              <DialogTitle>Facturas de OC {viewPo.folio}</DialogTitle>
            </DialogHeader>
            <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pt-2">
              {(viewPo.invoices ?? []).map((inv) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const discrep = inv.discrepancies as any
                const diff    = discrep?.diff as number | undefined
                return (
                  <li key={inv.id} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-sm font-medium">{inv.invoice_folio}</span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[inv.status]}`}>
                            {STATUS_LABEL[inv.status]}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Emitida {format(new Date(inv.issue_date), 'd MMM yyyy', { locale: es })}
                          {inv.due_date && ` · vence ${formatDistanceToNow(new Date(inv.due_date), { addSuffix: true, locale: es })}`}
                        </div>
                        {inv.cfdi_uuid && (
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                            CFDI {inv.cfdi_uuid}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold font-mono tabular-nums text-sm">
                          {inv.currency === 'USD' ? 'US$' : '$'}
                          {(inv.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{inv.currency}</div>
                      </div>
                    </div>
                    {inv.status === 'discrepancy' && diff != null && (
                      <div className="mt-2 rounded bg-destructive/10 border border-destructive/20 px-2 py-1 text-[11px] text-destructive">
                        Diferencia ${Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })} vs OC.
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input hover:bg-accent transition-colors"
                        >
                          <FileText className="size-2.5" /> PDF <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      {inv.xml_url && (
                        <a
                          href={inv.xml_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input hover:bg-accent transition-colors"
                        >
                          XML <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      {canWrite && inv.status === 'pending' && (
                        <Button size="sm" className="h-6 px-2 text-[11px] gap-1 ml-auto"
                          onClick={() => setReconcileTarget(inv.id)}
                          disabled={reconcile.isPending}
                        >
                          <CheckCircle2 className="size-2.5" /> Conciliar
                        </Button>
                      )}
                      {canWrite && inv.status === 'discrepancy' && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] ml-auto"
                          onClick={() => setReconcileTarget(inv.id)}
                        >
                          Conciliar igual
                        </Button>
                      )}
                      {canWrite && inv.status === 'reconciled' && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] ml-auto"
                          onClick={() => markPaid.mutate(inv.id, {
                            onSuccess: () => toast.success('Marcada como pagada'),
                          })}
                        >
                          Marcar pagada
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </DialogContent>
        </Dialog>
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

// ─── Create invoice dialog ──────────────────────────────────────────────────

interface CreateProps {
  open: boolean
  onClose: () => void
  /** Pre-selected PO context — when present, hides the OC Select. */
  poContext: {
    id: string
    folio: string
    supplier_id: string
    supplier_name: string
    total_mxn: number | null
    total_usd: number | null
  }
}

function CreateInvoiceDialog({ open, onClose, poContext }: CreateProps) {
  const create = useCreateInvoice()
  const { organization } = useAuth()
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const xmlInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      po_id: poContext.id, invoice_folio: '', cfdi_uuid: null,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: null, subtotal: null, tax: null, total: 0,
      currency: 'MXN', pdf_url: null, xml_url: null, notes: null,
    },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form

  const currency = watch('currency')
  const total = watch('total')

  const poTotal = currency === 'USD' ? poContext.total_usd : poContext.total_mxn
  const projectedDiff = total && poTotal != null
    ? { diff: total - poTotal, pct: Math.abs((total - poTotal) / poTotal) * 100 }
    : null

  const handleClose = () => {
    reset()
    setPdfFile(null)
    setXmlFile(null)
    if (pdfInputRef.current) pdfInputRef.current.value = ''
    if (xmlInputRef.current) xmlInputRef.current.value = ''
    onClose()
  }

  async function uploadInvoiceFile(file: File, kind: 'pdf' | 'xml'): Promise<string | null> {
    if (!organization) return null
    const ext = file.name.split('.').pop() ?? (kind === 'pdf' ? 'pdf' : 'xml')
    const path = `${organization.id}/invoices/${poContext.id}/${Date.now()}-${kind}.${ext}`
    const { error } = await supabase.storage
      .from('cotizaciones')
      .upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (error) throw error
    const { data: signed, error: signErr } = await supabase.storage
      .from('cotizaciones')
      .createSignedUrl(path, 60 * 60 * 24 * 30 * 12) // 1 año — la URL se persiste; bucket privado de la org
    if (signErr) throw signErr
    return signed.signedUrl
  }

  const onSubmit = async (values: InvoiceForm) => {
    setUploading(true)
    try {
      let pdfUrl = values.pdf_url || null
      let xmlUrl = values.xml_url || null
      if (pdfFile) pdfUrl = await uploadInvoiceFile(pdfFile, 'pdf')
      if (xmlFile) xmlUrl = await uploadInvoiceFile(xmlFile, 'xml')

      create.mutate({
        po_id: poContext.id,
        supplier_id: poContext.supplier_id,
        invoice_folio: values.invoice_folio,
        cfdi_uuid: values.cfdi_uuid || null,
        issue_date: values.issue_date,
        due_date: values.due_date || null,
        subtotal: values.subtotal,
        tax: values.tax,
        total: values.total,
        currency: values.currency as Currency,
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
        notes: values.notes ?? null,
      }, {
        onSuccess: (inv) => {
          toast.success(inv.status === 'discrepancy' ? 'Factura cargada con discrepancia' : 'Factura cargada', {
            description: inv.status === 'discrepancy'
              ? 'El total no coincide con la OC dentro de la tolerancia.'
              : 'Lista para conciliar contra la OC.',
          })
          handleClose()
        },
        onError: (e) => {
          const { title, description } = formatSupabaseError(e, 'No se pudo cargar la factura')
          toast.error(title, { description })
        },
      })
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo subir el archivo')
      toast.error(title, { description })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar factura de proveedor</DialogTitle>
        </DialogHeader>

        <form id="invoice-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {/* PO context — read-only banner */}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShoppingCart className="size-3.5" /> OC
              <span className="font-mono text-sm font-medium text-foreground">{poContext.folio}</span>
              <span>·</span>
              <span className="text-foreground">{poContext.supplier_name}</span>
              <span className="ml-auto font-mono tabular-nums text-foreground">
                ${(poContext.total_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ifolio">Folio factura <span className="text-destructive">*</span></Label>
              <Input id="ifolio" {...register('invoice_folio')} className="h-9 font-mono" aria-invalid={!!errors.invoice_folio} />
              {errors.invoice_folio && <p className="text-xs text-destructive">{errors.invoice_folio.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iuuid">UUID CFDI</Label>
              <Input
                id="iuuid"
                {...register('cfdi_uuid', { setValueAs: (v) => v?.trim() || null })}
                className="h-9 font-mono text-xs"
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iss">Emisión <span className="text-destructive">*</span></Label>
              <Input id="iss" type="date" {...register('issue_date')} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due">Vencimiento</Label>
              <Input
                id="due" type="date"
                {...register('due_date', { setValueAs: (v) => v || null })}
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => setValue('currency', v as Currency, { shouldDirty: true })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tot">Total <span className="text-destructive">*</span></Label>
              <Input
                id="tot" type="number" min="0" step="0.01"
                {...register('total', { valueAsNumber: true })}
                className="h-9 text-right font-mono tabular-nums"
              />
              {errors.total && <p className="text-xs text-destructive">{errors.total.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub">Subtotal</Label>
              <Input
                id="sub" type="number" min="0" step="0.01"
                {...register('subtotal', { setValueAs: (v) => v === '' || v == null ? null : Number(v) })}
                className="h-9 text-right font-mono tabular-nums"
                placeholder="opcional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax">IVA</Label>
              <Input
                id="tax" type="number" min="0" step="0.01"
                {...register('tax', { setValueAs: (v) => v === '' || v == null ? null : Number(v) })}
                className="h-9 text-right font-mono tabular-nums"
                placeholder="opcional"
              />
            </div>
          </div>

          {/* File uploads — preferred over URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Archivo PDF</Label>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) {
                    toast.error('PDF máximo 10 MB')
                    e.target.value = ''
                    return
                  }
                  setPdfFile(f)
                }}
              />
              {pdfFile ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 h-9">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="text-xs truncate flex-1">{pdfFile.name}</span>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setPdfFile(null); if (pdfInputRef.current) pdfInputRef.current.value = '' }}>
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pdfInputRef.current?.click()}
                  className="h-9 justify-start gap-2 text-muted-foreground text-xs"
                >
                  <Paperclip className="size-3.5" /> Adjuntar PDF
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Archivo XML (CFDI)</Label>
              <input
                ref={xmlInputRef}
                type="file"
                accept="text/xml,application/xml,.xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 5 * 1024 * 1024) {
                    toast.error('XML máximo 5 MB')
                    e.target.value = ''
                    return
                  }
                  setXmlFile(f)
                }}
              />
              {xmlFile ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 h-9">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="text-xs truncate flex-1">{xmlFile.name}</span>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setXmlFile(null); if (xmlInputRef.current) xmlInputRef.current.value = '' }}>
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => xmlInputRef.current?.click()}
                  className="h-9 justify-start gap-2 text-muted-foreground text-xs"
                >
                  <Paperclip className="size-3.5" /> Adjuntar XML
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inotes">Notas</Label>
            <Textarea id="inotes" {...register('notes', { setValueAs: (v) => v || null })} rows={2} />
          </div>

          {/* Live discrepancy preview */}
          {projectedDiff && Math.abs(projectedDiff.pct) > 0 && (
            <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${
              projectedDiff.pct > 2
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'border-success/30 bg-success/5 text-success'
            }`}>
              {projectedDiff.pct > 2 ? <AlertOctagon className="size-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />}
              <div>
                Diferencia <span className="font-mono tabular-nums">
                  {currency === 'USD' ? 'US$' : '$'}{Math.abs(projectedDiff.diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span> ({projectedDiff.pct.toFixed(2)}%)
                {' '}vs OC <span className="font-mono">{poContext.folio}</span>.
                {projectedDiff.pct > 2 ? ' Excede tolerancia del 2%; se marcará como discrepancia.' : ' Dentro de tolerancia.'}
              </div>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={create.isPending || uploading}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={create.isPending || uploading}
            className="gap-1.5"
          >
            {(create.isPending || uploading) && <Loader2 className="size-4 animate-spin" />}
            {uploading ? 'Subiendo archivos…' : 'Cargar factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Confirm reconcile dialog ───────────────────────────────────────────────

function ConfirmReconcileDialog({
  open, onConfirm, onClose, isPending,
}: {
  open: boolean
  onConfirm: (note?: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [note, setNote] = useState('')
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Conciliar factura</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirmas que la factura coincide con lo recibido en la OC y queda lista para pago.
        </p>
        <div className="flex flex-col gap-1.5 mt-2">
          <Label htmlFor="rec-note">Nota (opcional)</Label>
          <Textarea
            id="rec-note" rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Si concilias con discrepancia, justifica aquí…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => onConfirm(note || undefined)} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            <CheckCircle2 className="size-4" /> Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
