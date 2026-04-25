import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowLeftRight, Printer, CheckCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useBasePath } from '@/hooks/use-base-path'
import { useAuth } from '@/hooks/use-auth'
import { useRegisterPageTitle } from '@/contexts/page-title-context'
import { supabase } from '@/lib/supabase'
import { formatQuantity, formatFechaCorta, formatHora } from '@/lib/utils'
import { generateTraspasoPDF } from '@/lib/generate-traspaso-pdf'
import type { StockMovement, StockMovementLine, MovementStatus } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/custom/empty-state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type MovementDetail = StockMovement & {
  warehouse?: { name: string; code: string }
  counterpart_warehouse?: { name: string; code: string }
  lines?: (StockMovementLine & {
    item?: { sku: string; name: string; unit?: { code: string } | null }
  })[]
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

export default function TraspasoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization } = useAuth()
  const queryClient = useQueryClient()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [posting, setPosting] = useState(false)

  const { data: mov, isLoading } = useQuery<MovementDetail>({
    queryKey: ['movement-detail', id],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movements')
        .select('*, warehouse:warehouses!stock_movements_warehouse_id_fkey(name, code), counterpart_warehouse:warehouses!stock_movements_counterpart_warehouse_id_fkey(name, code), lines:stock_movement_lines(*, item:items(sku, name, unit:units(code)))')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as MovementDetail
    },
    enabled: !!id,
  })
  useRegisterPageTitle(mov?.document_number ?? undefined)

  async function handlePost() {
    setPosting(true)
    try {
      const { error } = await db.from('stock_movements').update({ status: 'posted' }).eq('id', id)
      if (error) throw error
      toast.success('Traspaso registrado')
      queryClient.invalidateQueries({ queryKey: ['movement-detail', id] })
    } catch {
      toast.error('Error al registrar el traspaso')
    } finally {
      setPosting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      const { error } = await db.from('stock_movements').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      toast.success('Traspaso cancelado')
      queryClient.invalidateQueries({ queryKey: ['movement-detail', id] })
    } catch {
      toast.error('Error al cancelar el traspaso')
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  async function handlePrint() {
    if (!mov || !organization) return
    try {
      generateTraspasoPDF(mov as any, organization)
    } catch {
      toast.error('Error al generar el PDF')
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
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!mov) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="w-fit -ml-1" onClick={() => navigate(`${basePath}/traspasos`)}>
          <ArrowLeft className="mr-1.5 size-3.5" /> Traspasos
        </Button>
        <EmptyState title="Traspaso no encontrado" description="El movimiento no existe o fue eliminado." action={{ label: 'Volver a Traspasos', onClick: () => navigate(`${basePath}/traspasos`) }} />
      </div>
    )
  }

  const lines = mov.lines ?? []
  const origin = mov.warehouse ? `${mov.warehouse.code} – ${mov.warehouse.name}` : '—'
  const dest = mov.counterpart_warehouse ? `${mov.counterpart_warehouse.code} – ${mov.counterpart_warehouse.name}` : '—'

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="w-fit -ml-1 text-muted-foreground" onClick={() => navigate(`${basePath}/traspasos`)}>
        <ArrowLeft className="mr-1.5 size-3.5" /> Traspasos
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold font-mono">
              {mov.document_number ?? <span className="text-muted-foreground font-sans font-normal text-base">Sin folio</span>}
            </h1>
            <StatusBadge status={mov.status} />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>{origin}</span>
            <ArrowLeftRight className="size-3.5 shrink-0" />
            <span className="text-foreground font-medium">{dest}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatFechaCorta(mov.created_at)} · {formatHora(mov.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {mov.status === 'posted' && (
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 size-3.5" /> Imprimir
            </Button>
          )}
          {mov.status === 'draft' && (
            <Button size="sm" onClick={handlePost} disabled={posting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle className="mr-1.5 size-3.5" />
              {posting ? 'Registrando…' : 'Registrar'}
            </Button>
          )}
          {mov.status === 'posted' && (
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} className="text-destructive hover:text-destructive border-destructive/30">
              <XCircle className="mr-1.5 size-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Detalles</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Origen" value={origin} />
          <InfoRow label="Destino" value={dest} />
          <InfoRow label="Notas de transporte" value={mov.transport_notes} />
          <InfoRow label="Notas" value={mov.notes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Artículos ({lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Sin líneas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">SKU</TableHead>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="w-28 text-right">Cantidad</TableHead>
                    <TableHead className="w-16">Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{line.item?.sku ?? '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{line.item?.name ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(line.quantity)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground uppercase">{line.item?.unit?.code ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={cancelOpen} onOpenChange={(o) => !o && setCancelOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este traspaso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción revertirá el movimiento de inventario asociado. No se puede deshacer.
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
