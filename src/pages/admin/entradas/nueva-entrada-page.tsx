import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  CheckCircle,
  Save,
  AlertTriangle,
} from 'lucide-react'

import { useItems, useSuppliers, useWarehouses, useFxRates } from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { MOVEMENT_TYPE_LABELS, CURRENCY_SYMBOLS } from '@/lib/constants'
import { formatFechaCorta, formatMoney, formatQuantity, cn } from '@/lib/utils'

import { CurrencyBadge } from '@/components/custom/currency-badge'
import { MoneyDisplay } from '@/components/custom/money-display'
import { PageHeader } from '@/components/custom/page-header'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Types ────────────────────────────────────────────────────────────────────

const ENTRY_TYPES = [
  'entry_purchase',
  'entry_return',
  'entry_transfer',
  'entry_adjustment',
  'entry_initial',
] as const


// ─── Zod schemas ──────────────────────────────────────────────────────────────

const lineSchema = z.object({
  item_id:          z.string().min(1, 'Selecciona un artículo'),
  quantity:         z.coerce.number().positive('Debe ser mayor a 0'),
  unit_cost_native: z.coerce.number().nonnegative('No puede ser negativo'),
})

const formSchema = z.object({
  // Step 1
  movement_type:      z.enum(ENTRY_TYPES),
  warehouse_id:       z.string().min(1, 'Selecciona un almacén'),
  supplier_id:        z.string().optional(),
  reference_external: z.string().optional(),
  movement_date:      z.string().min(1, 'Selecciona la fecha'),
  notes:              z.string().optional(),
  // Step 2
  lines: z.array(lineSchema).min(1, 'Agrega al menos una partida'),
})

type FormValues = z.infer<typeof formSchema>

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Datos generales' },
  { label: 'Partidas' },
  { label: 'Revisión' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto mb-8">
      {STEPS.map((step, idx) => {
        const num    = idx + 1
        const done   = num < current
        const active = num === current
        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                  done   && 'bg-primary border-primary text-primary-foreground',
                  active && 'bg-background border-primary text-primary',
                  !done && !active && 'bg-background border-border text-muted-foreground'
                )}
              >
                {done ? <CheckCircle className="h-4 w-4" /> : num}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium whitespace-nowrap',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {/* Connector */}
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-2 mb-4 transition-colors', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Field error helper ───────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NuevaEntradaPage() {
  const navigate  = useNavigate()
  const { organization, activeSeason, profile } = useAuth()

  const [step,       setStep]       = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Remote data
  const { data: warehouses = [] } = useWarehouses()
  const { data: suppliers  = [] } = useSuppliers()
  const { data: items      = [] } = useItems()
  const { data: fxRates    = [] } = useFxRates()

  // Latest USD→MXN rate
  const latestFxRate = useMemo(() => {
    const usd = (fxRates as any[]).find(
      (r: any) => r.currency_from === 'USD' && r.currency_to === 'MXN'
    )
    return usd?.rate ?? 17
  }, [fxRates])

  // Form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      movement_type:      'entry_purchase',
      warehouse_id:       '',
      supplier_id:        '',
      reference_external: '',
      movement_date:      new Date().toISOString().slice(0, 10),
      notes:              '',
      lines:              [{ item_id: '', quantity: 1, unit_cost_native: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })

  const watchedType  = form.watch('movement_type')
  const watchedLines = form.watch('lines')
  const watchedFx    = latestFxRate

  // ─── Computed totals ────────────────────────────────────────────────────────

  const lineTotals = useMemo(() => {
    return watchedLines.map((line) => {
      const item = items.find((it) => it.id === line.item_id)
      const currency = item?.native_currency ?? 'MXN'
      const totalNative = (line.quantity ?? 0) * (line.unit_cost_native ?? 0)
      const totalMxn    = currency === 'MXN' ? totalNative : totalNative * watchedFx
      return { totalNative, totalMxn, currency }
    })
  }, [watchedLines, items, watchedFx])

  const grandTotalMxn = lineTotals.reduce((s, l) => s + l.totalMxn, 0)

  // ─── Step navigation ────────────────────────────────────────────────────────

  async function goNext() {
    let valid = false
    if (step === 1) {
      valid = await form.trigger(['movement_type', 'warehouse_id', 'movement_date'])
    } else if (step === 2) {
      valid = await form.trigger(['lines'])
    }
    if (valid) setStep((s) => s + 1)
  }

  function goBack() {
    setStep((s) => s - 1)
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(targetStatus: 'draft' | 'posted') {
    const values = form.getValues()
    setSubmitting(true)

    try {
      // 1. Create movement
      const { data: movement, error: movErr } = await (supabase as any)
        .from('stock_movements')
        .insert({
          organization_id:    organization?.id,
          season_id:          activeSeason?.id,
          movement_type:      values.movement_type,
          warehouse_id:       values.warehouse_id,
          supplier_id:        values.supplier_id || null,
          reference_external: values.reference_external || null,
          document_number:    null, // generated by trigger or left null
          fx_rate:            latestFxRate,
          fx_source:          'manual',
          fx_date:            values.movement_date,
          total_mxn:          grandTotalMxn,
          total_usd:          grandTotalMxn / (latestFxRate ?? 1),
          total_native:       grandTotalMxn,
          status:             targetStatus,
          notes:              values.notes || null,
          created_by:         profile?.id ?? null,
        })
        .select()
        .single()

      if (movErr) throw movErr

      // 2. Create lines
      const linePayloads = values.lines.map((line, i) => {
        const item     = items.find((it) => it.id === line.item_id)
        const currency = item?.native_currency ?? 'MXN'
        const totalNative = line.quantity * line.unit_cost_native
        const unitMxn     = currency === 'MXN' ? line.unit_cost_native : line.unit_cost_native * (latestFxRate ?? 1)
        const totalMxn    = currency === 'MXN' ? totalNative : totalNative * (latestFxRate ?? 1)
        return {
          movement_id:      movement.id,
          item_id:          line.item_id,
          quantity:         line.quantity,
          unit_cost_native: line.unit_cost_native,
          native_currency:  currency,
          unit_cost_mxn:    unitMxn,
          line_total_native: totalNative,
          line_total_mxn:   totalMxn,
          sort_order:       i,
        }
      })

      const { error: linesErr } = await (supabase as any)
        .from('stock_movement_lines')
        .insert(linePayloads)

      if (linesErr) throw linesErr

      toast.success(
        targetStatus === 'posted'
          ? 'Entrada registrada correctamente'
          : 'Borrador guardado correctamente'
      )
      navigate('/admin/entradas')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Error al guardar la entrada')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Nueva entrada"
        description="Registra una entrada de inventario al almacén"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/entradas')}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Cancelar
          </Button>
        }
      />

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* ── STEP 1: Datos generales ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Datos generales</CardTitle>
            <CardDescription className="text-sm">
              Información principal del movimiento de entrada
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Movement type */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="movement_type">Tipo de entrada <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="movement_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="movement_type" className="h-9">
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={form.formState.errors.movement_type?.message} />
              </div>

              {/* Warehouse */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouse_id">Almacén destino <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="warehouse_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="warehouse_id" className="h-9">
                        <SelectValue placeholder="Selecciona almacén" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} <span className="text-muted-foreground ml-1">({w.code})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={form.formState.errors.warehouse_id?.message} />
              </div>

              {/* Supplier — only for purchases */}
              {watchedType === 'entry_purchase' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="supplier_id">Proveedor</Label>
                  <Controller
                    control={form.control}
                    name="supplier_id"
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger id="supplier_id" className="h-9">
                          <SelectValue placeholder="Sin proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sin proveedor</SelectItem>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              {/* Reference */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reference_external">Referencia externa</Label>
                <Input
                  id="reference_external"
                  placeholder="# factura, remisión, etc."
                  className="h-9"
                  {...form.register('reference_external')}
                />
              </div>

              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="movement_date">Fecha del movimiento <span className="text-destructive">*</span></Label>
                <Input
                  id="movement_date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  className="h-9"
                  {...form.register('movement_date')}
                />
                <FieldError message={form.formState.errors.movement_date?.message} />
              </div>

            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Observaciones opcionales…"
                rows={3}
                className="resize-none text-sm"
                {...form.register('notes')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Partidas ────────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Partidas</CardTitle>
            <CardDescription className="text-sm">
              Artículos que conforman esta entrada. Al menos una partida requerida.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Lines table */}
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="h-8 px-3 text-xs font-medium text-muted-foreground w-[40%]">Artículo</TableHead>
                    <TableHead className="h-8 px-3 text-xs font-medium text-muted-foreground w-[16%]">Cantidad</TableHead>
                    <TableHead className="h-8 px-3 text-xs font-medium text-muted-foreground w-[22%]">Costo unitario</TableHead>
                    <TableHead className="h-8 px-3 text-xs font-medium text-muted-foreground text-right w-[16%]">Total</TableHead>
                    <TableHead className="h-8 px-3 w-[6%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, idx) => {
                    const lineItem = items.find((it) => it.id === watchedLines[idx]?.item_id)
                    const currency = lineItem?.native_currency ?? 'MXN'
                    const total    = lineTotals[idx]

                    return (
                      <TableRow key={field.id} className="border-b border-border/50 last:border-0">
                        {/* Item select */}
                        <TableCell className="px-3 py-2">
                          <Controller
                            control={form.control}
                            name={`lines.${idx}.item_id`}
                            render={({ field: f }) => (
                              <Select value={f.value} onValueChange={f.onChange}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Seleccionar artículo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {items.map((it) => (
                                    <SelectItem key={it.id} value={it.id}>
                                      {it.name} <span className="text-xs text-muted-foreground ml-1">({it.sku})</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <FieldError message={form.formState.errors.lines?.[idx]?.item_id?.message} />
                        </TableCell>

                        {/* Quantity */}
                        <TableCell className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.001"
                            min="0.001"
                            className="h-8 text-xs font-mono"
                            {...form.register(`lines.${idx}.quantity`)}
                          />
                          <FieldError message={form.formState.errors.lines?.[idx]?.quantity?.message} />
                        </TableCell>

                        {/* Unit cost */}
                        <TableCell className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              className="h-8 text-xs font-mono"
                              {...form.register(`lines.${idx}.unit_cost_native`)}
                            />
                            <CurrencyBadge currency={currency} size="sm" />
                          </div>
                          <FieldError message={form.formState.errors.lines?.[idx]?.unit_cost_native?.message} />
                        </TableCell>

                        {/* Total */}
                        <TableCell className="px-3 py-2 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-xs font-medium">
                              {CURRENCY_SYMBOLS[currency]}{formatQuantity(total?.totalNative ?? 0, 2)}
                            </span>
                            {currency !== 'MXN' && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {formatMoney(total?.totalMxn ?? 0, 'MXN')}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Remove */}
                        <TableCell className="px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={fields.length === 1}
                            onClick={() => remove(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Add line button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => append({ item_id: '', quantity: 1, unit_cost_native: 0 })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Agregar partida
            </Button>

            {form.formState.errors.lines?.root?.message && (
              <FieldError message={form.formState.errors.lines.root.message} />
            )}
            {typeof form.formState.errors.lines?.message === 'string' && (
              <FieldError message={form.formState.errors.lines.message} />
            )}

            {/* Running total */}
            <Separator />
            <div className="flex items-center justify-end gap-6">
              <span className="text-sm text-muted-foreground">Total estimado</span>
              <MoneyDisplay amount={grandTotalMxn} currency="MXN" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Revisión ────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          {/* Summary card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen del movimiento</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              {[
                {
                  label: 'Tipo',
                  value: (
                    <Badge variant="outline" className="text-xs">
                      {MOVEMENT_TYPE_LABELS[form.getValues('movement_type')]}
                    </Badge>
                  ),
                },
                {
                  label: 'Almacén',
                  value: (() => {
                    const wh = warehouses.find((w) => w.id === form.getValues('warehouse_id'))
                    return wh ? `${wh.code} – ${wh.name}` : '—'
                  })(),
                },
                ...(form.getValues('movement_type') === 'entry_purchase'
                  ? [{
                      label: 'Proveedor',
                      value: suppliers.find((s) => s.id === form.getValues('supplier_id'))?.name ?? '—',
                    }]
                  : []),
                {
                  label: 'Referencia',
                  value: form.getValues('reference_external') || '—',
                },
                {
                  label: 'Fecha',
                  value: formatFechaCorta(form.getValues('movement_date')),
                },
                ...(form.getValues('notes')
                  ? [{ label: 'Notas', value: form.getValues('notes') }]
                  : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                  <span className="text-sm font-medium text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Lines review */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Partidas
                <Badge variant="secondary" className="ml-2 text-xs">{fields.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-b-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="h-8 px-4 text-xs font-medium text-muted-foreground">Artículo</TableHead>
                      <TableHead className="h-8 px-4 text-xs font-medium text-muted-foreground text-right">Cantidad</TableHead>
                      <TableHead className="h-8 px-4 text-xs font-medium text-muted-foreground text-right">Costo unit.</TableHead>
                      <TableHead className="h-8 px-4 text-xs font-medium text-muted-foreground text-right">Total MXN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.getValues('lines').map((line, idx) => {
                      const item = items.find((it) => it.id === line.item_id)
                      const currency = item?.native_currency ?? 'MXN'
                      const total = lineTotals[idx]
                      // Warn if cost seems abnormal (placeholder: cost = 0 warns)
                      const costWarning = line.unit_cost_native === 0

                      return (
                        <TableRow key={idx} className={cn('border-b border-border/50 last:border-0', costWarning && 'bg-amber-50/40 dark:bg-amber-950/20')}>
                          <TableCell className="px-4 py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{item?.name ?? '—'}</span>
                              <span className="text-xs text-muted-foreground font-mono">{item?.sku}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 text-right font-mono text-xs">
                            {formatQuantity(line.quantity, 3)}
                            {item?.unit && <span className="text-muted-foreground ml-1">{item.unit.code}</span>}
                          </TableCell>
                          <TableCell className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="font-mono text-xs">{CURRENCY_SYMBOLS[currency]}{line.unit_cost_native.toFixed(4)}</span>
                              <CurrencyBadge currency={currency} size="sm" />
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <MoneyDisplay amount={total?.totalMxn ?? 0} currency="MXN" />
                              {costWarning && (
                                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span className="text-[10px]">Costo en cero</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Grand total */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Total del movimiento</span>
                  <span className="text-xs text-muted-foreground">
                    {fields.length} partida{fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <MoneyDisplay amount={grandTotalMxn} currency="MXN" />
                  <MoneyDisplay
                    amount={grandTotalMxn / (latestFxRate ?? 1)}
                    currency="USD"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warning placeholder */}
          {form.getValues('lines').some((l) => l.unit_cost_native === 0) && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Revisión de costos</span>
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Una o más partidas tienen costo unitario en cero. Verifica antes de registrar.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={step === 1 ? () => navigate('/admin/entradas') : goBack}
          disabled={submitting}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {step === 1 ? 'Cancelar' : 'Anterior'}
        </Button>

        <div className="flex items-center gap-2">
          {step < 3 && (
            <Button type="button" size="sm" onClick={goNext} disabled={submitting}>
              Siguiente
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}

          {step === 3 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => handleSubmit('draft')}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Guardar borrador
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={() => handleSubmit('posted')}
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                {submitting ? 'Registrando…' : 'Registrar'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
