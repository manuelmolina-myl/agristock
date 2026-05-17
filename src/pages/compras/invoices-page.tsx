import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Plus, Search, Receipt, AlertOctagon, CheckCircle2, ExternalLink,
  Loader2, FileText,
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
import { formatSupabaseError } from '@/lib/errors'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useSupplierInvoicesList, useCreateInvoice, useReconcileInvoice, useMarkInvoicePaid,
} from '@/features/compras/invoice-hooks'
import type { InvoiceStatus, Currency } from '@/lib/database.types'

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

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reconcileTarget, setReconcileTarget] = useState<string | null>(null)

  const { data: invoices = [], isLoading } = useSupplierInvoicesList({ status: statusFilter })
  const { can } = usePermissions()
  const reconcile = useReconcileInvoice()
  const markPaid  = useMarkInvoicePaid()
  const canWrite  = can('purchase.create')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter((i) =>
      i.invoice_folio.toLowerCase().includes(q) ||
      (i.cfdi_uuid ?? '').toLowerCase().includes(q) ||
      (i.supplier?.name ?? '').toLowerCase().includes(q),
    )
  }, [invoices, search])

  // Counts per tab for visual feedback
  const counts = useMemo(() => ({
    all: invoices.length,
    pending: invoices.filter((i) => i.status === 'pending').length,
    discrepancy: invoices.filter((i) => i.status === 'discrepancy').length,
    reconciled: invoices.filter((i) => i.status === 'reconciled').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  }), [invoices])

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Facturas"
        description="CFDIs de proveedores. Se concilian contra la OC con tolerancia configurada (default 2%)."
        actions={
          canWrite && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Cargar factura
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, UUID o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | 'all')}>
          <SelectTrigger className="h-9 sm:w-56"><SelectValue placeholder="Estatus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({counts.all})</SelectItem>
            <SelectItem value="pending">Pendientes ({counts.pending})</SelectItem>
            <SelectItem value="discrepancy">Con discrepancia ({counts.discrepancy})</SelectItem>
            <SelectItem value="reconciled">Conciliadas ({counts.reconciled})</SelectItem>
            <SelectItem value="paid">Pagadas ({counts.paid})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' ? 'Sin resultados' : 'Sin facturas registradas'}
          description={search || statusFilter !== 'all'
            ? 'Ajusta los filtros.'
            : 'Carga la factura del proveedor (PDF/XML) para iniciar la conciliación contra la OC.'}
          icon={<Receipt className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((inv) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const discrepancies = inv.discrepancies as any
            const diffPct = discrepancies?.diff_pct as number | undefined
            const diff    = discrepancies?.diff as number | undefined
            const railTone =
              inv.status === 'discrepancy' ? 'bg-destructive' :
              inv.status === 'paid'        ? 'bg-success' :
              inv.status === 'reconciled'  ? 'bg-usd' :
              'bg-border'

            return (
              <div
                key={inv.id}
                className="rounded-xl border border-border bg-card overflow-hidden flex"
              >
                <span aria-hidden className={`w-1 shrink-0 ${railTone}`} />
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{inv.invoice_folio}</span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[inv.status]}`}>
                          {inv.status === 'discrepancy' && <AlertOctagon className="size-2.5" strokeWidth={2.5} />}
                          {inv.status === 'reconciled' && <CheckCircle2 className="size-2.5" strokeWidth={2.5} />}
                          {STATUS_LABEL[inv.status]}
                        </span>
                        {inv.po?.folio && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            → OC {inv.po.folio}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {inv.supplier?.name ?? '—'}
                        {' · emitida '}{format(new Date(inv.issue_date), 'd MMM yyyy', { locale: es })}
                        {inv.due_date && ` · vence ${formatDistanceToNow(new Date(inv.due_date), { addSuffix: true, locale: es })}`}
                      </div>
                      {inv.cfdi_uuid && (
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          CFDI {inv.cfdi_uuid}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold font-mono tabular-nums">
                        {inv.currency === 'USD' ? 'US$' : '$'}
                        {(inv.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inv.currency} {inv.tax != null && `· IVA $${inv.tax.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy details */}
                  {inv.status === 'discrepancy' && diff != null && (
                    <div className="mt-2 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                      <AlertOctagon className="size-3.5 shrink-0 mt-0.5" />
                      <div>
                        Diferencia de <span className="font-mono tabular-nums font-semibold">
                          {inv.currency === 'USD' ? 'US$' : '$'}{Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                        {' '}({diffPct?.toFixed(2)}%) frente a la OC.
                        {' '}{diff > 0 ? 'Factura mayor que OC.' : 'Factura menor que OC.'}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {inv.pdf_url && (
                      <a
                        href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent text-foreground transition-colors"
                      >
                        <FileText className="size-3" /> PDF
                        <ExternalLink className="size-2.5" />
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
                        Conciliar de todos modos
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateInvoiceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

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

interface CreateProps { open: boolean; onClose: () => void }

function CreateInvoiceDialog({ open, onClose }: CreateProps) {
  const create = useCreateInvoice()

  // Eligible POs: have a supplier and are awaiting/received.
  const { data: pos = [] } = useQuery<Array<{
    id: string; folio: string; supplier_id: string; supplier?: { name: string } | null;
    total_mxn: number | null; total_usd: number | null
  }>>({
    queryKey: ['pos-for-invoice'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('id, folio, supplier_id, total_mxn, total_usd, supplier:suppliers(name)')
        .is('deleted_at', null)
        .in('status', ['sent', 'confirmed', 'partially_received', 'received'])
        .order('issue_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })

  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      po_id: '', invoice_folio: '', cfdi_uuid: null,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: null, subtotal: null, tax: null, total: 0,
      currency: 'MXN', pdf_url: null, xml_url: null, notes: null,
    },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form

  const poId = watch('po_id')
  const currency = watch('currency')
  const total = watch('total')

  const po = pos.find((p) => p.id === poId)
  const poTotal = po ? (currency === 'USD' ? po.total_usd : po.total_mxn) : null
  const projectedDiff = po && total && poTotal != null
    ? { diff: total - poTotal, pct: Math.abs((total - poTotal) / poTotal) * 100 }
    : null

  const handleClose = () => { reset(); onClose() }

  const onSubmit = (values: InvoiceForm) => {
    if (!po) {
      toast.error('Selecciona una OC válida'); return
    }
    create.mutate({
      po_id: values.po_id,
      supplier_id: po.supplier_id,
      invoice_folio: values.invoice_folio,
      cfdi_uuid: values.cfdi_uuid || null,
      issue_date: values.issue_date,
      due_date: values.due_date || null,
      subtotal: values.subtotal,
      tax: values.tax,
      total: values.total,
      currency: values.currency as Currency,
      pdf_url: values.pdf_url || null,
      xml_url: values.xml_url || null,
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
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar factura de proveedor</DialogTitle>
        </DialogHeader>

        <form id="invoice-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>OC asociada <span className="text-destructive">*</span></Label>
            <Select value={poId} onValueChange={(v) => setValue('po_id', v ?? '', { shouldDirty: true })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona OC" /></SelectTrigger>
              <SelectContent>
                {pos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.folio} — {p.supplier?.name ?? '—'}
                    {p.total_mxn != null && (
                      <span className="ml-2 text-muted-foreground text-xs font-mono tabular-nums">
                        ${p.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.po_id && <p className="text-xs text-destructive">{errors.po_id.message}</p>}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pdf">URL del PDF</Label>
              <Input id="pdf" type="url" {...register('pdf_url', { setValueAs: (v) => v || null })} className="h-9" placeholder="https://…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="xml">URL del XML</Label>
              <Input id="xml" type="url" {...register('xml_url', { setValueAs: (v) => v || null })} className="h-9" placeholder="https://…" />
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
                {' '}vs OC <span className="font-mono">{po?.folio}</span>.
                {projectedDiff.pct > 2 ? ' Excede tolerancia del 2%; se marcará como discrepancia.' : ' Dentro de tolerancia.'}
              </div>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={create.isPending}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={create.isPending}
            className="gap-1.5"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Cargar factura
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
