import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { formatSupabaseError } from '@/lib/errors'

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { supabase } from '@/lib/supabase'
import {
  requisitionCreateSchema,
  type RequisitionCreateInput,
} from '@/features/compras/schemas'
import { useCreateRequisition } from '@/features/compras/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface ItemOption {
  id: string
  sku: string
  name: string
  native_currency: 'MXN' | 'USD'
}

interface LotOption { id: string; name: string }
interface EquipOption { id: string; name: string; code: string }

interface Props {
  open: boolean
  onClose: () => void
}

export function NuevaRequisicionSheet({ open, onClose }: Props) {
  const { mutate: createReq, isPending } = useCreateRequisition()

  const { data: items = [] } = useQuery<ItemOption[]>({
    queryKey: ['compras-items-options'],
    queryFn: async () => {
      const { data, error } = await db
        .from('items')
        .select('id, sku, name, native_currency')
        .is('deleted_at', null)
        .order('name')
        .limit(500)
      if (error) throw error
      return data as ItemOption[]
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const { data: lots = [] } = useQuery<LotOption[]>({
    queryKey: ['compras-lots-options'],
    queryFn: async () => {
      const { data, error } = await db
        .from('crops_lots')
        .select('id, name')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as LotOption[]
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const { data: equipments = [] } = useQuery<EquipOption[]>({
    queryKey: ['compras-equipments-options'],
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, name, code')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as EquipOption[]
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const form = useForm<RequisitionCreateInput>({
    resolver: zodResolver(requisitionCreateSchema),
    defaultValues: {
      priority: 'medium',
      justification: '',
      crop_lot_id: null,
      equipment_id: null,
      notes: null,
      lines: [
        {
          item_id: null,
          free_description: null,
          quantity: 1,
          unit_id: null,
          estimated_unit_cost: null,
          currency: 'MXN',
          notes: null,
        },
      ],
    },
  })

  const { control, register, handleSubmit, formState: { errors }, setValue, watch, reset } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const handleClose = () => {
    reset()
    onClose()
  }

  const onSubmit = (values: RequisitionCreateInput) => {
    createReq(values, {
      onSuccess: (req) => {
        toast.success(`Requisición ${req.folio} creada`, {
          description: 'Se envió para cotización / aprobación.',
        })
        handleClose()
      },
      onError: (e: unknown) => {
        const { title, description } = formatSupabaseError(e, 'No se pudo crear la requisición')
        toast.error(title, { description })
      },
    })
  }

  const priority = watch('priority')
  const cropLotId = watch('crop_lot_id')
  const equipmentId = watch('equipment_id')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva requisición de compra</DialogTitle>
        </DialogHeader>

        <form id="new-req-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Prioridad</Label>
              <Select
                value={priority}
                onValueChange={(v) => setValue('priority', v as RequisitionCreateInput['priority'], { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Lote (opcional)</Label>
              <Select
                value={cropLotId ?? '__none'}
                onValueChange={(v) => setValue('crop_lot_id', v === '__none' ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Sin lote" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin lote</SelectItem>
                  {lots.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Equipo (opcional)</Label>
              <Select
                value={equipmentId ?? '__none'}
                onValueChange={(v) => setValue('equipment_id', v === '__none' ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Sin equipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin equipo</SelectItem>
                  {equipments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="justification">Justificación <span className="text-destructive">*</span></Label>
            <Textarea
              id="justification"
              {...register('justification')}
              placeholder="¿Por qué necesitas estos materiales? Cultivo / equipo / urgencia."
              rows={3}
              aria-invalid={!!errors.justification}
            />
            {errors.justification && (
              <p className="text-xs text-destructive">{errors.justification.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Ítems solicitados</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => append({
                  item_id: null, free_description: null, quantity: 1, unit_id: null,
                  estimated_unit_cost: null, currency: 'MXN', notes: null,
                })}
              >
                <Plus className="size-3.5" /> Agregar línea
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {fields.map((field, idx) => {
                const lineItemId = watch(`lines.${idx}.item_id`)
                return (
                  <div key={field.id} className="rounded-md border bg-muted/20 p-3 flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_auto] gap-2 items-end">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Ítem</Label>
                        <Select
                          value={lineItemId ?? '__free'}
                          onValueChange={(v) => {
                            if (v === '__free') {
                              setValue(`lines.${idx}.item_id`, null, { shouldDirty: true })
                            } else {
                              setValue(`lines.${idx}.item_id`, v, { shouldDirty: true })
                              setValue(`lines.${idx}.free_description`, null, { shouldDirty: true })
                              const it = items.find((i) => i.id === v)
                              if (it) setValue(`lines.${idx}.currency`, it.native_currency, { shouldDirty: true })
                            }
                          }}
                        >
                          <SelectTrigger className="h-9"><SelectValue placeholder="Catálogo o libre" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__free">Ítem no catalogado (descripción libre)</SelectItem>
                            {items.map((i) => (
                              <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cantidad</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          {...register(`lines.${idx}.quantity`, { valueAsNumber: true })}
                          className="h-9 text-right tabular-nums"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Costo est.</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...register(`lines.${idx}.estimated_unit_cost`, {
                            setValueAs: (v) => (v === '' || v == null) ? null : Number(v),
                          })}
                          className="h-9 text-right tabular-nums"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => fields.length > 1 && remove(idx)}
                        disabled={fields.length === 1}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Eliminar línea"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {lineItemId == null && (
                      <Input
                        placeholder="Describe el material no catalogado…"
                        {...register(`lines.${idx}.free_description`)}
                        className="h-9 text-sm"
                      />
                    )}
                  </div>
                )
              })}
              {errors.lines?.root && (
                <p className="text-xs text-destructive">{errors.lines.root.message}</p>
              )}
              {Array.isArray(errors.lines) && errors.lines.length > 0 && (
                <p className="text-xs text-destructive">Revisa los campos de las líneas.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas adicionales (opcional)</Label>
            <Textarea id="notes" {...register('notes')} rows={2} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isPending}
            className="gap-1.5"
          >
            <Send className="size-4" />
            {isPending ? 'Enviando…' : 'Enviar requisición'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
