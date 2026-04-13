import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Fuel, ChevronRight, Check, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useEquipment, useEmployees } from '@/hooks/use-supabase-query'
import type { Equipment, Item, StockMovementLine } from '@/lib/database.types'
import { formatQuantity, formatMoney, cn } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  equipmentId: string
  operatorId: string
  litros: string
  horometroActual: string
  notas: string
}

// ─── Supabase alias ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Fetch diesel item ────────────────────────────────────────────────────────

async function fetchDieselItem(orgId: string): Promise<Item | null> {
  const { data, error } = await db
    .from('items')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_diesel', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as Item | null
}

// ─── Fetch last diesel line for equipment ─────────────────────────────────────

async function fetchLastLineForEquipment(
  equipmentId: string,
  orgId: string
): Promise<StockMovementLine | null> {
  const { data, error } = await db
    .from('stock_movement_lines')
    .select('*, movement:stock_movements!inner(*), item:items!inner(*)')
    .eq('equipment_id', equipmentId)
    .eq('item.is_diesel', true)
    .eq('movement.organization_id', orgId)
    .eq('movement.status', 'posted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data as StockMovementLine | null
}

// ─── Equipment card ────────────────────────────────────────────────────────────

interface EquipmentCardProps {
  equipment: Equipment
  selected: boolean
  onSelect: () => void
}

function EquipmentCard({ equipment, selected, onSelect }: EquipmentCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary'
          : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/30'
      )}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold',
          selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        <Fuel className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-muted-foreground">{equipment.code}</p>
        <p className="text-sm font-semibold leading-tight truncate">{equipment.name}</p>
        {equipment.brand && (
          <p className="text-xs text-muted-foreground">{equipment.brand}</p>
        )}
      </div>
      {equipment.current_hours != null && (
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Horóm.</p>
          <p className="text-sm font-mono tabular-nums font-medium">
            {formatQuantity(equipment.current_hours, 1)} h
          </p>
        </div>
      )}
      {selected && (
        <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}
    </button>
  )
}

// ─── Numeric keypad-style input ───────────────────────────────────────────────

interface LitrosInputProps {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

function LitrosInput({ value, onChange, disabled }: LitrosInputProps) {
  function append(digit: string) {
    if (disabled) return
    if (digit === '.' && value.includes('.')) return
    if (digit === '.' && value === '') {
      onChange('0.')
      return
    }
    // Prevent more than 2 decimal places
    const parts = (value + digit).split('.')
    if (parts[1] && parts[1].length > 2) return
    onChange(value + digit)
  }

  function backspace() {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']

  return (
    <div className="flex flex-col gap-3">
      {/* Display */}
      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-center">
        <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
          {value || '0'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">litros</p>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => (k === '⌫' ? backspace() : append(k))}
            className={cn(
              'rounded-xl border py-4 text-lg font-semibold transition-all select-none',
              'active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              k === '⌫'
                ? 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
                : 'border-border bg-card hover:bg-muted/50',
              disabled && 'opacity-40 pointer-events-none'
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CargaDieselPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { organization, activeSeason } = useAuth()
  const orgId = organization?.id ?? ''

  const [form, setForm] = useState<FormState>({
    equipmentId: '',
    operatorId: '',
    litros: '',
    horometroActual: '',
    notas: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [summary, setSummary] = useState<{
    litros: number
    tractorName: string
    rendimiento: number | null
    costo: number
  } | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: allEquipment = [], isLoading: loadingEquipment } = useEquipment()
  const { data: allEmployees = [], isLoading: loadingEmployees } = useEmployees()

  // Filter only active tractors/vehicles
  const equipment = useMemo(
    () => allEquipment.filter((e) => e.is_active && (e.type === 'tractor' || e.type === 'vehicle')),
    [allEquipment]
  )
  const employees = useMemo(
    () => allEmployees.filter((e) => e.is_active),
    [allEmployees]
  )

  const { data: dieselItem } = useQuery<Item | null>({
    queryKey: ['diesel-item', orgId],
    queryFn: () => fetchDieselItem(orgId),
    enabled: !!orgId,
  })

  const { data: lastLine } = useQuery<StockMovementLine | null>({
    queryKey: ['diesel-last-line', form.equipmentId, orgId],
    queryFn: () => fetchLastLineForEquipment(form.equipmentId, orgId),
    enabled: !!form.equipmentId && !!orgId,
  })

  const selectedEquipment = useMemo(
    () => equipment.find((e) => e.id === form.equipmentId) ?? null,
    [equipment, form.equipmentId]
  )

  const lastHorometro = lastLine?.equipment_hours_after ?? selectedEquipment?.current_hours

  // ── Handlers ─────────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const litros = parseFloat(form.litros)
    const horometroActual = form.horometroActual ? parseFloat(form.horometroActual) : null

    if (!form.equipmentId) {
      toast.error('Selecciona un tractor')
      return
    }
    if (!form.operatorId) {
      toast.error('Selecciona un operador')
      return
    }
    if (!litros || litros <= 0) {
      toast.error('Ingresa los litros cargados')
      return
    }
    if (!dieselItem) {
      toast.error('No se encontró el artículo de diésel. Configura un artículo con is_diesel=true.')
      return
    }
    if (!activeSeason) {
      toast.error('No hay temporada activa')
      return
    }

    setSubmitting(true)

    try {
      // 1. Create stock_movement
      const { data: movement, error: movErr } = await db
        .from('stock_movements')
        .insert({
          organization_id: orgId,
          season_id: activeSeason.id,
          movement_type: 'exit_consumption',
          status: 'posted',
          posted_at: new Date().toISOString(),
          notes: form.notas || null,
        })
        .select()
        .single()

      if (movErr) throw movErr

      // 2. Determine unit cost
      const unitCostMxn = dieselItem ? (dieselItem as Item & { avg_cost_mxn?: number }).avg_cost_mxn ?? 0 : 0
      const lineTotalMxn = unitCostMxn * litros

      // 3. Create stock_movement_line
      const { error: lineErr } = await db.from('stock_movement_lines').insert({
        movement_id: movement.id,
        item_id: dieselItem.id,
        quantity: litros,
        unit_cost_native: unitCostMxn,
        native_currency: 'MXN',
        unit_cost_mxn: unitCostMxn,
        line_total_native: lineTotalMxn,
        line_total_mxn: lineTotalMxn,
        destination_type: 'equipment',
        equipment_id: form.equipmentId,
        operator_employee_id: form.operatorId,
        diesel_liters: litros,
        equipment_hours_before: lastHorometro ?? null,
        equipment_hours_after: horometroActual,
        notes: form.notas || null,
      })

      if (lineErr) throw lineErr

      // 4. Compute rendimiento for summary
      let rendimiento: number | null = null
      if (lastHorometro != null && horometroActual != null) {
        const delta = horometroActual - lastHorometro
        if (delta > 0) rendimiento = litros / delta
      }

      const tractorName = selectedEquipment
        ? `${selectedEquipment.code} – ${selectedEquipment.name}`
        : 'Tractor'

      setSummary({ litros, tractorName, rendimiento, costo: lineTotalMxn })
      setSubmitted(true)

      queryClient.invalidateQueries({ queryKey: ['diesel-lines'] })
      queryClient.invalidateQueries({ queryKey: ['diesel-last-line'] })

      toast.success(`Carga registrada: ${formatQuantity(litros, 1)}L para ${tractorName}`)
    } catch (err) {
      console.error(err)
      toast.error('Error al registrar la carga de diésel')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNuevaCarga() {
    setForm({ equipmentId: '', operatorId: '', litros: '', horometroActual: '', notas: '' })
    setSummary(null)
    setSubmitted(false)
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted && summary) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-lg mx-auto">
        <PageHeader
          title="Carga registrada"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/diesel')}>
              <ArrowLeft className="mr-1.5 size-3.5" />
              Volver
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6 pb-5 px-6 flex flex-col items-center gap-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              <Check className="size-8" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold">{summary.tractorName}</p>
              <p className="text-4xl font-bold tabular-nums text-primary">
                {formatQuantity(summary.litros, 1)} L
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 w-full text-left">
              <div>
                <p className="text-xs text-muted-foreground">Costo estimado</p>
                <p className="text-base font-semibold font-mono">
                  {formatMoney(summary.costo, 'MXN')}
                </p>
              </div>
              {summary.rendimiento != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Rendimiento</p>
                  <p className="text-base font-semibold font-mono">
                    {formatQuantity(summary.rendimiento, 2)} L/h
                  </p>
                </div>
              )}
              {lastHorometro != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Horóm. anterior</p>
                  <p className="text-base font-semibold font-mono">
                    {formatQuantity(lastHorometro, 1)} h
                  </p>
                </div>
              )}
              {form.horometroActual && (
                <div>
                  <p className="text-xs text-muted-foreground">Horóm. actual</p>
                  <p className="text-base font-semibold font-mono">
                    {formatQuantity(parseFloat(form.horometroActual), 1)} h
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 w-full pt-2">
              <Button className="w-full" onClick={handleNuevaCarga}>
                + Nueva carga
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/admin/diesel')}>
                Ver historial
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const isLoading = loadingEquipment || loadingEmployees

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-lg mx-auto">
      <PageHeader
        title="Carga rápida de diésel"
        description="Registra el consumo de combustible"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/diesel')}>
            <ArrowLeft className="mr-1.5 size-3.5" />
            Volver
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* ── 1. Tractor ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              1
            </div>
            <Label className="text-base font-semibold">Tractor</Label>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl border bg-muted animate-pulse" />
              ))}
            </div>
          ) : equipment.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay equipos activos registrados.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {equipment.map((eq) => (
                <EquipmentCard
                  key={eq.id}
                  equipment={eq}
                  selected={form.equipmentId === eq.id}
                  onSelect={() => set('equipmentId', eq.id)}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ── 2. Operador ──────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              2
            </div>
            <Label htmlFor="operator" className="text-base font-semibold">
              Operador
            </Label>
          </div>

          <Select
            value={form.operatorId}
            onValueChange={(v) => set('operatorId', v ?? '')}
            disabled={isLoading}
          >
            <SelectTrigger id="operator" className="h-12 text-base">
              <SelectValue placeholder="Selecciona el operador…" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id} className="py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{emp.full_name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {emp.employee_code}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <Separator />

        {/* ── 3. Litros ────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              3
            </div>
            <Label className="text-base font-semibold">Litros cargados</Label>
          </div>

          <LitrosInput
            value={form.litros}
            onChange={(v) => set('litros', v)}
            disabled={submitting}
          />
        </section>

        <Separator />

        {/* ── 4. Horómetro ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              4
            </div>
            <Label htmlFor="horometro" className="text-base font-semibold">
              Horómetro actual
            </Label>
          </div>

          {lastHorometro != null && (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border px-3 py-2 text-sm text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              <span>
                Última lectura registrada:{' '}
                <span className="font-mono font-medium text-foreground">
                  {formatQuantity(lastHorometro, 1)} h
                </span>
              </span>
            </div>
          )}

          <Input
            id="horometro"
            type="number"
            inputMode="decimal"
            min={lastHorometro ?? 0}
            step="0.1"
            placeholder={
              lastHorometro != null
                ? `Mayor a ${formatQuantity(lastHorometro, 1)}`
                : 'Ej. 1234.5'
            }
            value={form.horometroActual}
            onChange={(e) => set('horometroActual', e.target.value)}
            disabled={submitting}
            className="h-12 text-lg font-mono"
          />

          {/* Live rendimiento preview */}
          {form.litros && form.horometroActual && lastHorometro != null && (() => {
            const litros = parseFloat(form.litros)
            const actual = parseFloat(form.horometroActual)
            const delta = actual - lastHorometro
            if (delta <= 0 || !litros) return null
            const ren = litros / delta
            return (
              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">Rendimiento estimado</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-primary">
                    {formatQuantity(ren, 2)} L/h
                  </span>
                  <ChevronRight className="size-3.5 text-primary" />
                </div>
              </div>
            )
          })()}
        </section>

        <Separator />

        {/* ── 5. Notas ─────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
              5
            </div>
            <Label htmlFor="notas" className="text-base font-semibold text-muted-foreground">
              Notas / Folio de ticket{' '}
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">
                Opcional
              </Badge>
            </Label>
          </div>

          <textarea
            id="notas"
            rows={3}
            placeholder="Folio de ticket, observaciones, km de odómetro…"
            value={form.notas}
            onChange={(e) => set('notas', e.target.value)}
            disabled={submitting}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'placeholder:text-muted-foreground focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring resize-none',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          />
        </section>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <Button
          type="submit"
          size="lg"
          disabled={submitting || !form.equipmentId || !form.operatorId || !form.litros}
          className="w-full h-14 text-base font-semibold mt-2"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Registrando…
            </>
          ) : (
            <>
              <Fuel className="mr-2 size-4" />
              Registrar carga
            </>
          )}
        </Button>
      </form>
    </div>
  )
}

export default CargaDieselPage
