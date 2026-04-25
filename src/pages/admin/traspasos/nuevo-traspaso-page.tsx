import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowLeftRight,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'

import { useWarehouses, useItems, useEmployees, useItemStock } from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { formatQuantity, cn } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { SearchableSelect } from '@/components/shared/searchable-select'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  item_id:  z.string().min(1, 'Selecciona un artículo'),
  quantity: z.coerce.number().positive('Debe ser mayor a 0'),
})

const formSchema = z.object({
  origin_warehouse_id: z.string().min(1, 'Selecciona el almacén origen'),
  dest_warehouse_id:   z.string().min(1, 'Selecciona el almacén destino'),
  movement_date:       z.string().min(1, 'Selecciona la fecha'),
  delivered_by_employee_id: z.string().optional(),
  received_by_employee_id:  z.string().optional(),
  transport_notes:     z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Agrega al menos una partida'),
}).refine((d) => d.origin_warehouse_id !== d.dest_warehouse_id, {
  message: 'El almacén destino debe ser diferente al origen',
  path: ['dest_warehouse_id'],
})

type FormValues = z.infer<typeof formSchema>

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Almacenes', labelMobile: 'Alm.' },
  { label: 'Artículos', labelMobile: 'Art.' },
  { label: 'Revisión',  labelMobile: 'Rev.' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto mb-6">
      {STEPS.map((step, idx) => {
        const num    = idx + 1
        const done   = num < current
        const active = num === current
        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                  done   && 'bg-primary border-primary text-primary-foreground',
                  active && 'bg-background border-primary text-primary',
                  !done && !active && 'bg-background border-border text-muted-foreground'
                )}
              >
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : num}
              </div>
              <span className={cn('text-[10px] font-medium whitespace-nowrap hidden sm:block', active ? 'text-primary' : 'text-muted-foreground')}>
                {step.label}
              </span>
              <span className={cn('text-[10px] font-medium whitespace-nowrap sm:hidden', active ? 'text-primary' : 'text-muted-foreground')}>
                {step.labelMobile}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-1.5 mb-4 transition-colors', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

// ─── Main component ───────────────────────────────────────────────────────────

const db = supabase as any

export default function NuevoTraspasoPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization, activeSeason, profile } = useAuth()

  const [step,       setStep]       = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const { data: warehouses = [] } = useWarehouses()
  const { data: items      = [] } = useItems()
  const { data: employees  = [] } = useEmployees()
  const { data: itemStock  = [] } = useItemStock()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      origin_warehouse_id: '',
      dest_warehouse_id:   '',
      movement_date:       new Date().toISOString().slice(0, 10),
      delivered_by_employee_id: '',
      received_by_employee_id:  '',
      transport_notes:     '',
      lines: [{ item_id: '', quantity: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })

  const watchedLines         = form.watch('lines')
  const watchedOriginWhId    = form.watch('origin_warehouse_id')
  const watchedDestWhId      = form.watch('dest_warehouse_id')

  // Stock per item in the origin warehouse for the active season
  const originStockMap = useMemo(() => {
    const map = new Map<string, number>()
    itemStock.forEach((s: any) => {
      if (s.warehouse_id === watchedOriginWhId) {
        map.set(s.item_id, s.quantity ?? 0)
      }
    })
    return map
  }, [itemStock, watchedOriginWhId])

  // Warehouse options excluding already-selected counterpart
  const warehouseOptions = useMemo(() =>
    warehouses.map((w: any) => ({
      value: w.id,
      label: `${w.code} — ${w.name}`,
    })), [warehouses])

  const employeeOptions = useMemo(() =>
    employees.map((e: any) => ({
      value: e.id,
      label: `${e.employee_code} — ${e.full_name}`,
    })), [employees])

  const itemOptions = useMemo(() =>
    items.map((it: any) => ({
      value: it.id,
      label: `${it.sku} — ${it.name}`,
    })), [items])

  // ─── Step navigation ──────────────────────────────────────────────────────

  async function goNext() {
    let valid = false
    if (step === 1) {
      valid = await form.trigger(['origin_warehouse_id', 'dest_warehouse_id', 'movement_date'])
    } else if (step === 2) {
      valid = await form.trigger(['lines'])
      // Extra: check quantities vs stock
      if (valid) {
        const lines = form.getValues('lines')
        const overStock = lines.find((l) => {
          const available = originStockMap.get(l.item_id) ?? 0
          return l.quantity > available
        })
        if (overStock) {
          const it = items.find((i: any) => i.id === overStock.item_id) as any
          toast.error(`Stock insuficiente para "${it?.name ?? overStock.item_id}"`)
          valid = false
        }
      }
    } else {
      valid = true
    }
    if (valid) setStep((s) => s + 1)
  }

  function goBack() {
    setStep((s) => s - 1)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const values = form.getValues()
    setSubmitting(true)

    try {
      const originWhId = values.origin_warehouse_id
      const destWhId   = values.dest_warehouse_id
      const orgId      = organization?.id
      const seasonId   = activeSeason?.id

      // Common fields
      const commonPayload = {
        organization_id:           orgId,
        season_id:                 seasonId,
        fx_date:                   values.movement_date,
        delivered_by_employee_id:  values.delivered_by_employee_id || null,
        received_by_employee_id:   values.received_by_employee_id  || null,
        transport_notes:           values.transport_notes || null,
        status:                    'posted' as const,
        created_by:                profile?.id ?? null,
        fx_rate:                   null,
        fx_source:                 null,
        total_mxn:                 null,
        total_usd:                 null,
      }

      // 1. Exit transfer (origin → ?)
      const { data: exitMov, error: exitErr } = await db
        .from('stock_movements')
        .insert({
          ...commonPayload,
          movement_type:             'exit_transfer',
          warehouse_id:              originWhId,
          counterpart_warehouse_id:  destWhId,
        })
        .select()
        .single()

      if (exitErr) throw exitErr

      // 2. Entry transfer (? → destination)
      const { data: entryMov, error: entryErr } = await db
        .from('stock_movements')
        .insert({
          ...commonPayload,
          movement_type:             'entry_transfer',
          warehouse_id:              destWhId,
          counterpart_warehouse_id:  originWhId,
        })
        .select()
        .single()

      if (entryErr) throw entryErr

      // 3. Lines for both movements
      const exitLines = values.lines.map((line) => {
        const it = items.find((x: any) => x.id === line.item_id) as any
        const avgCost = originStockMap.get(line.item_id) !== undefined
          ? (itemStock as any[]).find((s: any) => s.warehouse_id === originWhId && s.item_id === line.item_id)?.avg_cost_mxn ?? 0
          : 0
        return {
          movement_id:       exitMov.id,
          item_id:           line.item_id,
          quantity:          line.quantity,
          unit_cost_native:  avgCost,
          native_currency:   it?.native_currency ?? 'MXN',
          unit_cost_mxn:     avgCost,
          line_total_native: avgCost * line.quantity,
          line_total_mxn:    avgCost * line.quantity,
        }
      })

      const entryLines = values.lines.map((line) => {
        const it = items.find((x: any) => x.id === line.item_id) as any
        const avgCost = (itemStock as any[]).find((s: any) => s.warehouse_id === originWhId && s.item_id === line.item_id)?.avg_cost_mxn ?? 0
        return {
          movement_id:       entryMov.id,
          item_id:           line.item_id,
          quantity:          line.quantity,
          unit_cost_native:  avgCost,
          native_currency:   it?.native_currency ?? 'MXN',
          unit_cost_mxn:     avgCost,
          line_total_native: avgCost * line.quantity,
          line_total_mxn:    avgCost * line.quantity,
        }
      })

      const { error: linesErr } = await db
        .from('stock_movement_lines')
        .insert([...exitLines, ...entryLines])

      if (linesErr) throw linesErr

      toast.success('Traspaso registrado correctamente')
      navigate(`${basePath}/traspasos`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message ?? 'Error al registrar el traspaso')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Derived values for review ────────────────────────────────────────────

  const originWh = warehouses.find((w: any) => w.id === watchedOriginWhId) as any
  const destWh   = warehouses.find((w: any) => w.id === watchedDestWhId) as any
  const deliveredBy = employees.find((e: any) => e.id === form.watch('delivered_by_employee_id')) as any
  const receivedBy  = employees.find((e: any) => e.id === form.watch('received_by_employee_id'))  as any

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Nuevo traspaso"
        description="Registra un movimiento entre almacenes"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/traspasos`)}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Cancelar
          </Button>
        }
      />

      <StepIndicator current={step} />

      {/* ── STEP 1: Almacenes + Personal ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Almacenes y personal</CardTitle>
            <CardDescription className="text-sm">
              Define origen, destino, responsables y fecha del traspaso
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Origen */}
              <div className="flex flex-col gap-1.5">
                <Label>Almacén origen <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="origin_warehouse_id"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={warehouseOptions.filter((o: any) => o.value !== watchedDestWhId)}
                      placeholder="Selecciona almacén origen"
                    />
                  )}
                />
                <FieldError message={form.formState.errors.origin_warehouse_id?.message} />
              </div>

              {/* Destino */}
              <div className="flex flex-col gap-1.5">
                <Label>Almacén destino <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="dest_warehouse_id"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={warehouseOptions.filter((o: any) => o.value !== watchedOriginWhId)}
                      placeholder="Selecciona almacén destino"
                    />
                  )}
                />
                <FieldError message={form.formState.errors.dest_warehouse_id?.message} />
              </div>
            </div>

            {/* Fecha */}
            <div className="flex flex-col gap-1.5 max-w-xs">
              <Label htmlFor="movement_date">Fecha <span className="text-destructive">*</span></Label>
              <Input
                id="movement_date"
                type="date"
                {...form.register('movement_date')}
                className="h-9"
              />
              <FieldError message={form.formState.errors.movement_date?.message} />
            </div>

            <Separator />

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Entrega */}
              <div className="flex flex-col gap-1.5">
                <Label>Entrega (quien envía)</Label>
                <Controller
                  control={form.control}
                  name="delivered_by_employee_id"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      options={employeeOptions}
                      placeholder="Selecciona empleado (opcional)"
                    />
                  )}
                />
              </div>

              {/* Recibe */}
              <div className="flex flex-col gap-1.5">
                <Label>Recibe (quien recibe)</Label>
                <Controller
                  control={form.control}
                  name="received_by_employee_id"
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      options={employeeOptions}
                      placeholder="Selecciona empleado (opcional)"
                    />
                  )}
                />
              </div>
            </div>

            {/* Notas de transporte */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transport_notes">Notas de transporte</Label>
              <Textarea
                id="transport_notes"
                placeholder="Observaciones sobre el transporte (placas, ruta, etc.)"
                rows={2}
                {...form.register('transport_notes')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Artículos ─────────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Artículos a traspasar</CardTitle>
            <CardDescription className="text-sm">
              Agrega los artículos y cantidades. Se valida contra el stock disponible en el almacén origen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!watchedOriginWhId && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Selecciona un almacén origen para ver el stock disponible.
              </div>
            )}

            {/* Lines */}
            <div className="flex flex-col gap-3">
              {fields.map((field, idx) => {
                const watchedItemId = watchedLines[idx]?.item_id
                const watchedQty    = watchedLines[idx]?.quantity ?? 0
                const availableQty  = originStockMap.get(watchedItemId) ?? 0
                const isOver        = watchedItemId && watchedQty > availableQty

                return (
                  <div key={field.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 flex flex-col gap-1.5">
                        <Label className="text-xs">Artículo <span className="text-destructive">*</span></Label>
                        <Controller
                          control={form.control}
                          name={`lines.${idx}.item_id`}
                          render={({ field: f }) => (
                            <SearchableSelect
                              value={f.value}
                              onValueChange={f.onChange}
                              options={itemOptions}
                              placeholder="Buscar artículo…"
                            />
                          )}
                        />
                        <FieldError message={form.formState.errors.lines?.[idx]?.item_id?.message} />
                      </div>

                      <div className="w-28 flex flex-col gap-1.5 shrink-0">
                        <Label className="text-xs">Cantidad <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          className={cn('h-9 text-sm', isOver && 'border-destructive')}
                          {...form.register(`lines.${idx}.quantity`)}
                        />
                        <FieldError message={form.formState.errors.lines?.[idx]?.quantity?.message} />
                      </div>

                      <div className="pt-6">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => remove(idx)}
                          disabled={fields.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Stock indicator */}
                    {watchedItemId && (
                      <div className={cn('text-xs flex items-center gap-1', isOver ? 'text-destructive' : 'text-muted-foreground')}>
                        {isOver && <AlertTriangle className="h-3 w-3 shrink-0" />}
                        Stock disponible en origen: <span className="font-mono font-medium ml-1">{formatQuantity(availableQty)}</span>
                        {isOver && <span className="ml-1 font-medium"> — insuficiente</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => append({ item_id: '', quantity: 1 })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Agregar artículo
            </Button>

            {form.formState.errors.lines?.root?.message && (
              <FieldError message={form.formState.errors.lines.root.message} />
            )}
            {form.formState.errors.lines?.message && (
              <FieldError message={form.formState.errors.lines.message as string} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Revisión ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          {/* Summary card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                Resumen del traspaso
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Almacén origen</p>
                  <p className="text-sm font-semibold">{originWh ? `${originWh.code} — ${originWh.name}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Almacén destino</p>
                  <p className="text-sm font-semibold">{destWh ? `${destWh.code} — ${destWh.name}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Fecha</p>
                  <p className="text-sm">{form.watch('movement_date')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Entrega</p>
                  <p className="text-sm">{deliveredBy ? `${deliveredBy.employee_code} — ${deliveredBy.full_name}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Recibe</p>
                  <p className="text-sm">{receivedBy ? `${receivedBy.employee_code} — ${receivedBy.full_name}` : '—'}</p>
                </div>
                {form.watch('transport_notes') && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Notas transporte</p>
                    <p className="text-sm text-muted-foreground">{form.watch('transport_notes')}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lines table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Artículos ({watchedLines.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">#</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right pr-4">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchedLines.map((line, idx) => {
                    const it = items.find((x: any) => x.id === line.item_id) as any
                    return (
                      <TableRow key={idx}>
                        <TableCell className="pl-4 text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{it?.sku ?? '—'}</TableCell>
                        <TableCell className="text-sm">{it?.name ?? line.item_id}</TableCell>
                        <TableCell className="text-right pr-4 font-mono text-sm">
                          {formatQuantity(line.quantity)} {it?.unit?.code ?? ''}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={step === 1 ? () => navigate(`${basePath}/traspasos`) : goBack}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {step === 1 ? 'Cancelar' : 'Anterior'}
        </Button>

        {step < 3 ? (
          <Button type="button" size="sm" onClick={goNext}>
            Siguiente
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-primary"
          >
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? 'Registrando…' : 'Registrar traspaso'}
          </Button>
        )}
      </div>
    </div>
  )
}
