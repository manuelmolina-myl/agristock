/**
 * RegistrarRecargaDialog — registra una recarga al tanque de diésel.
 *
 * Llama al RPC `register_diesel_load` (migración 060). Valida en cliente que
 * el nivel resultante no exceda la capacidad antes de invocar el RPC. Tras
 * éxito, invalida los queries relacionados al tanque.
 */
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Fuel, AlertTriangle } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useSuppliers } from '@/hooks/use-supabase-query'
import { formatSupabaseError } from '@/lib/errors'
import { formatQuantity, formatMoney } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const recargaSchema = z.object({
  liters: z.coerce.number().positive('Debe ser mayor a 0'),
  unit_cost_mxn: z
    .union([z.coerce.number().positive('Debe ser mayor a 0'), z.literal('')])
    .optional(),
  supplier_id: z.string().optional(),
  delivery_date: z.string().min(1, 'Fecha requerida'),
  fuel_invoice_folio: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
})

type RecargaForm = z.infer<typeof recargaSchema>

interface RegistrarRecargaDialogProps {
  open: boolean
  tankId: string
  tankName: string
  tankCode: string
  capacityLiters: number
  currentLevel: number
  defaultSupplierId?: string | null
  onClose: () => void
  onRegistered?: () => void
}

function todayInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function RegistrarRecargaDialog({
  open,
  tankId,
  tankName,
  tankCode,
  capacityLiters,
  currentLevel,
  defaultSupplierId,
  onClose,
  onRegistered,
}: RegistrarRecargaDialogProps) {
  const qc = useQueryClient()
  const { data: suppliers = [] } = useSuppliers()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<RecargaForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(recargaSchema) as any,
    defaultValues: {
      liters: undefined as unknown as number,
      unit_cost_mxn: '' as unknown as number,
      supplier_id: defaultSupplierId ?? '',
      delivery_date: todayInput(),
      fuel_invoice_folio: '',
      notes: '',
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = form

  const litersVal = watch('liters')
  const costVal = watch('unit_cost_mxn')
  const supplierVal = watch('supplier_id')

  const litersNum = typeof litersVal === 'number' && !isNaN(litersVal) ? litersVal : 0
  const costNum =
    typeof costVal === 'number' && !isNaN(costVal as number) ? (costVal as number) : 0
  const totalPreview = litersNum * costNum
  const resultingLevel = currentLevel + litersNum
  const exceedsCapacity = litersNum > 0 && resultingLevel > capacityLiters
  const remainingCapacity = Math.max(capacityLiters - currentLevel, 0)

  const supplierOptions = useMemo(
    () => suppliers.filter((s) => s.id && s.name),
    [suppliers],
  )

  const handleClose = () => {
    reset({
      liters: undefined as unknown as number,
      unit_cost_mxn: '' as unknown as number,
      supplier_id: defaultSupplierId ?? '',
      delivery_date: todayInput(),
      fuel_invoice_folio: '',
      notes: '',
    })
    onClose()
  }

  const onSubmit = async (values: RecargaForm) => {
    if (litersNum + currentLevel > capacityLiters) {
      toast.warning('Capacidad excedida', {
        description: `El nivel resultante (${formatQuantity(
          litersNum + currentLevel,
          1,
        )} L) supera la capacidad del tanque (${formatQuantity(capacityLiters, 1)} L).`,
      })
      return
    }

    setSubmitting(true)
    try {
      const unitCost =
        values.unit_cost_mxn === '' || values.unit_cost_mxn == null
          ? null
          : Number(values.unit_cost_mxn)

      const { error } = await db.rpc('register_diesel_load', {
        p_tank_id: tankId,
        p_liters: Number(values.liters),
        p_unit_cost_mxn: unitCost,
        p_supplier_id: values.supplier_id || null,
        p_fuel_invoice_folio: values.fuel_invoice_folio?.trim() || null,
        p_delivery_date: values.delivery_date || null,
        p_notes: values.notes?.trim() || null,
      })
      if (error) throw error

      toast.success('Recarga registrada', {
        description: `${formatQuantity(Number(values.liters), 1)} L cargados a ${tankName}`,
      })

      qc.invalidateQueries({ queryKey: ['tank-balance', tankId] })
      qc.invalidateQueries({ queryKey: ['tank-loads', tankId] })
      qc.invalidateQueries({ queryKey: ['diesel-tanks'] })

      onRegistered?.()
      handleClose()
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo registrar la recarga')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>Recargar tanque</DialogTitle>
          <DialogDescription>
            {tankName} · <span className="font-mono">{tankCode}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs flex items-center gap-3">
          <Fuel className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-muted-foreground">Nivel actual</p>
            <p className="font-mono tabular-nums font-medium text-foreground">
              {formatQuantity(currentLevel, 1)} L / {formatQuantity(capacityLiters, 1)} L
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Disponible</p>
            <p className="font-mono tabular-nums font-medium text-foreground">
              {formatQuantity(remainingCapacity, 1)} L
            </p>
          </div>
        </div>

        <form
          id="recarga-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="liters">
                Litros <span className="text-destructive">*</span>
              </Label>
              <Input
                id="liters"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register('liters')}
                className="h-9 font-mono"
                aria-invalid={!!errors.liters}
              />
              {errors.liters && (
                <p className="text-xs text-destructive">{errors.liters.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit_cost_mxn">
                Costo unitario (MXN)
                <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="unit_cost_mxn"
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                placeholder="0.00"
                {...register('unit_cost_mxn')}
                className="h-9 font-mono"
                aria-invalid={!!errors.unit_cost_mxn}
              />
              {errors.unit_cost_mxn && (
                <p className="text-xs text-destructive">
                  {errors.unit_cost_mxn.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delivery_date">
                Fecha de entrega <span className="text-destructive">*</span>
              </Label>
              <Input
                id="delivery_date"
                type="date"
                {...register('delivery_date')}
                className="h-9"
                aria-invalid={!!errors.delivery_date}
              />
              {errors.delivery_date && (
                <p className="text-xs text-destructive">{errors.delivery_date.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Proveedor
                <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Select
                value={supplierVal || ''}
                onValueChange={(v) => {
                  const next = v ?? ''
                  setValue('supplier_id', next === '__none__' ? '' : next, {
                    shouldDirty: true,
                  })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sin proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin proveedor</SelectItem>
                  {supplierOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fuel_invoice_folio">
              Folio de factura / ticket
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="fuel_invoice_folio"
              {...register('fuel_invoice_folio')}
              className="h-9 font-mono text-sm"
              placeholder="Ej. FAC-12345"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={2}
              placeholder="Observaciones de la recarga…"
            />
          </div>

          {/* Total preview */}
          {litersNum > 0 && costNum > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total estimado</span>
              <span className="font-mono font-semibold text-primary">
                {formatMoney(totalPreview, 'MXN')}
              </span>
            </div>
          )}

          {/* Capacity warning */}
          {exceedsCapacity && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive">
                <p className="font-medium">Excede la capacidad del tanque</p>
                <p className="text-destructive/80">
                  Nivel resultante: {formatQuantity(resultingLevel, 1)} L · Máximo:{' '}
                  {formatQuantity(capacityLiters, 1)} L
                </p>
              </div>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting || exceedsCapacity}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Registrando…' : 'Registrar recarga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default RegistrarRecargaDialog
