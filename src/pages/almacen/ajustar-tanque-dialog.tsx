/**
 * AjustarTanqueDialog — ajuste manual del nivel de un tanque (admin).
 *
 * Llama al RPC `adjust_diesel_tank` (migración 060), que valida que el motivo
 * tenga al menos 3 caracteres y que el nivel esté entre 0 y la capacidad.
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, SlidersHorizontal } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { formatQuantity } from '@/lib/utils'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const ajusteSchema = z.object({
  new_level: z.coerce.number().min(0, 'Debe ser mayor o igual a 0'),
  reason: z.string().min(3, 'Indica el motivo del ajuste (mínimo 3 caracteres)'),
})

type AjusteForm = z.infer<typeof ajusteSchema>

interface AjustarTanqueDialogProps {
  open: boolean
  tankId: string
  tankName: string
  tankCode: string
  capacityLiters: number
  currentLevel: number
  onClose: () => void
  onAdjusted?: () => void
}

export function AjustarTanqueDialog({
  open,
  tankId,
  tankName,
  tankCode,
  capacityLiters,
  currentLevel,
  onClose,
  onAdjusted,
}: AjustarTanqueDialogProps) {
  const qc = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<AjusteForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ajusteSchema) as any,
    defaultValues: {
      new_level: currentLevel,
      reason: '',
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = form

  const newLevelVal = watch('new_level')
  const newLevelNum =
    typeof newLevelVal === 'number' && !isNaN(newLevelVal) ? newLevelVal : 0
  const delta = newLevelNum - currentLevel
  const exceedsCapacity = newLevelNum > capacityLiters

  const handleClose = () => {
    reset({ new_level: currentLevel, reason: '' })
    onClose()
  }

  const onSubmit = async (values: AjusteForm) => {
    if (values.new_level > capacityLiters) {
      toast.warning('Capacidad excedida', {
        description: `El nivel debe ser menor o igual a la capacidad (${formatQuantity(
          capacityLiters,
          1,
        )} L).`,
      })
      return
    }

    setSubmitting(true)
    try {
      const { error } = await db.rpc('adjust_diesel_tank', {
        p_tank_id: tankId,
        p_new_level: Number(values.new_level),
        p_reason: values.reason.trim(),
      })
      if (error) throw error

      toast.success('Nivel ajustado', {
        description: `Nuevo nivel: ${formatQuantity(values.new_level, 1)} L`,
      })

      qc.invalidateQueries({ queryKey: ['tank-balance', tankId] })
      qc.invalidateQueries({ queryKey: ['diesel-tanks'] })

      onAdjusted?.()
      handleClose()
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo ajustar el tanque')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            Ajustar nivel del tanque
          </DialogTitle>
          <DialogDescription>
            {tankName} · <span className="font-mono">{tankCode}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Nivel actual</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatQuantity(currentLevel, 1)} L
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-muted-foreground">Capacidad</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatQuantity(capacityLiters, 1)} L
            </span>
          </div>
        </div>

        <form
          id="ajuste-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new_level">
              Nuevo nivel (L) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new_level"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max={capacityLiters}
              {...register('new_level')}
              className="h-9 font-mono"
              aria-invalid={!!errors.new_level}
            />
            {errors.new_level && (
              <p className="text-xs text-destructive">{errors.new_level.message}</p>
            )}
            {newLevelNum > 0 && !exceedsCapacity && delta !== 0 && (
              <p className="text-xs text-muted-foreground">
                Cambio:{' '}
                <span
                  className={
                    delta > 0 ? 'text-success font-medium' : 'text-destructive font-medium'
                  }
                >
                  {delta > 0 ? '+' : ''}
                  {formatQuantity(delta, 1)} L
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">
              Motivo del ajuste <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              {...register('reason')}
              rows={3}
              placeholder="Ej. Lectura de varilla; merma por evaporación; corrección de inventario…"
              aria-invalid={!!errors.reason}
            />
            {errors.reason && (
              <p className="text-xs text-destructive">{errors.reason.message}</p>
            )}
          </div>
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
            {submitting ? 'Guardando…' : 'Ajustar nivel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AjustarTanqueDialog
