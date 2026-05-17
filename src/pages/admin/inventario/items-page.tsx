import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Search, MoreHorizontal, Eye, Pencil, Trash2, Package, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { useItems, useCategories, useSoftDelete, useItemStock } from '@/hooks/use-supabase-query'
import { useBasePath } from '@/hooks/use-base-path'
import { usePermissions } from '@/hooks/use-permissions'
import type { Item } from '@/lib/database.types'
import { formatQuantity } from '@/lib/utils'

import { ItemsCsvImport } from './items-csv-import'
import { PageHeader } from '@/components/custom/page-header'
import { CurrencyBadge } from '@/components/custom/currency-badge'
import { EmptyState } from '@/components/custom/empty-state'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Stock alert helpers ──────────────────────────────────────────────────────

type StockAlert = 'sin_stock' | 'critico' | 'bajo' | null

function getStockAlert(qty: number, minStock: number | null, reorderPoint: number | null): StockAlert {
  if (qty <= 0) return 'sin_stock'
  if (minStock != null && qty <= minStock) return 'critico'
  if (reorderPoint != null && qty < reorderPoint) return 'bajo'
  return null
}

function StockAlertBadge({ alert }: { alert: StockAlert }) {
  if (!alert) return null
  const config = {
    sin_stock: { label: 'Sin stock', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
    critico:   { label: 'Crítico',   className: 'border-destructive/30 bg-destructive/10 text-destructive' },
    bajo:      { label: 'Stock bajo', className: 'border-warning/30 bg-warning/10 text-warning' },
  }
  const { label, className } = config[alert]
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      <AlertTriangle className="size-2.5" />
      {label}
    </span>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16 rounded-full" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItemsPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  // Cost visibility migrated from legacy `profile.role === 'almacenista'` check
  // to claim-based usePermissions().can('costs.view'). See 013_user_roles_table.sql.
  const canViewCosts = usePermissions().can('costs.view')
  const isAlmacenista = !canViewCosts

  const { data: items = [], isLoading } = useItems()
  const { data: categories = [] } = useCategories()
  const softDelete = useSoftDelete('items')
  const { data: stockData } = useItemStock()

  const stockMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stockData ?? []) {
      const current = map.get(s.item_id) ?? 0
      map.set(s.item_id, current + (s.quantity ?? 0))
    }
    return map
  }, [stockData])

  // Per-warehouse breakdown: item_id → [{code, name, quantity}] (only where qty > 0)
  const warehouseStockMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; quantity: number }[]>()
    for (const s of stockData ?? []) {
      if ((s.quantity ?? 0) <= 0) continue
      const wh = (s as any).warehouse as { name: string; code: string } | null
      if (!wh) continue
      const arr = map.get(s.item_id) ?? []
      arr.push({ code: wh.code, name: wh.name, quantity: s.quantity })
      map.set(s.item_id, arr)
    }
    return map
  }, [stockData])

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [alertFilter, setAlertFilter] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)

  // ── Alert counts ───────────────────────────────────────────────────────────
  const alertCounts = useMemo(() => {
    let sinStock = 0, critico = 0, bajo = 0
    for (const item of items) {
      const qty = stockMap.get(item.id) ?? 0
      const alert = getStockAlert(qty, item.min_stock, item.reorder_point)
      if (alert === 'sin_stock') sinStock++
      else if (alert === 'critico') critico++
      else if (alert === 'bajo') bajo++
    }
    return { sinStock, critico, bajo, total: sinStock + critico + bajo }
  }, [items, stockMap])

  // ── Client-side filtering ──────────────────────────────────────────────────
  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase()
    if (q && !item.sku.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) {
      return false
    }
    if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false
    if (currencyFilter !== 'all' && item.native_currency !== currencyFilter) return false
    if (activeFilter === 'active' && !item.is_active) return false
    if (activeFilter === 'inactive' && item.is_active) return false
    if (alertFilter) {
      const qty = stockMap.get(item.id) ?? 0
      if (!getStockAlert(qty, item.min_stock, item.reorder_point)) return false
    }
    return true
  })

  // ── Delete handler ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await softDelete.mutateAsync(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" eliminado`)
    } catch {
      toast.error('No se pudo eliminar el ítem')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Inventario"
        description="Catálogo de ítems y materiales"
        actions={
          <div className="flex items-center gap-2">
            {!isAlmacenista && (
              <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
                <Upload className="mr-1.5 size-3.5" />
                Importar CSV
              </Button>
            )}
            <Button size="sm" onClick={() => navigate(`${basePath}/inventario/nuevo`)}>
              <Plus className="mr-1.5 size-3.5" />
              Nuevo ítem
            </Button>
          </div>
        }
      />

      {/* ── Alert banner ─────────────────────────────────────────────────── */}
      {!isLoading && alertCounts.total > 0 && (
        <button
          type="button"
          onClick={() => setAlertFilter((v) => !v)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors w-full text-left ${
            alertFilter
              ? 'border-warning/30 bg-warning/15 text-warning'
              : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15'
          }`}
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">
            {alertCounts.total} {alertCounts.total === 1 ? 'artículo requiere' : 'artículos requieren'} atención
          </span>
          <span className="flex items-center gap-1.5 ml-1 text-xs">
            {alertCounts.sinStock > 0 && <span className="rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 font-medium">{alertCounts.sinStock} sin stock</span>}
            {alertCounts.critico > 0 && <span className="rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 font-medium">{alertCounts.critico} crítico</span>}
            {alertCounts.bajo > 0 && <span className="rounded-full bg-warning/10 text-warning px-1.5 py-0.5 font-medium">{alertCounts.bajo} bajo</span>}
          </span>
          <span className="ml-auto text-xs opacity-70">{alertFilter ? 'Ver todos' : 'Filtrar →'}</span>
        </button>
      )}

      {/* ── Filter row ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar SKU o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue>{categoryFilter === 'all' ? 'Todas las categorías' : (categories.find((c) => c.id === categoryFilter)?.name ?? categoryFilter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-1.5">
                  {cat.color && (
                    <span
                      className="inline-block size-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  {cat.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currencyFilter} onValueChange={(v) => setCurrencyFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue>{currencyFilter === 'all' ? 'Todas' : currencyFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="MXN">MXN</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue>{activeFilter === 'all' ? 'Todos' : activeFilter === 'active' ? 'Activos' : 'Inactivos'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Mobile cards ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex flex-col gap-2 md:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? null : (
        <div className="flex flex-col gap-2 md:hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(`${basePath}/inventario/${item.id}`)}
              className="rounded-xl border border-border bg-card p-3 active:bg-muted cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category?.name ?? '—'} · {item.unit?.code ?? ''}</p>
                </div>
                <CurrencyBadge currency={item.native_currency} size="sm" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">{item.sku}</span>
                <div className="flex flex-col items-end gap-1">
                  {(() => {
                    const qty = stockMap.get(item.id) ?? 0
                    const alert = getStockAlert(qty, item.min_stock, item.reorder_point)
                    return (
                      <div className="flex items-center gap-1">
                        <StockAlertBadge alert={alert} />
                        <span className={alert === 'sin_stock' || alert === 'critico' ? 'text-destructive font-medium' : alert === 'bajo' ? 'text-warning font-medium' : 'text-foreground'}>
                          {formatQuantity(qty)}
                        </span>
                      </div>
                    )
                  })()}
                  {(warehouseStockMap.get(item.id) ?? []).length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {(warehouseStockMap.get(item.id) ?? []).map((wh) => (
                        <span
                          key={wh.code}
                          title={wh.name}
                          className="inline-flex items-center rounded border border-border px-1 py-0 text-[10px] font-mono leading-4"
                        >
                          {wh.code}: {formatQuantity(wh.quantity)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-28">SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="w-20">Unidad</TableHead>
              <TableHead className="w-20">Moneda</TableHead>
              <TableHead className="w-24 text-right">Stock</TableHead>
              <TableHead className="w-28 text-right">Pto. reorden</TableHead>
              <TableHead className="w-24">Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <EmptyState
                    icon={<Package className="size-5" />}
                    title={search || categoryFilter !== 'all' || currencyFilter !== 'all' ? 'Sin resultados' : 'Sin ítems aún'}
                    description={
                      search || categoryFilter !== 'all' || currencyFilter !== 'all'
                        ? 'Prueba con otros filtros o términos de búsqueda.'
                        : 'Crea tu primer ítem para comenzar el catálogo de inventario.'
                    }
                    action={
                      !search && categoryFilter === 'all' && currencyFilter === 'all'
                        ? { label: '+ Nuevo ítem', onClick: () => navigate(`${basePath}/inventario/nuevo`) }
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`${basePath}/inventario/${item.id}`)}
                >
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{item.name}</TableCell>
                  <TableCell>
                    {item.category ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        {item.category.color && (
                          <span
                            className="inline-block size-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.category.color }}
                          />
                        )}
                        {item.category.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {item.unit?.code ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CurrencyBadge currency={item.native_currency} size="sm" />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {(() => {
                      const qty = stockMap.get(item.id) ?? 0
                      const alert = getStockAlert(qty, item.min_stock, item.reorder_point)
                      const whs = warehouseStockMap.get(item.id) ?? []
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <StockAlertBadge alert={alert} />
                            <span className={alert === 'sin_stock' || alert === 'critico' ? 'text-destructive font-medium' : alert === 'bajo' ? 'text-warning font-medium' : ''}>
                              {formatQuantity(qty)}
                            </span>
                          </div>
                          {whs.length > 0 && (
                            <div className="flex flex-wrap justify-end gap-1">
                              {whs.map((wh) => (
                                <span
                                  key={wh.code}
                                  title={wh.name}
                                  className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-0 text-[10px] text-muted-foreground font-mono leading-4"
                                >
                                  {wh.code}: {formatQuantity(wh.quantity)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {item.reorder_point != null ? item.reorder_point : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.is_active ? 'default' : 'secondary'}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {item.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" className="size-7" />}
                      >
                        <MoreHorizontal className="size-3.5" />
                        <span className="sr-only">Acciones</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => navigate(`${basePath}/inventario/${item.id}`)}>
                          <Eye className="mr-2 size-3.5" />
                          Ver detalle
                        </DropdownMenuItem>
                        {!isAlmacenista && (
                          <>
                            <DropdownMenuItem onClick={() => navigate(`${basePath}/inventario/${item.id}/editar`)}>
                              <Pencil className="mr-2 size-3.5" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── CSV import dialog ────────────────────────────────────────────── */}
      <ItemsCsvImport open={csvOpen} onOpenChange={setCsvOpen} />

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> ({deleteTarget?.sku}). Esta acción no se puede deshacer.
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

export default ItemsPage
