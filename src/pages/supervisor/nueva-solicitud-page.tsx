import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Plus,
  Trash2,
  Save,
} from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
import { useItems, useCropLots, useEquipment, useEmployees } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import { DESTINATION_TYPE_LABELS, SOLICITUD_URGENCY_LABELS } from '@/lib/constants'
import { cn, formatQuantity } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'
type SolicitudDestinationType = 'crop_lot' | 'equipment' | 'employee' | 'maintenance' | 'other'

import { PageHeader } from '@/components/custom/page-header'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Schemas ──────────────────────────────────────────────────────────────────

const lineSchema = z.object({
  item_id: z.string().min(1, 'Selecciona un artículo'),
  quantity_requested: z.coerce.number().positive('Debe ser mayor a 0'),
  notes: z.string().optional(),
})

const formSchema = z.object({
  destination_type: z.enum(['crop_lot', 'equipment', 'employee', 'maintenance', 'other'] as const).nullable(),
  crop_lot_id: z.string().optional(),
  equipment_id: z.string().optional(),
  employee_id: z.string().optional(),
  destination_notes: z.string().optional(),
  urgency: z.enum(['baja', 'normal', 'alta', 'urgente'] as const),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Agrega al menos un artículo'),
})

// Explicit type to avoid issues with z.coerce.number()
interface FormValues {
  destination_type: SolicitudDestinationType | null
  crop_lot_id?: string
  equipment_id?: string
  employee_id?: string
  destination_notes?: string
  urgency: 'baja' | 'normal' | 'alta' | 'urgente'
  notes?: string
  lines: Array<{
    item_id: string
    quantity_requested: number
    notes?: string
  }>
}

const DESTINATION_TYPES: SolicitudDestinationType[] = ['crop_lot', 'equipment', 'employee', 'maintenance', 'other']

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Destino' },
  { label: 'Artículos' },
  { label: 'Revisión' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SupervisorNuevaSolicitudPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization, activeSeason, profile } = useAuth()
  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: items } = useItems()
  const { data: cropLots } = useCropLots()
  const { data: equipmentList } = useEquipment()
  const { data: employees } = useEmployees()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      destination_type: null,
      crop_lot_id: '',
      equipment_id: '',
      employee_id: '',
      destination_notes: '',
      urgency: 'normal',
      notes: '',
      lines: [{ item_id: '', quantity_requested: 1, notes: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  })

  const destType = form.watch('destination_type')

  // ── Step validation ─────────────────────────────────────────────────────────

  const validateStep = async (s: number) => {
    if (s === 0) {
      return await form.trigger(['destination_type'])
    }
    if (s === 1) {
      return await form.trigger(['lines'])
    }
    return true
  }

  const handleNext = async () => {
    const valid = await validateStep(step)
    if (valid) setStep((p) => Math.min(p + 1, 2))
  }
  const handleBack = () => setStep((p) => Math.max(p - 1, 0))

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmitForm = async () => {
    const valid = await form.trigger()
    if (!valid) return
    if (!organization?.id || !activeSeason?.id || !profile?.id) {
      toast.error('Error de sesión. Recarga la página.')
      return
    }
    setIsSubmitting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = form.getValues() as any
    try {
      const solicitudPayload = {
        organization_id: organization.id,
        season_id: activeSeason.id,
        requested_by: profile.id,
        destination_type: values.destination_type ?? null,
        crop_lot_id: values.crop_lot_id || null,
        equipment_id: values.equipment_id || null,
        employee_id: values.employee_id || null,
        destination_notes: values.destination_notes || null,
        urgency: values.urgency,
        notes: values.notes || null,
        status: 'pendiente',
      }

      const { data: sol, error: solErr } = await db
        .from('solicitudes')
        .insert(solicitudPayload)
        .select()
        .single()

      if (solErr) throw solErr

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linesPayload = (values.lines as any[]).map((l: any) => ({
        solicitud_id: sol.id,
        item_id: l.item_id,
        quantity_requested: Number(l.quantity_requested),
        notes: l.notes || null,
      }))

      const { error: linesErr } = await db
        .from('solicitud_lines')
        .insert(linesPayload)

      if (linesErr) throw linesErr

      toast.success('Solicitud creada correctamente')
      navigate(`${basePath}/solicitudes/${sol.id}`)
    } catch (err: unknown) {
      const { title, description } = formatSupabaseError(err, 'No se pudo crear la solicitud')
      toast.error(title, { description })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Item options ─────────────────────────────────────────────────────────────

  const itemOptions = (items ?? []).map((i) => ({
    value: i.id,
    label: i.name,
    sublabel: i.sku,
  }))

  const cropLotOptions = (cropLots ?? []).map((l) => {
    const lot = l as { id: string; name: string; code: string }
    return { value: lot.id, label: lot.name, sublabel: lot.code }
  })

  const equipmentOptions = (equipmentList ?? []).map((e) => ({
    value: e.id,
    label: e.name,
    sublabel: e.code,
  }))

  const employeeOptions = (employees ?? []).map((e) => ({
    value: e.id,
    label: e.full_name,
    sublabel: e.employee_code,
  }))

  const values = form.watch()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Nueva solicitud"
        description="Solicita materiales e insumos"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/solicitudes`)}>
            <ArrowLeft className="mr-1.5 size-4" />
            Volver
          </Button>
        }
      />

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                i < step
                  ? 'bg-primary text-primary-foreground'
                  : i === step
                    ? 'border-2 border-primary text-primary'
                    : 'border border-border text-muted-foreground',
              )}
            >
              {i < step ? <CheckCircle className="size-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-sm sm:block',
                i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px w-8 flex-shrink-0', i < step ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void handleSubmitForm() }}>
        {/* ── Step 0: Destino ───────────────────────────────────────────────── */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destino del material</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo de destino</Label>
                <Select
                  value={values.destination_type ?? ''}
                  onValueChange={(v) => form.setValue('destination_type', (v || null) as SolicitudDestinationType | null)}
                >
                  <SelectTrigger>
                    <SelectValue>{values.destination_type ? DESTINATION_TYPE_LABELS[values.destination_type] : undefined}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DESTINATION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.destination_type && (
                  <p className="text-xs text-destructive">{form.formState.errors.destination_type.message}</p>
                )}
              </div>

              {destType === 'crop_lot' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Lote de cultivo</Label>
                  <SearchableSelect
                    value={values.crop_lot_id ?? ''}
                    onValueChange={(v) => form.setValue('crop_lot_id', v)}
                    options={cropLotOptions}
                    placeholder="Seleccionar lote…"
                    searchPlaceholder="Buscar lote…"
                  />
                </div>
              )}

              {destType === 'equipment' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Equipo</Label>
                  <SearchableSelect
                    value={values.equipment_id ?? ''}
                    onValueChange={(v) => form.setValue('equipment_id', v)}
                    options={equipmentOptions}
                    placeholder="Seleccionar equipo…"
                    searchPlaceholder="Buscar equipo…"
                  />
                </div>
              )}

              {destType === 'employee' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Empleado</Label>
                  <SearchableSelect
                    value={values.employee_id ?? ''}
                    onValueChange={(v) => form.setValue('employee_id', v)}
                    options={employeeOptions}
                    placeholder="Seleccionar empleado…"
                    searchPlaceholder="Buscar empleado…"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Notas de destino (opcional)</Label>
                <Textarea
                  placeholder="Descripción adicional del destino…"
                  {...form.register('destination_notes')}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 1: Artículos ─────────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">Artículos solicitados</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ item_id: '', quantity_requested: 1, notes: '' })}
              >
                <Plus className="mr-1.5 size-4" />
                Agregar artículo
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {form.formState.errors.lines?.root && (
                <p className="text-xs text-destructive">{form.formState.errors.lines.root.message}</p>
              )}
              {fields.map((field, i) => (
                <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Artículo {i + 1}</span>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => remove(i)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Artículo</Label>
                    <SearchableSelect
                      value={values.lines?.[i]?.item_id ?? ''}
                      onValueChange={(v) => form.setValue(`lines.${i}.item_id`, v)}
                      options={itemOptions}
                      placeholder="Buscar artículo…"
                      searchPlaceholder="SKU o nombre…"
                    />
                    {form.formState.errors.lines?.[i]?.item_id && (
                      <p className="text-xs text-destructive">{form.formState.errors.lines[i]?.item_id?.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Cantidad solicitada</Label>
                    <Input
                      type="number"
                      min={0.001}
                      step="any"
                      {...form.register(`lines.${i}.quantity_requested`)}
                    />
                    {form.formState.errors.lines?.[i]?.quantity_requested && (
                      <p className="text-xs text-destructive">{form.formState.errors.lines[i]?.quantity_requested?.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Input
                      placeholder="Especificaciones…"
                      {...form.register(`lines.${i}.notes`)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Revisión ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {/* Urgency + notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prioridad y notas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Urgencia</Label>
                  <Select
                    value={values.urgency}
                    onValueChange={(v) =>
                      form.setValue('urgency', v as FormValues['urgency'])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>{SOLICITUD_URGENCY_LABELS[values.urgency] ?? values.urgency}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baja">Baja</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Notas generales (opcional)</Label>
                  <Textarea
                    placeholder="Información adicional para el almacenista…"
                    {...form.register('notes')}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Destino</dt>
                  <dd className="font-medium">
                    {values.destination_type
                      ? DESTINATION_TYPE_LABELS[values.destination_type]
                      : '—'}
                  </dd>
                  <dt className="text-muted-foreground">Urgencia</dt>
                  <dd className="font-medium capitalize">{values.urgency}</dd>
                  <dt className="text-muted-foreground">Artículos</dt>
                  <dd className="font-medium">{values.lines?.length ?? 0}</dd>
                </dl>

                {values.lines && values.lines.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <ul className="flex flex-col gap-2">
                      {values.lines.map((l, i) => {
                        const item = (items ?? []).find((it) => it.id === l.item_id)
                        return (
                          <li key={i} className="flex justify-between text-sm">
                            <span>{item?.name ?? '—'}</span>
                            <span className="text-muted-foreground">
                              {formatQuantity(l.quantity_requested)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Navigation buttons ───────────────────────────────────────────── */}
        <div className="mt-6 flex justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-1.5 size-4" />
              Anterior
            </Button>
          ) : (
            <div />
          )}
          {step < 2 ? (
            <Button type="button" onClick={handleNext}>
              Siguiente
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-1.5 size-4" />
              {isSubmitting ? 'Guardando…' : 'Enviar solicitud'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default SupervisorNuevaSolicitudPage
