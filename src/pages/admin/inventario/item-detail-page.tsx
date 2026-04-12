import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  Fuel,
  ArrowLeftRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { useItem, useItemStock, useSoftDelete } from '@/hooks/use-supabase-query'
import { formatMoney, formatQuantity } from '@/lib/utils'

import { CurrencyBadge } from '@/components/custom/currency-badge'
import { StockIndicator } from '@/components/custom/stock-indicator'
import { EmptyState } from '@/components/custom/empty-state'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

// ─── Info row helper ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? <span className="text-muted-foreground font-normal">—</span>}</span>
    </div>
  )
}

// ─── Stock table ──────────────────────────────────────────────────────────────

function StockTab({ itemId, minStock, maxStock, reorderPoint }: {
  itemId: string
  minStock: number | null
  maxStock: number | null
  reorderPoint: number | null
}) {
  const { data: stockRows = [], isLoading } = useItemStock({ item_id: itemId })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (stockRows.length === 0) {
    return (
      <EmptyState
        icon={<Package className="size-5" />}
        title="Sin stock registrado"
        description="El stock aparecerá cuando registres entradas en los almacenes."
      />
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
            <TableHead>Almacén</TableHead>
            <TableHead className="w-40">Cantidad</TableHead>
            <TableHead className="w-36 text-right">Costo prom. nativo</TableHead>
            <TableHead className="w-36 text-right">Costo prom. MXN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stockRows.map((row) => (
            <TableRow key={`${row.item_id}-${row.warehouse_id}`}>
              <TableCell>
                <span className="font-medium text-sm">
                  {row.warehouse?.name ?? row.warehouse_id}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1.5 w-32">
                  <span className="text-sm tabular-nums font-medium">
                    {formatQuantity(row.quantity)}
                  </span>
                  <StockIndicator
                    quantity={row.quantity}
                    minStock={minStock}
                    maxStock={maxStock}
                    reorderPoint={reorderPoint}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatMoney(row.avg_cost_native, row.item?.native_currency ?? 'MXN')}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatMoney(row.avg_cost_mxn, 'MXN')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: item, isLoading } = useItem(id)
  const softDelete = useSoftDelete('items')

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  async function handleDelete() {
    if (!item) return
    try {
      await softDelete.mutateAsync(item.id)
      toast.success(`"${item.name}" eliminado`)
      navigate('/admin/inventario')
    } catch {
      toast.error('No se pudo eliminar el ítem')
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (!item) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button variant="ghost" size="sm" className="w-fit -ml-1" onClick={() => navigate('/admin/inventario')}>
          <ArrowLeft className="mr-1.5 size-3.5" />
          Inventario
        </Button>
        <EmptyState
          icon={<Package className="size-5" />}
          title="Ítem no encontrado"
          description="El ítem que buscas no existe o fue eliminado."
          action={{ label: 'Volver al inventario', onClick: () => navigate('/admin/inventario') }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1 text-muted-foreground"
          onClick={() => navigate('/admin/inventario')}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Inventario
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {item.name}
              </h1>
              <CurrencyBadge currency={item.native_currency} />
              {item.is_diesel && (
                <Badge variant="secondary" className="gap-1">
                  <Fuel className="size-3" />
                  Diésel
                </Badge>
              )}
              {!item.is_active && (
                <Badge variant="secondary">Inactivo</Badge>
              )}
            </div>
            <p className="text-sm font-mono text-muted-foreground">{item.sku}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/admin/inventario/${item.id}/editar`)}
            >
              <Pencil className="mr-1.5 size-3.5" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Eliminar
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="general">
        <TabsList className="h-8">
          <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs">Stock por almacén</TabsTrigger>
          <TabsTrigger value="movimientos" className="text-xs">Movimientos</TabsTrigger>
        </TabsList>

        {/* ── General tab ─────────────────────────────────────────────────── */}
        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Info básica */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Información básica
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  <InfoRow label="SKU" value={<span className="font-mono">{item.sku}</span>} />
                  <InfoRow label="Nombre" value={item.name} />
                  <InfoRow
                    label="Descripción"
                    value={item.description ?? undefined}
                  />
                  <InfoRow
                    label="Categoría"
                    value={
                      item.category ? (
                        <span className="flex items-center gap-1.5">
                          {item.category.color && (
                            <span
                              className="inline-block size-2 rounded-full shrink-0"
                              style={{ backgroundColor: item.category.color }}
                            />
                          )}
                          {item.category.name}
                        </span>
                      ) : undefined
                    }
                  />
                  <InfoRow
                    label="Unidad"
                    value={
                      item.unit
                        ? `${item.unit.name} (${item.unit.code})`
                        : undefined
                    }
                  />
                  <InfoRow
                    label="Moneda nativa"
                    value={<CurrencyBadge currency={item.native_currency} size="sm" />}
                  />
                  <InfoRow
                    label="Código de barras"
                    value={
                      item.barcode
                        ? <span className="font-mono text-xs">{item.barcode}</span>
                        : undefined
                    }
                  />
                  <InfoRow
                    label="Es diésel"
                    value={
                      item.is_diesel ? (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Fuel className="size-3" /> Sí
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground font-normal text-sm">No</span>
                      )
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Stock limits */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Parámetros de stock
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    <InfoRow
                      label="Stock mínimo"
                      value={item.min_stock != null ? formatQuantity(item.min_stock) : undefined}
                    />
                    <InfoRow
                      label="Stock máximo"
                      value={item.max_stock != null ? formatQuantity(item.max_stock) : undefined}
                    />
                    <InfoRow
                      label="Punto de reorden"
                      value={item.reorder_point != null ? formatQuantity(item.reorder_point) : undefined}
                    />
                  </div>
                </CardContent>
              </Card>

              {item.notes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Notas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Stock tab ───────────────────────────────────────────────────── */}
        <TabsContent value="stock" className="mt-4">
          <StockTab
            itemId={item.id}
            minStock={item.min_stock}
            maxStock={item.max_stock}
            reorderPoint={item.reorder_point}
          />
        </TabsContent>

        {/* ── Movimientos tab ─────────────────────────────────────────────── */}
        <TabsContent value="movimientos" className="mt-4">
          <EmptyState
            icon={<ArrowLeftRight className="size-5" />}
            title="Sin movimientos"
            description="Los movimientos aparecerán cuando registres entradas y salidas."
          />
        </TabsContent>
      </Tabs>

      {/* ── Delete dialog ──────────────────────────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{item.name}</strong> ({item.sku}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ItemDetailPage
