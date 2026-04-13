import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Layers, MapPin, Leaf, DollarSign, BarChart3, Calendar } from 'lucide-react'

import { useRecord } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import type { CropLot, StockMovementLine } from '@/lib/database.types'
import { formatMoney, formatQuantity, formatFechaCorta } from '@/lib/utils'

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

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type ConsumoLine = StockMovementLine & {
  movement: { created_at: string; document_number: string | null }
  item: { sku: string; name: string; is_diesel: boolean }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  planning: 'Planeación',
  harvested: 'Cosechado',
  closed: 'Cerrado',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  planning: 'secondary',
  harvested: 'outline',
  closed: 'secondary',
}

// ─── Info row helper ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">
        {value ?? <span className="text-muted-foreground font-normal">—</span>}
      </span>
    </div>
  )
}

// ─── Stat card helper ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold">{value}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Consumos tab ─────────────────────────────────────────────────────────────

function ConsumosTab({ lotId }: { lotId: string }) {
  const { data: lines = [], isLoading } = useQuery<ConsumoLine[]>({
    queryKey: ['consumos', lotId],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movement_lines')
        .select('*, movement:stock_movements(*), item:items(*)')
        .eq('crop_lot_id', lotId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ConsumoLine[]
    },
    enabled: !!lotId,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="size-5" />}
        title="Sin consumos registrados"
        description="Los consumos aparecerán cuando registres salidas asignadas a este lote."
      />
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead className="w-28">SKU</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="w-28 text-right">Cantidad</TableHead>
            <TableHead className="w-20">Unidad</TableHead>
            <TableHead className="w-36 text-right">Costo MXN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {line.movement?.created_at
                  ? formatFechaCorta(line.movement.created_at)
                  : '—'}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {line.item?.sku ?? '—'}
                </span>
              </TableCell>
              <TableCell className="text-sm font-medium">
                {line.item?.name ?? '—'}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatQuantity(line.quantity)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground uppercase">
                {line.item?.is_diesel ? 'L' : '—'}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-mono">
                {formatMoney(line.line_total_mxn ?? 0, 'MXN')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: lot, isLoading } = useRecord<CropLot>('crops_lots', id)

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (!lot) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1"
          onClick={() => navigate('/admin/lotes')}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Lotes
        </Button>
        <EmptyState
          icon={<Layers className="size-5" />}
          title="Lote no encontrado"
          description="El lote que buscas no existe o fue eliminado."
          action={{ label: 'Volver a Lotes', onClick: () => navigate('/admin/lotes') }}
        />
      </div>
    )
  }

  const stripeColor = lot.color ?? '#94a3b8'

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1 text-muted-foreground"
          onClick={() => navigate('/admin/lotes')}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Lotes
        </Button>

        <div className="flex items-start gap-3">
          {/* Color dot */}
          <span
            className="mt-1.5 inline-block size-3 rounded-full shrink-0 ring-2 ring-border"
            style={{ backgroundColor: stripeColor }}
          />

          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {lot.name}
              </h1>
              <Badge
                variant={STATUS_VARIANT[lot.status] ?? 'secondary'}
                className="text-[10px] h-4 px-1.5"
              >
                {STATUS_LABEL[lot.status] ?? lot.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground">{lot.code}</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                <Leaf className="size-2.5" />
                {lot.crop_type}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {lot.hectares} ha
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="resumen">
        <TabsList className="h-8">
          <TabsTrigger value="resumen" className="text-xs">Resumen</TabsTrigger>
          <TabsTrigger value="consumos" className="text-xs">Consumos</TabsTrigger>
          <TabsTrigger value="costo-ha" className="text-xs">Costo por hectárea</TabsTrigger>
        </TabsList>

        {/* ── Resumen ──────────────────────────────────────────────────────── */}
        <TabsContent value="resumen" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<DollarSign className="size-4" />}
              label="Total consumido"
              value={<span className="font-mono tabular-nums">{formatMoney(0, 'MXN')}</span>}
            />
            <StatCard
              icon={<BarChart3 className="size-4" />}
              label="Costo por hectárea"
              value={<span className="font-mono tabular-nums">{formatMoney(0, 'MXN')}</span>}
            />
            <StatCard
              icon={<Calendar className="size-4" />}
              label="Fecha de siembra"
              value={lot.planting_date ? formatFechaCorta(lot.planting_date) : '—'}
            />
            <StatCard
              icon={<Calendar className="size-4" />}
              label="Cosecha esperada"
              value={
                lot.expected_harvest_date ? formatFechaCorta(lot.expected_harvest_date) : '—'
              }
            />
          </div>

          <div className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Información del lote
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  <InfoRow label="Código" value={<span className="font-mono">{lot.code}</span>} />
                  <InfoRow label="Nombre" value={lot.name} />
                  <InfoRow label="Cultivo" value={lot.crop_type} />
                  <InfoRow label="Hectáreas" value={`${formatQuantity(lot.hectares, 2)} ha`} />
                  <InfoRow
                    label="Estado"
                    value={
                      <Badge
                        variant={STATUS_VARIANT[lot.status] ?? 'secondary'}
                        className="text-[10px] h-4 px-1.5"
                      >
                        {STATUS_LABEL[lot.status] ?? lot.status}
                      </Badge>
                    }
                  />
                  <InfoRow
                    label="Fecha siembra"
                    value={lot.planting_date ? formatFechaCorta(lot.planting_date) : undefined}
                  />
                  <InfoRow
                    label="Cosecha esperada"
                    value={
                      lot.expected_harvest_date
                        ? formatFechaCorta(lot.expected_harvest_date)
                        : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Consumos ─────────────────────────────────────────────────────── */}
        <TabsContent value="consumos" className="mt-4">
          <ConsumosTab lotId={lot.id} />
        </TabsContent>

        {/* ── Costo por hectárea ────────────────────────────────────────────── */}
        <TabsContent value="costo-ha" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Costo por hectárea
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  <InfoRow label="Total consumido" value={<span className="font-mono tabular-nums">{formatMoney(0, 'MXN')}</span>} />
                  <InfoRow label="Hectáreas" value={`${formatQuantity(lot.hectares, 2)} ha`} />
                  <InfoRow
                    label="Costo / ha"
                    value={
                      <span className="font-mono tabular-nums font-semibold">
                        {formatMoney(0, 'MXN')}
                      </span>
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex items-center justify-center">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <BarChart3 className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Gráfica de evolución de costo próximamente
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default LoteDetailPage
