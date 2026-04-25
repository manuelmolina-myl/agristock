import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath, useCanSeePrices } from '@/hooks/use-base-path'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Fuel,
  AlertCircle,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  useWarehouses,
  useCropLots,
  useEquipment,
  useEmployees,
  useItems,
  useList,
  useFxRates,
} from '@/hooks/use-supabase-query'
import type {
  DestinationType,
  MovementType,
  StockMovement,
  StockMovementLine,
  ItemStock,
} from '@/lib/database.types'
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatMoney, formatQuantity, cn } from '@/lib/utils'
import { generateValePDF } from '@/lib/generate-vale-pdf'

import { PageHeader } from '@/components/custom/page-header'
import { SearchableSelect } from '@/components/shared/searchable-select'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

// ─── Folio generator ──────────────────────────────────────────────────────────

async function generateFolioSalida(orgId: string): Promise<string> {
  const { data } = await (supabase as any)
    .from('stock_movements')
    .select('document_number')
    .eq('organization_id', orgId)
    .like('document_number', 'SAL-%')
    .order('document_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.document_number as string | undefined
  const num = last ? (parseInt(last.match(/\d+$/)?.[0] ?? '0', 10) + 1) : 1
  return `SAL-${String(num).padStart(5, '0')}`
}

// ─── Constants ────────────────────────────────────────────────────────────────

const db = supabase as any

const EXIT_MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: 'exit_consumption', label: 'Consumo' },
  { value: 'exit_transfer', label: 'Traspaso salida' },
  { value: 'exit_adjustment', label: 'Ajuste salida' },
  { value: 'exit_waste', label: 'Merma' },
  { value: 'exit_sale', label: 'Venta' },
]

const DESTINATION_OPTIONS: { value: DestinationType; label: string }[] = [
  { value: 'crop_lot', label: 'Lote de cultivo' },
  { value: 'equipment', label: 'Tractor / Equipo' },
  { value: 'employee', label: 'Empleado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'waste', label: 'Merma' },
  { value: 'other', label: 'Otro' },
]

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const lineSchema = z.object({
  item_id: z.string().min(1, 'Selecciona un ítem'),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  unit_cost_native: z.coerce.number().min(0),
  native_currency: z.enum(['MXN', 'USD']),
  cost_center_notes: z.string().optional(),
  // Diesel extras
  diesel_liters: z.coerce.number().optional(),
  equipment_hours_before: z.coerce.number().optional(),
  equipment_hours_after: z.coerce.number().optional(),
  equipment_km_before: z.coerce.number().optional(),
  equipment_km_after: z.coerce.number().optional(),
  operator_employee_id: z.string().optional(),
})

const step1aSchema = z.object({
  movement_type: z.enum([
    'exit_consumption',
    'exit_transfer',
    'exit_adjustment',
    'exit_waste',
    'exit_sale',
  ]),
  warehouse_id: z.string().min(1, 'Selecciona un almacén'),
  destination_type: z.enum(['crop_lot', 'equipment', 'employee', 'maintenance', 'waste', 'other']),
})

const step1Schema = z.object({
  destination_type: z.enum(['crop_lot', 'equipment', 'employee', 'maintenance', 'waste', 'other']),
  crop_lot_id: z.string().optional(),
  equipment_id: z.string().optional(),
  employee_id: z.string().optional(),
  destination_notes: z.string().optional(),
  warehouse_id: z.string().min(1, 'Selecciona un almacén'),
  movement_type: z.enum([
    'exit_consumption',
    'exit_transfer',
    'exit_adjustment',
    'exit_waste',
    'exit_sale',
  ]),
  date: z.string().min(1, 'Selecciona una fecha'),
  notes: z.string().optional(),
  reference_external: z.string().optional(),
  delivered_by_employee_id: z.string().optional(),
  received_by_employee_id: z.string().optional(),
})

type Step1aValues = z.infer<typeof step1aSchema>

const step2Schema = z.object({
  lines: z.array(lineSchema).min(1, 'Agrega al menos una partida'),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { label: 'Destino', labelMobile: 'Dest.' },
    { label: 'Detalles', labelMobile: 'Det.' },
    { label: 'Partidas', labelMobile: 'Part.' },
    { label: 'Revisión', labelMobile: 'Rev.' },
  ]
  return (
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto">
      {steps.map(({ label, labelMobile }, i) => {
        const idx = i + 1
        const active = idx === step
        const done = idx < step
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors',
                  active && 'bg-background border-primary text-primary',
                  done && 'bg-primary border-primary text-primary-foreground',
                  !active && !done && 'bg-background border-border text-muted-foreground'
                )}
              >
                {done ? <Check className="size-3.5" /> : idx}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap hidden sm:block',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap sm:hidden',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {labelMobile}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-1.5 mb-4 transition-colors', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: Destino (tipo + almacén + tipo destino) ──────────────────────────

interface Step1Props {
  defaultValues: Partial<Step1aValues>
  onNext: (data: Step1aValues) => void
}

function Step1Destino({ defaultValues, onNext }: Step1Props) {
  const { data: warehouses = [] } = useWarehouses()

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Step1aValues>({
    resolver: zodResolver(step1aSchema) as any,
    defaultValues: {
      movement_type: 'exit_consumption',
      destination_type: 'crop_lot',
      warehouse_id: '',
      ...defaultValues,
    },
  })

  return (
    <form onSubmit={handleSubmit(onNext as any)} className="flex flex-col gap-6">
      {/* Tipo de salida */}
      <div className="flex flex-col gap-1.5">
        <Label>Tipo de salida</Label>
        <Controller
          name="movement_type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue>{EXIT_MOVEMENT_TYPES.find((t) => t.value === field.value)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXIT_MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.movement_type && (
          <p className="text-xs text-destructive">{errors.movement_type.message}</p>
        )}
      </div>

      {/* Almacén origen */}
      <div className="flex flex-col gap-1.5">
        <Label>Almacén origen</Label>
        <Controller
          name="warehouse_id"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value ?? ''}
              onValueChange={field.onChange}
              options={warehouses.map((w) => ({ value: w.id, label: w.name, sublabel: w.code }))}
              placeholder="Seleccionar almacén"
              searchPlaceholder="Buscar almacén…"
              emptyMessage="Sin almacenes."
            />
          )}
        />
        {errors.warehouse_id && (
          <p className="text-xs text-destructive">{errors.warehouse_id.message}</p>
        )}
      </div>

      {/* Tipo de destino */}
      <div className="flex flex-col gap-1.5">
        <Label>Tipo de destino</Label>
        <Controller
          name="destination_type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue>{DESTINATION_OPTIONS.find((d) => d.value === field.value)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DESTINATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.destination_type && (
          <p className="text-xs text-destructive">{errors.destination_type.message}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Siguiente
          <ChevronRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 2: Detalles (destino específico + fecha + notas) ────────────────────

interface Step2DetallesProps {
  step1a: Step1aValues
  defaultValues: Partial<Step1Values>
  onNext: (data: Step1Values) => void
  onBack: () => void
}

function Step2Detalles({ step1a, defaultValues, onNext, onBack }: Step2DetallesProps) {
  const { data: cropLots = [] } = useCropLots()
  const { data: equipment = [] } = useEquipment()
  const { data: employees = [] } = useEmployees()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema) as any,
    defaultValues: {
      movement_type: step1a.movement_type,
      warehouse_id: step1a.warehouse_id,
      destination_type: step1a.destination_type,
      date: new Date().toISOString().slice(0, 10),
      ...defaultValues,
    },
  })

  const destinationType = step1a.destination_type

  return (
    <form onSubmit={handleSubmit(onNext as any)} className="flex flex-col gap-6">
      {/* Destino específico */}
      {destinationType === 'crop_lot' && (
        <div className="flex flex-col gap-1.5">
          <Label>Lote de cultivo</Label>
          <Controller
            name="crop_lot_id"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value ?? ''}
                onValueChange={field.onChange}
                options={(cropLots as any[]).map((lot) => ({
                  value: lot.id,
                  label: lot.name ?? `Lote ${lot.code}`,
                  sublabel: lot.code,
                }))}
                placeholder="Seleccionar lote"
                searchPlaceholder="Buscar lote…"
                emptyMessage="Sin lotes."
              />
            )}
          />
        </div>
      )}

      {destinationType === 'equipment' && (
        <div className="flex flex-col gap-1.5">
          <Label>Equipo / Tractor</Label>
          <Controller
            name="equipment_id"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value ?? ''}
                onValueChange={field.onChange}
                options={equipment.map((eq) => ({ value: eq.id, label: eq.name, sublabel: eq.code }))}
                placeholder="Seleccionar equipo"
                searchPlaceholder="Buscar equipo…"
                emptyMessage="Sin equipos."
              />
            )}
          />
        </div>
      )}

      {destinationType === 'employee' && (
        <div className="flex flex-col gap-1.5">
          <Label>Empleado</Label>
          <Controller
            name="employee_id"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                value={field.value ?? ''}
                onValueChange={field.onChange}
                options={employees.map((emp) => ({
                  value: emp.id,
                  label: emp.full_name,
                  sublabel: emp.employee_code,
                }))}
                placeholder="Seleccionar empleado"
                searchPlaceholder="Buscar empleado…"
                emptyMessage="Sin empleados."
              />
            )}
          />
        </div>
      )}

      {(destinationType === 'maintenance' ||
        destinationType === 'waste' ||
        destinationType === 'other') && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destination_notes">Notas del destino</Label>
          <Input
            id="destination_notes"
            placeholder="Descripción del destino..."
            {...register('destination_notes')}
          />
        </div>
      )}

      {/* Fecha */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date">Fecha <span className="text-destructive">*</span></Label>
        <Input id="date" type="date" {...register('date')} />
        {errors.date && (
          <p className="text-xs text-destructive">{errors.date.message}</p>
        )}
      </div>

      {/* Folio externo */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference_external">Folio del negocio / documento</Label>
        <Input
          id="reference_external"
          placeholder="# vale, remisión, orden de trabajo…"
          {...register('reference_external')}
        />
        <p className="text-xs text-muted-foreground">El folio del sistema (SAL-XXXXX) se genera automáticamente al guardar.</p>
      </div>

      {/* Entrega */}
      <div className="flex flex-col gap-1.5">
        <Label>Entrega (almacén)</Label>
        <Controller
          name="delivered_by_employee_id"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value ?? ''}
              onValueChange={field.onChange}
              options={[
                { value: '', label: 'Sin especificar' },
                ...employees.map((emp) => ({
                  value: emp.id,
                  label: emp.full_name,
                  sublabel: emp.employee_code,
                })),
              ]}
              placeholder="Quien entrega desde el almacén"
              searchPlaceholder="Buscar empleado…"
              emptyMessage="Sin empleados."
            />
          )}
        />
      </div>

      {/* Recibe */}
      <div className="flex flex-col gap-1.5">
        <Label>Recibe (destino)</Label>
        <Controller
          name="received_by_employee_id"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value ?? ''}
              onValueChange={field.onChange}
              options={[
                { value: '', label: 'Sin especificar' },
                ...employees.map((emp) => ({
                  value: emp.id,
                  label: emp.full_name,
                  sublabel: emp.employee_code,
                })),
              ]}
              placeholder="Quien recibe en el destino"
              searchPlaceholder="Buscar empleado…"
              emptyMessage="Sin empleados."
            />
          )}
        />
      </div>

      {/* Notas generales */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notas generales</Label>
        <Textarea
          id="notes"
          placeholder="Observaciones o instrucciones adicionales…"
          rows={3}
          {...register('notes')}
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" />
          Atrás
        </Button>
        <Button type="submit">
          Siguiente
          <ChevronRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 2: Partidas ─────────────────────────────────────────────────────────

interface Step2Props {
  step1: Step1Values
  defaultValues: Partial<Step2Values>
  onNext: (data: Step2Values) => void
  onBack: () => void
  fxRate: number
  canSeePrices: boolean
}

function Step2Partidas({ step1, defaultValues, onNext, onBack, fxRate: latestFxRate, canSeePrices }: Step2Props) {
  const { data: items = [] } = useItems()
  const { data: employees = [] } = useEmployees()

  const { activeSeason } = useAuth()

  const { data: stockRows = [] } = useList<ItemStock & { item?: any }>(
    'item_stock',
    {
      select: '*, item:items(*, unit:units(*))',
      orderBy: 'item_id',
      filters: {
        warehouse_id: step1.warehouse_id,
        ...(activeSeason?.id ? { season_id: activeSeason.id } : {}),
      },
      enabled: !!step1.warehouse_id,
    }
  )

  // Map itemId -> available qty
  const stockMap: Record<string, number> = {}
  for (const row of stockRows) {
    stockMap[row.item_id] = row.quantity
    // also store avg cost for autofill
    ;(stockMap as any)[`cost_${row.item_id}`] = row.avg_cost_native
    ;(stockMap as any)[`currency_${row.item_id}`] = row.item?.native_currency ?? 'MXN'
  }

  const {
    control,
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Values>({
    resolver: zodResolver(step2Schema) as any,
    defaultValues: defaultValues.lines?.length
      ? defaultValues
      : {
          lines: [
            {
              item_id: '',
              quantity: 1,
              unit_cost_native: 0,
              native_currency: 'MXN',
            },
          ],
        },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchedLines = watch('lines')

  function handleItemChange(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    const avgCost = (stockMap as any)[`cost_${itemId}`] ?? 0
    const currency = (stockMap as any)[`currency_${itemId}`] ?? item.native_currency
    setValue(`lines.${index}.unit_cost_native`, avgCost)
    setValue(`lines.${index}.native_currency`, currency)
  }

  const totalMxn = watchedLines.reduce((sum, line) => {
    const cost = line.unit_cost_native ?? 0
    const qty = line.quantity ?? 0
    const currency = line.native_currency ?? 'MXN'
    const mxn = currency === 'USD' ? cost * (latestFxRate ?? 1) : cost
    return sum + mxn * qty
  }, 0)

  return (
    <form onSubmit={handleSubmit(onNext as any)} className="flex flex-col gap-6">
      {/* ── Lines ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const itemId = watchedLines[index]?.item_id
          const item = items.find((i) => i.id === itemId)
          const available = itemId ? stockMap[itemId] ?? 0 : null
          const qty = watchedLines[index]?.quantity ?? 0
          const overStock = available != null && qty > available
          const isDiesel = item?.is_diesel ?? false

          return (
            <div
              key={field.id}
              className={cn(
                'rounded-lg border bg-card p-4 flex flex-col gap-3',
                overStock && 'border-orange-400 dark:border-orange-500'
              )}
            >
              {/* Row 1: ítem — full width */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Ítem</Label>
                <Controller
                  name={`lines.${index}.item_id`}
                  control={control}
                  render={({ field: f }) => (
                    <SearchableSelect
                      value={f.value}
                      onValueChange={(v) => {
                        f.onChange(v)
                        if (v) handleItemChange(index, v)
                      }}
                      options={items.map((it) => ({
                        value: it.id,
                        label: it.is_diesel ? `⛽ ${it.name}` : it.name,
                        sublabel: it.sku,
                      }))}
                      placeholder="Seleccionar ítem"
                      searchPlaceholder="Buscar ítem…"
                      emptyMessage="Sin artículos."
                      triggerClassName="h-8 text-sm"
                    />
                  )}
                />
                {errors.lines?.[index]?.item_id && (
                  <p className="text-xs text-destructive">
                    {errors.lines[index]?.item_id?.message}
                  </p>
                )}
              </div>

              {/* Row 2: cantidad + costo + moneda */}
              <div className={canSeePrices ? "grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_auto]" : "grid grid-cols-1 gap-3"}>
                {/* Quantity */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">
                    Cantidad
                    {available != null && (
                      <span className="ml-1 text-muted-foreground">
                        (disp. {formatQuantity(available)})
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className="h-8 text-sm"
                    {...register(`lines.${index}.quantity`)}
                  />
                  {errors.lines?.[index]?.quantity && (
                    <p className="text-xs text-destructive">
                      {errors.lines[index]?.quantity?.message}
                    </p>
                  )}
                </div>

                {/* Cost (read-only) — hidden for almacenista */}
                {canSeePrices && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Costo unit.</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      className="h-8 text-sm bg-muted/40"
                      readOnly
                      {...register(`lines.${index}.unit_cost_native`)}
                    />
                  </div>
                )}

                {/* Currency (read-only) — hidden for almacenista */}
                {canSeePrices && (
                  <div className="flex flex-col gap-1 col-span-2 md:col-span-1 md:w-20">
                    <Label className="text-xs">Moneda</Label>
                    <Input
                      className="h-8 text-sm bg-muted/40 uppercase"
                      readOnly
                      {...register(`lines.${index}.native_currency`)}
                    />
                  </div>
                )}
              </div>

              {/* Over-stock warning */}
              {overStock && (
                <div className="flex items-start gap-2 rounded-md border border-orange-400 bg-orange-50 dark:bg-orange-950/20 py-2 px-3">
                  <AlertCircle className="size-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    Cantidad supera el stock disponible ({formatQuantity(available ?? 0)}).
                    Se registrará un saldo negativo.
                  </p>
                </div>
              )}

              {/* Diesel extras */}
              {isDiesel && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 p-3 flex flex-col gap-3">
                  <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                    <Fuel className="size-3.5" /> Datos de diesel
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Litros cargados</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-sm"
                        placeholder="0.00"
                        {...register(`lines.${index}.diesel_liters`)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Horómetro antes</Label>
                      <Input
                        type="number"
                        step="0.1"
                        className="h-8 text-sm"
                        {...register(`lines.${index}.equipment_hours_before`)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Horómetro después</Label>
                      <Input
                        type="number"
                        step="0.1"
                        className="h-8 text-sm"
                        {...register(`lines.${index}.equipment_hours_after`)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Km antes</Label>
                      <Input
                        type="number"
                        step="1"
                        className="h-8 text-sm"
                        {...register(`lines.${index}.equipment_km_before`)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Km después</Label>
                      <Input
                        type="number"
                        step="1"
                        className="h-8 text-sm"
                        {...register(`lines.${index}.equipment_km_after`)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Operador</Label>
                      <Controller
                        name={`lines.${index}.operator_employee_id`}
                        control={control}
                        render={({ field: f }) => (
                          <SearchableSelect
                            value={f.value ?? ''}
                            onValueChange={f.onChange}
                            options={employees.map((emp) => ({
                              value: emp.id,
                              label: emp.full_name,
                              sublabel: emp.employee_code,
                            }))}
                            placeholder="Seleccionar"
                            searchPlaceholder="Buscar operador…"
                            emptyMessage="Sin empleados."
                            triggerClassName="h-8 text-sm"
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes + remove */}
              <div className="flex items-end gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <Label className="text-xs">Notas de partida</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Referencia o concepto…"
                    {...register(`lines.${index}.cost_center_notes`)}
                  />
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {errors.lines?.root && (
          <p className="text-xs text-destructive">{errors.lines.root.message}</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            append({
              item_id: '',
              quantity: 1,
              unit_cost_native: 0,
              native_currency: 'MXN',
            })
          }
        >
          <Plus className="mr-1.5 size-3.5" />
          Agregar partida
        </Button>
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      {canSeePrices && (
        <div className="rounded-lg border bg-muted/30 p-4 flex justify-end">
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Total estimado
            </span>
            <span className="text-lg font-semibold tabular-nums font-mono">
              {formatMoney(totalMxn, 'MXN')}
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" />
          Atrás
        </Button>
        <Button type="submit">
          Siguiente
          <ChevronRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 3: Revisión ─────────────────────────────────────────────────────────

interface Step3Props {
  step1: Step1Values
  step2: Step2Values
  onBack: () => void
  onSaveDraft: () => Promise<void>
  onRegister: () => Promise<void>
  isSubmitting: boolean
  fxRate: number
  canSeePrices: boolean
}

function Step3Revision({ step1, step2, onBack, onSaveDraft, onRegister, isSubmitting, fxRate: latestFxRate, canSeePrices }: Step3Props) {
  const { data: warehouses = [] } = useWarehouses()
  const { data: items = [] } = useItems()
  const { data: cropLots = [] } = useCropLots()
  const { data: equipment = [] } = useEquipment()
  const { data: employees = [] } = useEmployees()

  const warehouse = warehouses.find((w) => w.id === step1.warehouse_id)
  const cropLot = (cropLots as any[]).find((l) => l.id === step1.crop_lot_id)
  const equip = equipment.find((e) => e.id === step1.equipment_id)
  const employee = employees.find((e) => e.id === step1.employee_id)

  function getDestinationLabel() {
    if (step1.destination_type === 'crop_lot' && cropLot) {
      return `Lote ${cropLot.code} — ${cropLot.crop_type}`
    }
    if (step1.destination_type === 'equipment' && equip) {
      return `${equip.code} — ${equip.name}`
    }
    if (step1.destination_type === 'employee' && employee) {
      return `${employee.employee_code} — ${employee.full_name}`
    }
    return step1.destination_notes ?? DESTINATION_OPTIONS.find((d) => d.value === step1.destination_type)?.label ?? '—'
  }

  const totalMxn = step2.lines.reduce((sum, line) => {
    const cost = line.unit_cost_native ?? 0
    const qty = line.quantity ?? 0
    const currency = line.native_currency ?? 'MXN'
    const mxn = currency === 'USD' ? cost * (latestFxRate ?? 1) : cost
    return sum + mxn * qty
  }, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Destination summary ──────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">Destino</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Tipo</dt>
            <dd>{MOVEMENT_TYPE_LABELS[step1.movement_type]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha</dt>
            <dd>{step1.date}</dd>
          </div>
          {step1.reference_external && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Folio del negocio</dt>
              <dd>{step1.reference_external}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Almacén origen</dt>
            <dd>{warehouse ? `${warehouse.code} — ${warehouse.name}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Destino</dt>
            <dd>{getDestinationLabel()}</dd>
          </div>
          {step1.delivered_by_employee_id && (() => {
            const emp = employees.find((e) => e.id === step1.delivered_by_employee_id)
            return emp ? (
              <div>
                <dt className="text-xs text-muted-foreground">Entrega</dt>
                <dd className="font-medium">{emp.full_name} <span className="text-muted-foreground font-normal font-mono text-xs">({emp.employee_code})</span></dd>
              </div>
            ) : null
          })()}
          {step1.received_by_employee_id && (() => {
            const emp = employees.find((e) => e.id === step1.received_by_employee_id)
            return emp ? (
              <div>
                <dt className="text-xs text-muted-foreground">Recibe</dt>
                <dd className="font-medium">{emp.full_name} <span className="text-muted-foreground font-normal font-mono text-xs">({emp.employee_code})</span></dd>
              </div>
            ) : null
          })()}
          {step1.notes && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Notas</dt>
              <dd className="text-muted-foreground">{step1.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Lines summary ────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5">
          <p className="text-sm font-semibold">
            Partidas ({step2.lines.length})
          </p>
        </div>
        <div className="divide-y">
          {step2.lines.map((line, i) => {
            const item = items.find((it) => it.id === line.item_id)
            const lineTotalNative = (line.unit_cost_native ?? 0) * (line.quantity ?? 0)
            const lineTotalMxn =
              line.native_currency === 'USD'
                ? lineTotalNative * (latestFxRate ?? 1)
                : lineTotalNative
            return (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item?.name ?? line.item_id}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {item?.sku} · {formatQuantity(line.quantity)} {item?.unit?.code ?? ''}
                    {line.cost_center_notes ? ` · ${line.cost_center_notes}` : ''}
                  </p>
                </div>
                {canSeePrices && (
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-mono font-medium tabular-nums">
                      {formatMoney(lineTotalMxn, 'MXN')}
                    </span>
                    {line.native_currency === 'USD' && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatMoney(lineTotalNative, 'USD')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {canSeePrices && (
          <div className="bg-muted/30 px-4 py-3 flex justify-end">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Total MXN
              </span>
              <span className="text-base font-semibold tabular-nums font-mono">
                {formatMoney(totalMxn, 'MXN')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          <ChevronLeft className="mr-1.5 size-4" />
          Atrás
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onSaveDraft}
            disabled={isSubmitting}
          >
            Guardar borrador
          </Button>
          <Button
            type="button"
            onClick={onRegister}
            disabled={isSubmitting}
          >
            <Check className="mr-1.5 size-4" />
            Registrar salida
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function NuevaSalidaPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()
  const { organization, activeSeason, profile } = useAuth()

  const { data: fxRates = [] } = useFxRates()
  const { data: allEmployees = [] } = useEmployees()
  const latestFxRate = useMemo(() => {
    const usd = (fxRates as any[]).find((r: any) => r.currency_from === 'USD' && r.currency_to === 'MXN')
    return usd?.rate ?? 17
  }, [fxRates])

  const [currentStep, setCurrentStep] = useState(1)
  const [step1aData, setStep1aData] = useState<Step1aValues | null>(null)
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Values | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStep1Next(data: Step1aValues) {
    setStep1aData(data)
    setCurrentStep(2)
  }

  function handleStep2Next(data: Step1Values) {
    setStep1Data(data)
    setCurrentStep(3)
  }

  function handleStep3Next(data: Step2Values) {
    setStep2Data(data)
    setCurrentStep(4)
  }

  const submitMovement = useCallback(
    async (status: 'draft' | 'posted') => {
      if (!step1Data || !step2Data) return
      if (!organization?.id || !activeSeason?.id) {
        toast.error('No hay organización o temporada activa')
        return
      }

      setIsSubmitting(true)
      try {
        // 1. Build totals
        const totalMxn = step2Data.lines.reduce((sum, line) => {
          const cost = line.unit_cost_native ?? 0
          const qty = line.quantity ?? 0
          const mxn =
            line.native_currency === 'USD' ? cost * (latestFxRate ?? 1) : cost
          return sum + mxn * qty
        }, 0)

        const totalUsd = step2Data.lines.reduce((sum, line) => {
          const cost = line.unit_cost_native ?? 0
          const qty = line.quantity ?? 0
          const usd =
            line.native_currency === 'USD' ? cost : cost / (latestFxRate ?? 1)
          return sum + usd * qty
        }, 0)

        // 2. Generate system folio
        const document_number = await generateFolioSalida(organization.id)

        // 3. Create movement
        const { data: movement, error: movErr } = await db
          .from('stock_movements')
          .insert({
            organization_id: organization.id,
            season_id: activeSeason.id,
            movement_type: step1Data.movement_type,
            warehouse_id: step1Data.warehouse_id,
            document_number,
            reference_external: step1Data.reference_external || null,
            fx_rate: latestFxRate,
            fx_source: 'manual',
            fx_date: step1Data.date,
            total_mxn: totalMxn,
            total_usd: totalUsd,
            status,
            notes: step1Data.notes || null,
            delivered_by_employee_id: step1Data.delivered_by_employee_id || null,
            received_by_employee_id: step1Data.received_by_employee_id || null,
            created_by: profile?.id ?? null,
            ...(status === 'posted'
              ? { posted_at: new Date().toISOString(), posted_by: profile?.id ?? null }
              : {}),
          })
          .select('*, warehouse:warehouses!stock_movements_warehouse_id_fkey(*)')
          .single()

        if (movErr) throw movErr

        // 3. Create lines
        const lines = step2Data.lines.map((line) => {
          const lineTotalNative = (line.unit_cost_native ?? 0) * line.quantity
          const lineTotalMxn =
            line.native_currency === 'USD'
              ? lineTotalNative * (latestFxRate ?? 1)
              : lineTotalNative

          return {
            movement_id: movement.id,
            item_id: line.item_id,
            quantity: line.quantity,
            unit_cost_native: line.unit_cost_native,
            native_currency: line.native_currency,
            unit_cost_mxn:
              line.native_currency === 'USD'
                ? line.unit_cost_native * (latestFxRate ?? 1)
                : line.unit_cost_native,
            line_total_native: lineTotalNative,
            line_total_mxn: lineTotalMxn,
            destination_type: step1Data.destination_type,
            crop_lot_id: step1Data.crop_lot_id ?? null,
            equipment_id: step1Data.equipment_id ?? null,
            employee_id: step1Data.employee_id ?? null,
            cost_center_notes: line.cost_center_notes ?? null,
            diesel_liters: line.diesel_liters ?? null,
            equipment_hours_before: line.equipment_hours_before ?? null,
            equipment_hours_after: line.equipment_hours_after ?? null,
            equipment_km_before: line.equipment_km_before ?? null,
            equipment_km_after: line.equipment_km_after ?? null,
            operator_employee_id: line.operator_employee_id ?? null,
          }
        })

        const { data: createdLines, error: linesErr } = await db
          .from('stock_movement_lines')
          .insert(lines)
          .select('*, item:items(*, unit:units(*))')

        if (linesErr) throw linesErr

        // 4. Generate PDF if posting
        if (status === 'posted' && organization) {
          const movWithLines: StockMovement & { lines: StockMovementLine[] } = {
            ...(movement as StockMovement),
            lines: createdLines as StockMovementLine[],
          }
          const deliveredBy = allEmployees.find((e) => e.id === step1Data.delivered_by_employee_id)
          const receivedBy = allEmployees.find((e) => e.id === step1Data.received_by_employee_id)
          generateValePDF({
            movement: movWithLines,
            organization,
            deliveredByName: deliveredBy?.full_name,
            receivedByName: receivedBy?.full_name,
            canSeePrices,
          })
        }

        toast.success(
          status === 'posted'
            ? 'Salida registrada correctamente'
            : 'Borrador guardado'
        )
        navigate(`${basePath}/salidas`)
      } catch (err: any) {
        console.error(err)
        toast.error(err.message ?? 'Error al guardar la salida')
      } finally {
        setIsSubmitting(false)
      }
    },
    [step1Data, step2Data, organization, activeSeason, profile, navigate, latestFxRate, allEmployees, canSeePrices, basePath]
  )

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Nueva salida"
        description="Registra una salida de material del almacén"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${basePath}/salidas`)}
          >
            Cancelar
          </Button>
        }
      />

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      <StepIndicator step={currentStep} />

      <Separator />

      {/* ── Steps ───────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <Step1Destino
          defaultValues={step1aData ?? {}}
          onNext={handleStep1Next}
        />
      )}

      {currentStep === 2 && step1aData && (
        <Step2Detalles
          step1a={step1aData}
          defaultValues={step1Data ?? {}}
          onNext={handleStep2Next}
          onBack={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 3 && step1Data && (
        <Step2Partidas
          step1={step1Data}
          defaultValues={step2Data ?? {}}
          onNext={handleStep3Next}
          onBack={() => setCurrentStep(2)}
          fxRate={latestFxRate}
          canSeePrices={canSeePrices}
        />
      )}

      {currentStep === 4 && step1Data && step2Data && (
        <Step3Revision
          step1={step1Data}
          step2={step2Data}
          onBack={() => setCurrentStep(3)}
          onSaveDraft={() => submitMovement('draft')}
          onRegister={() => submitMovement('posted')}
          isSubmitting={isSubmitting}
          fxRate={latestFxRate}
          canSeePrices={canSeePrices}
        />
      )}

      {/* ── Empty state for unavailable steps ───────────────────────────── */}
      {currentStep === 2 && !step1aData && (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground text-sm">
            Completa el paso anterior primero.
          </p>
        </div>
      )}
    </div>
  )
}

export default NuevaSalidaPage
