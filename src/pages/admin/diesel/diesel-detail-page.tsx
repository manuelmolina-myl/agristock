import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, XCircle, Gauge, Fuel } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useBasePath } from '@/hooks/use-base-path'
import { useCanSeePrices } from '@/hooks/use-base-path'
import { useRegisterPageTitle } from '@/contexts/page-title-context'
import { supabase } from '@/lib/supabase'
import { formatQuantity, formatFechaCorta, formatHora, formatMoney } from '@/lib/utils'
import type { StockMovement, StockMovementLine, MovementStatus } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/custom/empty-state'
import { MoneyDisplay } from '@/components/custom/money-display'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type DieselMovement = StockMovement & {
  warehouse?: { name: string; code: string }
  line?: (StockMovementLine & {
    item?: { name: string; sku: string } | null
    equipment?: { name: string; code: string } | null
    operator?: { full_name: string } | null
  }) | null
}

function StatusBadge({ status }: { status: MovementStatus }) {
  const classes: Record<MovementStatus, string> = {
    draft:     'bg-muted text-muted-foreground border-muted-foreground/20',
    posted:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  }
  const labels: Record<MovementStatus, string> = {
    draft: 'Borrador', posted: 'Registrado', cancelled: 'Cancelado',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">
        {value ?? <span className="text-muted-foreground font-normal">—</span>}
      </span>
    </div>
  )
}

export default function DieselDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()
  const queryClient = useQueryClient()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const { data: mov, isLoading } = useQuery<DieselMovement>({
    queryKey: ['diesel-detail', id],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movements')
        .select('*, warehouse:warehouses!stock_movements_warehouse_id_fkey(name, code), line:stock_movement_lines(*, item:items(name, sku), equipment:equipment(name, code), operator:employees!stock_movement_lines_operator_employee_id_fkey(full_name))')
        .eq('id', id)
        .single()
      if (error) throw error
      const row = data as DieselMovement & { line: any[] }
      // line is an array; grab first entry
      return { ...row, line: Array.isArray(row.line) ? row.line[0] ?? null : row.line }
    },
    enabled: !!id,
  })
  useRegisterPageTitle(mov?.document_number ?? undefined)

  async function handleCancel() {
    setCancelling(true)
    try {
      const { error } = await db.from('stock_movements').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      toast.success('Carga cancelada')
      queryClient.invalidateQueries({ queryKey: ['diesel-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['diesel-lines'] })
    } catch {
      toast.error('Error al cancelar la carga')
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <Skeleton className="h-8 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!mov) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="w-fit -ml-1" onClick={() => navigate(`${basePath}/diesel`)}>
          <ArrowLeft className="mr-1.5 size-3.5" /> Diésel
        </Button>
        <EmptyState title="Carga no encontrada" description="El movimiento no existe o fue eliminado." action={{ label: 'Volver a Diésel', onClick: () => navigate(`${basePath}/diesel`) }} />
      </div>
    )
  }

  const line = mov.line
  const liters = line?.diesel_liters
  const hBefore = line?.equipment_hours_before
  const hAfter = line?.equipment_hours_after
  const rendimiento = (liters != null && hBefore != null && hAfter != null && (hAfter - hBefore) > 0)
    ? liters / (hAfter - hBefore)
    : null

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="w-fit -ml-1 text-muted-foreground" onClick={() => navigate(`${basePath}/diesel`)}>
        <ArrowLeft className="mr-1.5 size-3.5" /> Diésel
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Fuel className="size-4 text-muted-foreground" />
            <h1 className="text-xl font-semibold font-mono">
              {mov.document_number ?? <span className="text-muted-foreground font-sans font-normal text-base">Sin folio</span>}
            </h1>
            <StatusBadge status={mov.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatFechaCorta(mov.created_at)} · {formatHora(mov.created_at)}
          </p>
        </div>

        {mov.status === 'posted' && (
          <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="text-destructive hover:text-destructive border-destructive/30">
            <XCircle className="mr-1.5 size-3.5" /> Cancelar carga
          </Button>
        )}
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">Litros cargados</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">
              {liters != null ? `${formatQuantity(liters, 1)} L` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">Rendimiento</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <p className="text-2xl font-semibold tabular-nums">
                {rendimiento != null ? formatQuantity(rendimiento, 2) : '—'}
              </p>
              {rendimiento != null && <span className="text-sm text-muted-foreground">L/h</span>}
            </div>
          </CardContent>
        </Card>
        {canSeePrices && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs text-muted-foreground">Costo total</p>
              <p className="text-2xl font-semibold tabular-nums mt-0.5">
                {line?.line_total_mxn != null ? formatMoney(line.line_total_mxn, 'MXN') : '—'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Detalles</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Almacén" value={mov.warehouse ? `${mov.warehouse.code} – ${mov.warehouse.name}` : undefined} />
          <InfoRow label="Equipo / Tractor" value={line?.equipment ? `${line.equipment.name} (${line.equipment.code})` : undefined} />
          <InfoRow label="Operador" value={line?.operator?.full_name} />
          <InfoRow label="Artículo" value={line?.item ? `${line.item.name} · ${line.item.sku}` : undefined} />
        </CardContent>
      </Card>

      {/* Horómetro */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Gauge className="size-3.5" /> Horómetro
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Inicio" value={hBefore != null ? <span className="font-mono">{formatQuantity(hBefore, 1)} h</span> : undefined} />
          <InfoRow label="Fin" value={hAfter != null ? <span className="font-mono">{formatQuantity(hAfter, 1)} h</span> : undefined} />
          <InfoRow
            label="Diferencia"
            value={hBefore != null && hAfter != null
              ? <span className="font-mono">{formatQuantity(hAfter - hBefore, 1)} h</span>
              : undefined}
          />
          <InfoRow
            label="Rendimiento"
            value={rendimiento != null
              ? <span className="font-mono">{formatQuantity(rendimiento, 2)} L/h</span>
              : undefined}
          />
        </CardContent>
      </Card>

      {/* Cost (if visible) */}
      {canSeePrices && line && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Costo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <InfoRow label="Costo unitario" value={<MoneyDisplay amount={line.unit_cost_native} currency={line.native_currency} />} />
            <InfoRow label="Total" value={<MoneyDisplay amount={line.line_total_mxn} currency="MXN" />} />
          </CardContent>
        </Card>
      )}

      {mov.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{mov.notes}</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={(o) => !o && setCancelOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta carga de diésel?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción revertirá el movimiento de inventario y afectará los reportes de consumo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
