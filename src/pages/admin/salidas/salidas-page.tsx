import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  ArrowUpFromLine,
} from 'lucide-react'
import { toast } from 'sonner'

import { useList } from '@/hooks/use-supabase-query'
import type { StockMovement } from '@/lib/database.types'
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatFechaCorta, formatMoney } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type MovementLine = {
  destination_type: string | null
  crop_lot?: { name: string; code: string } | null
  equipment?: { name: string; code: string } | null
  employee?: { full_name: string; employee_code: string } | null
}

type MovementWithWarehouse = StockMovement & {
  warehouse?: { id: string; name: string; code: string }
  lines?: MovementLine[]
}

const EXIT_TYPES = [
  'exit_consumption',
  'exit_transfer',
  'exit_adjustment',
  'exit_waste',
  'exit_sale',
] as const

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  posted: 'Registrado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  posted: 'default',
  cancelled: 'destructive',
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SalidasPage() {
  const navigate = useNavigate()

  const { data: movements = [], isLoading } = useList<MovementWithWarehouse>(
    'stock_movements',
    {
      select: '*, warehouse:warehouses(*), lines:stock_movement_lines(destination_type, crop_lot:crops_lots(name, code), equipment:equipment(name, code), employee:employees(full_name, employee_code))',
      orderBy: 'created_at',
      ascending: false,
    }
  )

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Filter to exit types only then apply UI filters
  const filtered = movements
    .filter((m) => EXIT_TYPES.includes(m.movement_type as typeof EXIT_TYPES[number]))
    .filter((m) => {
      const q = search.trim().toLowerCase()
      if (
        q &&
        !m.document_number?.toLowerCase().includes(q) &&
        !m.reference_external?.toLowerCase().includes(q) &&
        !m.warehouse?.name.toLowerCase().includes(q)
      ) {
        return false
      }
      if (typeFilter !== 'all' && m.movement_type !== typeFilter) return false
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      return true
    })

  function handleCopy(docNumber: string | null) {
    if (!docNumber) return
    navigator.clipboard.writeText(docNumber).then(() => {
      toast.success('Folio copiado')
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Salidas"
        description="Registro de salidas del almacén"
        actions={
          <Button size="sm" onClick={() => navigate('/admin/salidas/nueva')}>
            <Plus className="mr-1.5 size-3.5" />
            Nueva salida
          </Button>
        }
      />

      {/* ── Filter row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio, referencia o almacén…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Tipo de salida" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {EXIT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="posted">Registrado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
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
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? null : (
        <div className="flex flex-col gap-2 md:hidden">
          {filtered.map((movement) => (
            <div
              key={movement.id}
              onClick={() => navigate(`/admin/salidas/${movement.id}`)}
              className="rounded-xl border border-border bg-card p-3 active:bg-muted cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono font-medium truncate">
                    {movement.document_number ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {movement.warehouse?.name ?? '—'}
                    {movement.lines?.[0] && (
                      <> · <DestinationCell movement={movement} /></>
                    )}
                  </p>
                </div>
                <span className="text-xs shrink-0 text-muted-foreground">
                  {MOVEMENT_TYPE_LABELS[movement.movement_type] ?? movement.movement_type}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <Badge
                  variant={STATUS_VARIANT[movement.status] ?? 'outline'}
                  className="text-[10px] h-4 px-1.5"
                >
                  {STATUS_LABELS[movement.status] ?? movement.status}
                </Badge>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono font-medium text-foreground">
                    {movement.total_mxn != null ? formatMoney(movement.total_mxn, 'MXN') : '—'}
                  </span>
                  <span className="text-muted-foreground">{formatFechaCorta(movement.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
              <TableHead className="w-32">Folio</TableHead>
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead className="w-36">Tipo</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="w-32 text-right">Total MXN</TableHead>
              <TableHead className="w-28">Estado</TableHead>
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
                    icon={<ArrowUpFromLine className="size-5" />}
                    title={
                      search || typeFilter !== 'all' || statusFilter !== 'all'
                        ? 'Sin resultados'
                        : 'Sin salidas aún'
                    }
                    description={
                      search || typeFilter !== 'all' || statusFilter !== 'all'
                        ? 'Prueba con otros filtros o términos de búsqueda.'
                        : 'Registra la primera salida del almacén para empezar.'
                    }
                    action={
                      !search && typeFilter === 'all' && statusFilter === 'all'
                        ? {
                            label: '+ Nueva salida',
                            onClick: () => navigate('/admin/salidas/nueva'),
                          }
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((movement) => (
                <TableRow
                  key={movement.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/admin/salidas/${movement.id}`)}
                >
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {movement.document_number ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatFechaCorta(movement.created_at)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {MOVEMENT_TYPE_LABELS[movement.movement_type] ?? movement.movement_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {movement.warehouse?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {/* destination_type comes from first line — shown as badge */}
                    <DestinationCell movement={movement} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-mono">
                    {movement.total_mxn != null
                      ? formatMoney(movement.total_mxn, 'MXN')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[movement.status] ?? 'outline'}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {STATUS_LABELS[movement.status] ?? movement.status}
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
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => navigate(`/admin/salidas/${movement.id}`)}
                        >
                          <Eye className="mr-2 size-3.5" />
                          Ver detalle
                        </DropdownMenuItem>
                        {movement.document_number && (
                          <DropdownMenuItem
                            onClick={() => handleCopy(movement.document_number)}
                          >
                            Copiar folio
                          </DropdownMenuItem>
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

      {/* ── Summary footer ─────────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} {filtered.length === 1 ? 'salida' : 'salidas'}
          {filtered.some((m) => m.total_mxn != null) && (
            <>
              {' · '}
              Total:{' '}
              <span className="font-mono font-medium">
                {formatMoney(
                  filtered.reduce((sum, m) => sum + (m.total_mxn ?? 0), 0),
                  'MXN'
                )}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  )
}

// ─── Destination cell helper ──────────────────────────────────────────────────

function DestinationCell({ movement }: { movement: MovementWithWarehouse }) {
  const line = movement.lines?.[0]

  if (!line) return <span className="text-xs text-muted-foreground">—</span>

  const destType = line.destination_type

  if (destType === 'crop_lot' && line.crop_lot) {
    return <span className="text-sm">{line.crop_lot.name}</span>
  }
  if (destType === 'equipment' && line.equipment) {
    return <span className="text-sm">{line.equipment.name}</span>
  }
  if (destType === 'employee' && line.employee) {
    return <span className="text-sm">{line.employee.full_name}</span>
  }
  if (destType === 'maintenance') {
    return <span className="text-sm text-muted-foreground">Mantenimiento</span>
  }
  if (destType === 'waste') {
    return <span className="text-sm text-muted-foreground">Merma</span>
  }
  if (destType === 'other') {
    return <span className="text-sm text-muted-foreground">Otro</span>
  }

  return <span className="text-xs text-muted-foreground">—</span>
}

export default SalidasPage
