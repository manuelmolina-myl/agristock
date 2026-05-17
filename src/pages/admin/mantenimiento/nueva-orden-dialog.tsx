import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Wrench, Send, AlertOctagon } from 'lucide-react'
import { toast } from 'sonner'

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
import { formatSupabaseError } from '@/lib/errors'
import { useCreateCorrectiveWO } from '@/features/mantenimiento/hooks'
import {
  createCorrectiveWOSchema,
  type CreateCorrectiveWOInput,
} from '@/features/mantenimiento/schemas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface EquipOpt { id: string; code: string; name: string; current_hours: number | null; status: string }
interface FailureTypeOpt { id: string; code: string; label: string; severity: string }

interface Props {
  open: boolean
  onClose: () => void
}

export function NuevaOrdenDialog({ open, onClose }: Props) {
  const { mutate, isPending } = useCreateCorrectiveWO()

  const { data: equipments = [] } = useQuery<EquipOpt[]>({
    queryKey: ['cmms-equipment-options'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name, current_hours, status')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as EquipOpt[]
    },
  })

  const { data: failureTypes = [] } = useQuery<FailureTypeOpt[]>({
    queryKey: ['cmms-failure-types'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('failure_types')
        .select('id, code, label, severity')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('label')
      if (error) throw error
      return data as FailureTypeOpt[]
    },
  })

  const form = useForm<CreateCorrectiveWOInput>({
    resolver: zodResolver(createCorrectiveWOSchema),
    defaultValues: {
      equipment_id: '',
      failure_type_id: null,
      description: '',
      priority: 'medium',
      scheduled_date: null,
      photos: [],
    },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form

  const handleClose = () => {
    reset()
    onClose()
  }

  const onSubmit = (values: CreateCorrectiveWOInput) => {
    mutate(values, {
      onSuccess: () => {
        toast.success('Falla reportada', {
          description: 'Coordinación de mantenimiento la verá en su tablero.',
        })
        handleClose()
      },
      onError: (e) => {
        const { title, description } = formatSupabaseError(e, 'No se pudo reportar la falla')
        toast.error(title, { description })
      },
    })
  }

  const priority   = watch('priority')
  const equipmentId = watch('equipment_id')
  const failureId  = watch('failure_type_id')

  const selectedFailure = failureTypes.find((f) => f.id === failureId)
  const selectedEquip   = equipments.find((e) => e.id === equipmentId)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4" />
            Reportar falla
          </DialogTitle>
        </DialogHeader>

        <form id="new-wo-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Equipo <span className="text-destructive">*</span></Label>
            <Select
              value={equipmentId}
              onValueChange={(v) => setValue('equipment_id', v ?? '', { shouldDirty: true })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecciona un equipo" />
              </SelectTrigger>
              <SelectContent>
                {equipments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.name}
                    {e.current_hours != null && (
                      <span className="ml-2 text-muted-foreground text-xs">· {Number(e.current_hours).toLocaleString('es-MX')} hrs</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.equipment_id && (
              <p className="text-xs text-destructive">{errors.equipment_id.message}</p>
            )}
            {selectedEquip && selectedEquip.status !== 'operational' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertOctagon className="size-3" />
                Equipo en estado: {selectedEquip.status.replace('_', ' ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo de falla</Label>
              <Select
                value={failureId ?? '__none'}
                onValueChange={(v) => setValue('failure_type_id', v === '__none' ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Sin clasificar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin clasificar</SelectItem>
                  {failureTypes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFailure && (
                <p className="text-[10px] text-muted-foreground">
                  Severidad sugerida: {selectedFailure.severity}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Prioridad <span className="text-destructive">*</span></Label>
              <Select
                value={priority}
                onValueChange={(v) => setValue('priority', v as CreateCorrectiveWOInput['priority'], { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica — equipo parado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción de la falla <span className="text-destructive">*</span></Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Qué pasa, cómo se manifiesta, qué se intentó. Sé específico para que el técnico llegue con las refacciones correctas."
              rows={5}
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scheduled_date">Fecha sugerida (opcional)</Label>
            <Input
              id="scheduled_date"
              type="date"
              {...register('scheduled_date', { setValueAs: (v) => (v === '' || v == null ? null : v) })}
              className="h-9 sm:w-52"
            />
            <p className="text-[10px] text-muted-foreground">
              Si la dejas vacía, la orden queda como “reportada” y coordinación la programa.
            </p>
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
            {isPending ? 'Enviando…' : 'Reportar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
