/**
 * RegistrarPagoDialog — registra el pago de una factura conciliada.
 *
 * Llama al RPC `mark_invoice_paid(p_invoice_id, p_payment jsonb)` (migración 051).
 * El RPC valida que el estatus sea reconciled / discrepancy / pending y exige
 * permiso `can_write_purchase`. Tras éxito, invalida los queries relevantes y
 * notifica al padre via `onPaid()`.
 *
 * El comprobante de pago se sube al bucket `cotizaciones` en
 * `<orgId>/payments/<invoiceId>/<timestamp>.<ext>` y se persiste su signed URL
 * con TTL de 1 año, replicando el patrón de `CreateInvoiceDialog`.
 */
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Paperclip, X as XIcon, Receipt } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatSupabaseError } from '@/lib/errors'
import type { Currency } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export const PAYMENT_METHODS = [
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'tarjeta',       label: 'Tarjeta de crédito' },
  { value: 'otro',          label: 'Otro' },
] as const

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

const paymentSchema = z.object({
  paid_at:           z.string().min(1, 'Fecha requerida'),
  payment_method:    z.enum(['transferencia', 'cheque', 'efectivo', 'tarjeta', 'otro']),
  payment_reference: z.string().max(80).optional().nullable(),
  payment_notes:     z.string().max(500).optional().nullable(),
}).refine(
  (v) => v.payment_method === 'efectivo' || (v.payment_reference && v.payment_reference.trim().length > 0),
  { message: 'Referencia requerida para este método', path: ['payment_reference'] },
)

type PaymentForm = z.infer<typeof paymentSchema>

interface RegistrarPagoDialogProps {
  open: boolean
  invoiceId: string
  invoiceFolio: string
  invoiceTotal: number
  currency: Currency
  onClose: () => void
  onPaid?: () => void
}

function nowLocalInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RegistrarPagoDialog({
  open, invoiceId, invoiceFolio, invoiceTotal, currency, onClose, onPaid,
}: RegistrarPagoDialogProps) {
  const { organization } = useAuth()
  const qc = useQueryClient()
  const proofRef = useRef<HTMLInputElement>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paid_at:           nowLocalInput(),
      payment_method:    'transferencia',
      payment_reference: '',
      payment_notes:     '',
    },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form

  const method = watch('payment_method') as PaymentMethod
  const referenceRequired = method !== 'efectivo'

  const handleClose = () => {
    reset()
    setProofFile(null)
    if (proofRef.current) proofRef.current.value = ''
    onClose()
  }

  async function uploadProof(file: File): Promise<string | null> {
    if (!organization) return null
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase()
    const path = `${organization.id}/payments/${invoiceId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('cotizaciones')
      .upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (error) throw error
    const { data: signed, error: signErr } = await supabase.storage
      .from('cotizaciones')
      .createSignedUrl(path, 60 * 60 * 24 * 30 * 12) // 1 año
    if (signErr) throw signErr
    return signed.signedUrl
  }

  const onSubmit = async (values: PaymentForm) => {
    setSubmitting(true)
    try {
      let proofUrl: string | null = null
      if (proofFile) {
        proofUrl = await uploadProof(proofFile)
      }

      // Convert datetime-local (sin TZ) a ISO. JS lo interpreta como local-time.
      const paidAtIso = new Date(values.paid_at).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('mark_invoice_paid', {
        p_invoice_id: invoiceId,
        p_payment: {
          paid_at:           paidAtIso,
          payment_method:    values.payment_method,
          payment_reference: values.payment_reference?.trim() || null,
          payment_proof_url: proofUrl,
          payment_notes:     values.payment_notes?.trim() || null,
        },
      })
      if (error) throw error

      toast.success('Pago registrado', {
        description: `Factura ${invoiceFolio} marcada como pagada.`,
      })

      qc.invalidateQueries({ queryKey: ['compras', 'purchase-orders', 'detail'] })
      qc.invalidateQueries({ queryKey: ['po-with-invoices-detail'] })
      qc.invalidateQueries({ queryKey: ['ap-aging'] })
      qc.invalidateQueries({ queryKey: ['supplier-invoices-list'] })
      qc.invalidateQueries({ queryKey: ['pos-with-invoices'] })

      onPaid?.()
      handleClose()
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo registrar el pago')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago de factura</DialogTitle>
        </DialogHeader>

        <form id="payment-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Receipt className="size-3.5" /> Factura
              <span className="font-mono text-sm font-medium text-foreground">{invoiceFolio}</span>
              <span className="ml-auto font-mono tabular-nums text-foreground">
                {currency === 'USD' ? 'US$' : '$'}
                {invoiceTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {currency}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paid_at">Fecha de pago <span className="text-destructive">*</span></Label>
              <Input
                id="paid_at"
                type="datetime-local"
                {...register('paid_at')}
                className="h-9"
                aria-invalid={!!errors.paid_at}
              />
              {errors.paid_at && <p className="text-xs text-destructive">{errors.paid_at.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Método de pago <span className="text-destructive">*</span></Label>
              <Select
                value={method}
                onValueChange={(v) => setValue('payment_method', v as PaymentMethod, { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment_reference">
              Referencia
              {referenceRequired && <span className="text-destructive"> *</span>}
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                (folio de transferencia, número de cheque, etc.)
              </span>
            </Label>
            <Input
              id="payment_reference"
              {...register('payment_reference')}
              className="h-9 font-mono text-sm"
              placeholder={method === 'cheque' ? 'No. de cheque' : method === 'transferencia' ? 'No. de operación / SPEI' : ''}
              aria-invalid={!!errors.payment_reference}
            />
            {errors.payment_reference && <p className="text-xs text-destructive">{errors.payment_reference.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Comprobante de pago (PDF o imagen)</Label>
            <input
              ref={proofRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (f.size > 10 * 1024 * 1024) {
                  toast.error('Archivo máximo 10 MB')
                  e.target.value = ''
                  return
                }
                setProofFile(f)
              }}
            />
            {proofFile ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 h-9">
                <Paperclip className="size-3.5 text-muted-foreground" />
                <span className="text-xs truncate flex-1">{proofFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setProofFile(null)
                    if (proofRef.current) proofRef.current.value = ''
                  }}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => proofRef.current?.click()}
                className="h-9 justify-start gap-2 text-muted-foreground text-xs"
              >
                <Paperclip className="size-3.5" /> Adjuntar comprobante (máx. 10 MB)
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment_notes">Notas (opcional)</Label>
            <Textarea
              id="payment_notes"
              {...register('payment_notes')}
              rows={2}
              placeholder="Comentarios adicionales sobre el pago…"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Registrando pago…' : 'Registrar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
