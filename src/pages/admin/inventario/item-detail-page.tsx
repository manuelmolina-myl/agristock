import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBasePath, useCanSeePrices } from '@/hooks/use-base-path'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Package,
  Fuel,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { useItem, useItemStock, useSoftDelete } from '@/hooks/use-supabase-query'
import { useRegisterPageTitle } from '@/contexts/page-title-context'
import { formatMoney, formatQuantity, formatFechaCorta } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

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

// ─── Price history ────────────────────────────────────────────────────────────

interface PricePoint { date: string; cost: number; costMxn: number }

function usePriceHistory(itemId: string | undefined) {
  return useQuery<PricePoint[]>({
    queryKey: ['price-history', itemId],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movement_lines')
        .select('unit_cost_native, unit_cost_mxn, movement:stock_movements!inner(movement_type, status, posted_at)')
        .eq('item_id', itemId)
        .eq('movement.status', 'posted')
        .like('movement.movement_type', 'entry_%')
        .order('movement(posted_at)', { ascending: true })
        .limit(60)
      if (error) throw error
      const rows = data as Array<{
        unit_cost_native: number
        unit_cost_mxn: number
        movement: { posted_at: string }
      }>
      return rows.map((r) => ({
        date: r.movement.posted_at.slice(0, 10),
        cost: r.unit_cost_native,
        costMxn: r.unit_cost_mxn,
      }))
    },
    enabled: !!itemId,
  })
}

function PriceHistoryTooltip({
  active, payload, label, currency,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
  currency: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold">{formatMoney(payload[0].value, currency)}</p>
      {currency !== 'MXN' && payload[1] && (
        <p className="text-muted-foreground">{formatMoney(payload[1].value, 'MXN')} MXN</p>
      )}
    </div>
  )
}

function PriceHistorySection({ itemId, currency }: { itemId: string; currency: string }) {
  const { data: points = [], isLoading } = usePriceHistory(itemId)

  if (isLoading) return <Skeleton className="h-36 w-full" />
  if (points.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Sin historial de precios suficiente</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => formatFechaCorta(v)}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
          tickLine={false}
          axisLine={false}
          width={46}
        />
        <Tooltip content={<PriceHistoryTooltip currency={currency} />} />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={points.length < 20}
          activeDot={{ r: 4 }}
        />
        {currency !== 'MXN' && (
          <Line
            type="monotone"
            dataKey="costMxn"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

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

function StockTab({ itemId, minStock, maxStock, reorderPoint, canSeePrices }: {
  itemId: string
  minStock: number | null
  maxStock: number | null
  reorderPoint: number | null
  canSeePrices: boolean
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
            {canSeePrices && <TableHead className="w-36 text-right">Costo prom. nativo</TableHead>}
            {canSeePrices && <TableHead className="w-36 text-right">Costo prom. MXN</TableHead>}
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
              {canSeePrices && (
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(row.avg_cost_native, row.item?.native_currency ?? 'MXN')}
                </TableCell>
              )}
              {canSeePrices && (
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(row.avg_cost_mxn, 'MXN')}
                </TableCell>
              )}
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
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()

  const { data: item, isLoading } = useItem(id)
  useRegisterPageTitle(item?.name)
  const softDelete = useSoftDelete('items')

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  async function handleDelete() {
    if (!item) return
    try {
      await softDelete.mutateAsync(item.id)
      toast.success(`"${item.name}" eliminado`)
      navigate(`${basePath}/inventario`)
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
        <Button variant="ghost" size="sm" className="w-fit -ml-1" onClick={() => navigate(`${basePath}/inventario`)}>
          <ArrowLeft className="mr-1.5 size-3.5" />
          Inventario
        </Button>
        <EmptyState
          icon={<Package className="size-5" />}
          title="Ítem no encontrado"
          description="El ítem que buscas no existe o fue eliminado."
          action={{ label: 'Volver al inventario', onClick: () => navigate(`${basePath}/inventario`) }}
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
          onClick={() => navigate(`${basePath}/inventario`)}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Inventario
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.name}
                className="size-16 rounded-xl object-cover border border-border shrink-0"
              />
            )}
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
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`${basePath}/inventario/${item.id}/editar`)}
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

      {/* ── Stock por almacén (siempre visible) ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Stock por almacén</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <StockTab
            itemId={item.id}
            minStock={item.min_stock}
            maxStock={item.max_stock}
            reorderPoint={item.reorder_point}
            canSeePrices={canSeePrices}
          />
        </CardContent>
      </Card>

      {/* ── Historial de precio ────────────────────────────────────────────── */}
      {canSeePrices && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="size-4" />
              Historial de precio unitario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PriceHistorySection itemId={item.id} currency={item.native_currency} />
          </CardContent>
        </Card>
      )}

      {/* ── Info general ───────────────────────────────────────────────────── */}
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
              <InfoRow label="Descripción" value={item.description ?? undefined} />
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
                value={item.unit ? `${item.unit.name} (${item.unit.code})` : undefined}
              />
              <InfoRow
                label="Moneda nativa"
                value={<CurrencyBadge currency={item.native_currency} size="sm" />}
              />
              <InfoRow
                label="Código de barras"
                value={item.barcode ? <span className="font-mono text-xs">{item.barcode}</span> : undefined}
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

        {/* Stock limits + notas */}
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Notas</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
