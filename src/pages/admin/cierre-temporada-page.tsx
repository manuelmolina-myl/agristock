import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  ChevronRight,
  ChevronLeft,
  Loader2,
  PackageX,
  Info,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatFechaCorta, formatMoney, cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockSnapshotRow {
  item_id: string
  warehouse_id: string
  sku: string
  nombre: string
  almacen: string
  cantidad: number
  costo_promedio_mxn: number
  valor_total_mxn: number
  unit_code: string
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary/20 text-primary ring-2 ring-primary',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <CheckCircle2 className="size-4" /> : step}
            </div>
            {step < total && (
              <div
                className={cn(
                  'h-px w-8 transition-colors',
                  done ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: Pre-cierre checklist ─────────────────────────────────────────────

interface ChecklistItem {
  id: string
  label: string
  description?: string
  auto: boolean
  checked: boolean
}

function useDraftCount(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<number>({
    queryKey: ['cierre-draft-count', orgId, seasonId],
    queryFn: async () => {
      const { count, error } = await db
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('season_id', seasonId)
        .eq('status', 'draft')
      if (error) throw error
      return count ?? 0
    },
    enabled: !!orgId && !!seasonId,
  })
}

function useTodayFxRate(orgId: string | undefined) {
  return useQuery<boolean>({
    queryKey: ['cierre-fx-today', orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { count, error } = await db
        .from('fx_rates')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('date', today)
      if (error) throw error
      return (count ?? 0) > 0
    },
    enabled: !!orgId,
  })
}

interface Step1Props {
  manualChecks: Record<string, boolean>
  onManualToggle: (id: string, value: boolean) => void
  onNext: () => void
}

function Step1Checklist({ manualChecks, onManualToggle, onNext }: Step1Props) {
  const { organization, activeSeason } = useAuth()
  const navigate = useNavigate()
  const draftQ = useDraftCount(organization?.id, activeSeason?.id)
  const fxQ = useTodayFxRate(organization?.id)

  const draftCount = draftQ.data ?? 0
  const hasFxToday = fxQ.data ?? false

  const items: ChecklistItem[] = [
    {
      id: 'no_draft',
      label: 'Sin movimientos en borrador',
      description:
        draftCount > 0
          ? `Hay ${draftCount} movimiento${draftCount !== 1 ? 's' : ''} en borrador sin publicar.`
          : 'Todos los movimientos están publicados o cancelados.',
      auto: true,
      checked: draftCount === 0,
    },
    {
      id: 'conteo_fisico',
      label: 'Conteo físico conciliado',
      description: 'Confirmo que el conteo físico de almacén fue realizado y conciliado.',
      auto: false,
      checked: !!manualChecks.conteo_fisico,
    },
    {
      id: 'proveedores',
      label: 'Todos los proveedores conciliados',
      description: 'Confirmo que las cuentas con proveedores están conciliadas.',
      auto: false,
      checked: !!manualChecks.proveedores,
    },
    {
      id: 'fx_rate',
      label: 'Tipo de cambio actualizado',
      description: hasFxToday
        ? 'El tipo de cambio de hoy está registrado.'
        : 'No se ha registrado un tipo de cambio para la fecha de hoy.',
      auto: true,
      checked: hasFxToday,
    },
  ]

  const allChecked = items.every((i) => i.checked)
  const isLoading = draftQ.isLoading || fxQ.isLoading

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verificación previa al cierre</CardTitle>
          <p className="text-sm text-muted-foreground">
            Todos los puntos deben estar confirmados antes de continuar.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <div className="mt-0.5">
                {item.auto ? (
                  isLoading ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : item.checked ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <AlertTriangle className="size-5 text-warning" />
                  )
                ) : (
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(v) => onManualToggle(item.id, !!v)}
                    disabled={item.auto}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={!item.auto ? item.id : undefined}
                  className={cn(
                    'text-sm font-medium leading-tight',
                    !item.auto && 'cursor-pointer',
                    item.checked ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </label>
                {item.description && (
                  <p
                    className={cn(
                      'mt-0.5 text-xs',
                      item.checked ? 'text-muted-foreground' : 'text-warning',
                      item.checked && 'text-muted-foreground',
                    )}
                  >
                    {item.description}
                  </p>
                )}
                {item.id === 'no_draft' && draftCount > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1 text-xs text-primary"
                    onClick={() => navigate('../entradas')}
                  >
                    Ver movimientos en borrador
                    <ChevronRight className="ml-0.5 size-3" />
                  </Button>
                )}
                {item.id === 'fx_rate' && !hasFxToday && !fxQ.isLoading && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1 text-xs text-primary"
                    onClick={() => navigate('../tipo-cambio')}
                  >
                    Registrar tipo de cambio
                    <ChevronRight className="ml-0.5 size-3" />
                  </Button>
                )}
              </div>
              <div className="shrink-0">
                {item.checked ? (
                  <Badge
                    variant="outline"
                    className="text-xs bg-success/10 text-success border-success/30"
                  >
                    Listo
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs bg-warning/10 text-warning border-warning/30"
                  >
                    Pendiente
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!allChecked || isLoading}
        >
          Continuar al resumen
          <ChevronRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 2: Preview snapshot ─────────────────────────────────────────────────

function useStockSnapshot(orgId: string | undefined, seasonId: string | undefined) {
  return useQuery<StockSnapshotRow[]>({
    queryKey: ['cierre-snapshot', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select(
          'item_id, warehouse_id, quantity, avg_cost_mxn, item:items!inner(sku, name, unit:units(code)), warehouse:warehouses!inner(name)',
        )
        .eq('organization_id', orgId)
        .eq('season_id', seasonId)
        .gt('quantity', 0)
        .order('item_id', { ascending: true })
      if (error) throw error

      return (
        data as Array<{
          item_id: string
          warehouse_id: string
          quantity: number
          avg_cost_mxn: number
          item: { sku: string; name: string; unit: { code: string } | null }
          warehouse: { name: string }
        }>
      ).map((r) => ({
        item_id: r.item_id,
        warehouse_id: r.warehouse_id,
        sku: r.item.sku,
        nombre: r.item.name,
        almacen: r.warehouse.name,
        cantidad: r.quantity,
        costo_promedio_mxn: r.avg_cost_mxn,
        valor_total_mxn: r.quantity * r.avg_cost_mxn,
        unit_code: r.item.unit?.code ?? '',
      }))
    },
    enabled: !!orgId && !!seasonId,
  })
}

interface Step2Props {
  fxRate: number | null
  onNext: () => void
  onBack: () => void
}

function Step2Snapshot({ fxRate, onNext, onBack }: Step2Props) {
  const { organization, activeSeason } = useAuth()
  const { data: rows = [], isLoading } = useStockSnapshot(
    organization?.id,
    activeSeason?.id,
  )

  const totalMxn = rows.reduce((s, r) => s + r.valor_total_mxn, 0)
  const totalUsd = fxRate && fxRate > 0 ? totalMxn / fxRate : null

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen del inventario al cierre</CardTitle>
          <p className="text-sm text-muted-foreground">
            Solo se muestran artículos con existencia mayor a cero. Este snapshot quedará
            registrado permanentemente al cerrar la temporada.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando inventario…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <PackageX className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No hay artículos con existencia en esta temporada.
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo prom. (MXN)</TableHead>
                    <TableHead className="text-right">Valor total (MXN)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.item_id}-${r.warehouse_id}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.sku}
                      </TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.almacen}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 2 })}{' '}
                        <span className="text-xs text-muted-foreground">{r.unit_code}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(r.costo_promedio_mxn)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatMoney(r.valor_total_mxn)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-semibold">
                      Valor total de inventario al cierre
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatMoney(totalMxn)}
                      {totalUsd !== null && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">
                          / {formatMoney(totalUsd, 'USD')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" />
          Atrás
        </Button>
        <Button onClick={onNext}>
          Continuar a confirmación
          <ChevronRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3: Confirmation ─────────────────────────────────────────────────────

interface Step3Props {
  confirmText: string
  onConfirmTextChange: (v: string) => void
  onBack: () => void
  onConfirm: () => void
  isClosing: boolean
}

const REQUIRED_TEXT = 'CERRAR TEMPORADA'

function Step3Confirmation({
  confirmText,
  onConfirmTextChange,
  onBack,
  onConfirm,
  isClosing,
}: Step3Props) {
  const canConfirm = confirmText.trim().toUpperCase() === REQUIRED_TEXT

  return (
    <div className="flex flex-col gap-6">
      {/* Warning card */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex gap-3 pt-5 pb-5">
          <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-destructive">
              Esta acción es irreversible
            </p>
            <p className="text-sm text-destructive/80">
              Al cerrar la temporada se congelarán todos los saldos y no se podrán registrar
              más movimientos. Se creará automáticamente una nueva temporada con los saldos
              actuales como inventario inicial.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* What will happen */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Qué ocurrirá al confirmar?</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-none">
            {[
              'Se guardará un snapshot permanente del inventario actual.',
              'La temporada activa pasará a estado "cerrada" con la fecha y usuario actual.',
              'Se creará una nueva temporada (año siguiente) en estado "planificación".',
              'Todos los artículos con saldo positivo se traspasarán como inventario inicial a la nueva temporada.',
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground mt-0.5">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Separator />

      {/* Confirmation input */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-input" className="text-sm font-medium">
          Para confirmar, escribe{' '}
          <span className="font-mono font-bold text-foreground">{REQUIRED_TEXT}</span> en el
          siguiente campo:
        </Label>
        <Input
          id="confirm-input"
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
          placeholder={REQUIRED_TEXT}
          className={cn(
            'font-mono transition-colors',
            confirmText.length > 0 && !canConfirm && 'border-destructive focus-visible:ring-destructive',
            canConfirm && 'border-success focus-visible:ring-success',
          )}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isClosing}>
          <ChevronLeft className="mr-1.5 size-4" />
          Atrás
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={!canConfirm || isClosing}
        >
          {isClosing ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Cerrando temporada…
            </>
          ) : (
            <>
              <Lock className="mr-1.5 size-4" />
              Cerrar temporada definitivamente
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CierreTemporadaPage() {
  const { organization, activeSeason, profile } = useAuth()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})
  const [confirmText, setConfirmText] = useState('')
  const [alertOpen, setAlertOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  // Fetch today's fx rate for USD display in step 2
  const fxQuery = useQuery<number | null>({
    queryKey: ['cierre-fx-rate-today', organization?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await db
        .from('fx_rates')
        .select('rate')
        .eq('organization_id', organization?.id)
        .eq('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as { rate: number } | null)?.rate ?? null
    },
    enabled: !!organization?.id,
  })

  // Fetch snapshot rows for the close operation
  const snapshotQuery = useQuery<StockSnapshotRow[]>({
    queryKey: ['cierre-snapshot', organization?.id, activeSeason?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select(
          'item_id, warehouse_id, quantity, avg_cost_mxn, item:items!inner(sku, name, unit:units(code)), warehouse:warehouses!inner(name)',
        )
        .eq('organization_id', organization?.id)
        .eq('season_id', activeSeason?.id)
        .gt('quantity', 0)
      if (error) throw error
      return (
        data as Array<{
          item_id: string
          warehouse_id: string
          quantity: number
          avg_cost_mxn: number
          item: { sku: string; name: string; unit: { code: string } | null }
          warehouse: { name: string }
        }>
      ).map((r) => ({
        item_id: r.item_id,
        warehouse_id: r.warehouse_id,
        sku: r.item.sku,
        nombre: r.item.name,
        almacen: r.warehouse.name,
        cantidad: r.quantity,
        costo_promedio_mxn: r.avg_cost_mxn,
        valor_total_mxn: r.quantity * r.avg_cost_mxn,
        unit_code: r.item.unit?.code ?? '',
      }))
    },
    enabled: !!organization?.id && !!activeSeason?.id && step === 3,
  })

  const handleManualToggle = (id: string, value: boolean) => {
    setManualChecks((prev) => ({ ...prev, [id]: value }))
  }

  const handleConfirm = async () => {
    if (!organization || !activeSeason || !profile) return
    setAlertOpen(false)
    setIsClosing(true)

    try {
      const now = new Date().toISOString()
      const rows = snapshotQuery.data ?? []
      const snapshotData = rows.map((r) => ({
        item_id: r.item_id,
        warehouse_id: r.warehouse_id,
        sku: r.sku,
        nombre: r.nombre,
        almacen: r.almacen,
        cantidad: r.cantidad,
        costo_promedio_mxn: r.costo_promedio_mxn,
        valor_total_mxn: r.valor_total_mxn,
        unit_code: r.unit_code,
      }))

      // 1. Create season_closures record
      const { error: closureError } = await db.from('season_closures').insert({
        organization_id: organization.id,
        season_id: activeSeason.id,
        closed_by: profile.id,
        closed_at: now,
        snapshot_data: snapshotData,
      })
      if (closureError) throw closureError

      // 2. Update season status to 'closed'
      const { error: seasonError } = await db
        .from('seasons')
        .update({ status: 'closed', closed_at: now, closed_by: profile.id })
        .eq('id', activeSeason.id)
      if (seasonError) throw seasonError

      // 3. Create new season (next year, status = 'planning')
      const currentYear = new Date(activeSeason.start_date).getFullYear()
      const nextYear = currentYear + 1
      const { data: newSeasonData, error: newSeasonError } = await db
        .from('seasons')
        .insert({
          organization_id: organization.id,
          name: `Temporada ${nextYear}`,
          start_date: `${nextYear}-01-01`,
          end_date: `${nextYear}-12-31`,
          status: 'planning',
        })
        .select()
        .single()
      if (newSeasonError) throw newSeasonError

      const newSeasonId = (newSeasonData as { id: string }).id

      // 4. Create entry_initial movements in new season for items with qty > 0
      if (rows.length > 0) {
        // Group rows by warehouse to create one movement per warehouse
        const byWarehouse = rows.reduce<Record<string, StockSnapshotRow[]>>((acc, r) => {
          if (!acc[r.warehouse_id]) acc[r.warehouse_id] = []
          acc[r.warehouse_id].push(r)
          return acc
        }, {})

        for (const [warehouseId, warehouseRows] of Object.entries(byWarehouse)) {
          const totalMxn = warehouseRows.reduce((s, r) => s + r.valor_total_mxn, 0)

          // Create movement
          const { data: movData, error: movError } = await db
            .from('stock_movements')
            .insert({
              organization_id: organization.id,
              season_id: newSeasonId,
              movement_type: 'entry_initial',
              warehouse_id: warehouseId,
              document_number: `CI-${currentYear}-TRASPASO`,
              status: 'posted',
              posted_at: now,
              posted_by: profile.id,
              total_mxn: totalMxn,
            })
            .select('id')
            .single()
          if (movError) throw movError

          const movId = (movData as { id: string }).id

          // Create movement lines
          const lines = warehouseRows.map((r) => ({
            movement_id: movId,
            item_id: r.item_id,
            quantity: r.cantidad,
            unit_cost_native: r.costo_promedio_mxn,
            unit_cost_mxn: r.costo_promedio_mxn,
            total_mxn: r.valor_total_mxn,
          }))

          const { error: linesError } = await db.from('stock_movement_lines').insert(lines)
          if (linesError) throw linesError
        }
      }

      // Invalidate all relevant queries
      await queryClient.invalidateQueries()

      toast.success('Temporada cerrada exitosamente', {
        description: `La temporada "${activeSeason.name}" fue cerrada y se creó la nueva temporada ${nextYear}.`,
      })

      navigate(basePath)
    } catch (err) {
      console.error(err)
      toast.error('Error al cerrar la temporada', {
        description: 'Ocurrió un error inesperado. Por favor intenta de nuevo.',
      })
    } finally {
      setIsClosing(false)
    }
  }

  // ── Season already closed ──────────────────────────────────────────────────

  if (!activeSeason) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Cierre de Temporada"
          description="Sin temporada activa"
        />
        <Card>
          <CardContent className="flex gap-3 pt-5 pb-5">
            <Info className="size-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Sin temporada activa</p>
              <p className="text-sm text-muted-foreground">
                No hay ninguna temporada activa. Para registrar movimientos debes activar o
                crear una nueva temporada.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (activeSeason.status === 'closed') {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Cierre de Temporada"
          description={`${activeSeason.name} · ${activeSeason.status}`}
        />
        <Card>
          <CardContent className="flex gap-3 pt-5 pb-5">
            <Lock className="size-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Temporada cerrada
              </p>
              <p className="text-sm text-muted-foreground">
                La temporada{' '}
                <span className="font-semibold text-foreground">{activeSeason.name}</span>{' '}
                fue cerrada el{' '}
                <span className="font-semibold text-foreground">
                  {activeSeason.closed_at
                    ? formatFechaCorta(activeSeason.closed_at)
                    : '—'}
                </span>
                . No se pueden registrar más movimientos.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────

  const stepLabels = [
    'Pre-cierre',
    'Vista previa',
    'Confirmación',
  ]

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Cierre de Temporada"
        description={`${activeSeason.name} · Temporada activa`}
      />

      {/* Step progress */}
      <div className="flex flex-col gap-3">
        <StepIndicator current={step} total={3} />
        <div className="flex gap-2">
          {stepLabels.map((label, i) => (
            <span
              key={i}
              className={cn(
                'text-xs transition-colors',
                i + 1 === step
                  ? 'font-semibold text-primary'
                  : i + 1 < step
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/50',
              )}
              style={{ minWidth: '80px' }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <Separator />

      {/* Step content */}
      {step === 1 && (
        <Step1Checklist
          manualChecks={manualChecks}
          onManualToggle={handleManualToggle}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step2Snapshot
          fxRate={fxQuery.data ?? null}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <Step3Confirmation
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          onBack={() => setStep(2)}
          onConfirm={() => setAlertOpen(true)}
          isClosing={isClosing}
        />
      )}

      {/* Final confirmation dialog */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              ¿Cerrar la temporada definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  Estás a punto de cerrar la temporada{' '}
                  <strong>{activeSeason.name}</strong>. Esta operación{' '}
                  <strong>no puede deshacerse</strong>.
                </p>
                <p className="text-muted-foreground">
                  Se congelarán todos los saldos, se guardará el snapshot de inventario y se
                  creará automáticamente la temporada del siguiente año.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isClosing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClosing ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Cerrando…
                </>
              ) : (
                'Sí, cerrar temporada'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CierreTemporadaPage
