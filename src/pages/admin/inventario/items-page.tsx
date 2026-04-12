import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Package } from 'lucide-react'
import { toast } from 'sonner'

import { useItems, useCategories, useSoftDelete } from '@/hooks/use-supabase-query'
import type { Item } from '@/lib/database.types'

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

  const { data: items = [], isLoading } = useItems()
  const { data: categories = [] } = useCategories()
  const softDelete = useSoftDelete('items')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)

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
          <Button size="sm" onClick={() => navigate('/admin/inventario/nuevo')}>
            <Plus className="mr-1.5 size-3.5" />
            Nuevo ítem
          </Button>
        }
      />

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
            <SelectValue placeholder="Categoría" />
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
            <SelectValue placeholder="Moneda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="MXN">MXN</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-28">SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="w-20">Unidad</TableHead>
              <TableHead className="w-20">Moneda</TableHead>
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
                <TableCell colSpan={8} className="p-0">
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
                        ? { label: '+ Nuevo ítem', onClick: () => navigate('/admin/inventario/nuevo') }
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
                  onClick={() => navigate(`/admin/inventario/${item.id}`)}
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
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="icon" className="size-7">
                          <MoreHorizontal className="size-3.5" />
                          <span className="sr-only">Acciones</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => navigate(`/admin/inventario/${item.id}`)}>
                          <Eye className="mr-2 size-3.5" />
                          Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/admin/inventario/${item.id}/editar`)}>
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
