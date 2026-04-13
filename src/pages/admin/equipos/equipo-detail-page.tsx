import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Truck,
  Wrench,
  Car,
  Droplets,
  Settings2,
  Gauge,
  Calendar,
  Tag,
} from 'lucide-react'

import { useRecord } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import type { Equipment, EquipmentType, StockMovementLine } from '@/lib/database.types'
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

type MovLine = StockMovementLine & {
  movement: {
    created_at: string
    document_number: string | null
    operator_employee_id?: string | null
  }
  item: {
    sku: string
    name: string
    is_diesel: boolean
    unit?: { code: string } | null
  }
}

// ─── Equipment type config ────────────────────────────────────────────────────

const EQUIP_TYPE_LABEL: Record<EquipmentType | 'other', string> = {
  tractor: 'Tractor',
  implement: 'Implemento',
  vehicle: 'Vehículo',
  pump: 'Bomba',
  other: 'Otro',
}

const EQUIP_TYPE_ICON: Record<EquipmentType | 'other', React.ReactNode> = {
  tractor: <Truck className="size-3.5" />,
  implement: <Wrench className="size-3.5" />,
  vehicle: <Car className="size-3.5" />,
  pump: <Droplets className="size-3.5" />,
  other: <Settings2 className="size-3.5" />,
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

// ─── Equipment movement lines hook ───────────────────────────────────────────

function useEquipmentLines(equipmentId: string | undefined, dieselOnly: boolean) {
  return useQuery<MovLine[]>({
    queryKey: ['equipo-lines', equipmentId, dieselOnly],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movement_lines')
        .select('*, movement:stock_movements(*), item:items(*, unit:units(*))')
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data as MovLine[]
      return dieselOnly
        ? rows.filter((r) => r.item?.is_diesel)
        : rows.filter((r) => !r.item?.is_diesel)
    },
    enabled: !!equipmentId,
  })
}

// ─── Diesel tab ───────────────────────────────────────────────────────────────

function DieselTab({ equipmentId }: { equipmentId: string }) {
  const { data: lines = [], isLoading } = useEquipmentLines(equipmentId, true)

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
        icon={<Droplets className="size-5" />}
        title="Sin cargas de diésel"
        description="Las cargas de diésel aparecerán cuando registres salidas de combustible para este equipo."
      />
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead className="w-32">Doc.</TableHead>
            <TableHead className="w-28 text-right">Litros</TableHead>
            <TableHead className="w-32 text-right">Horómetro</TableHead>
            <TableHead className="w-28 text-right">Rend. L/h</TableHead>
            <TableHead className="w-36 text-right">Costo MXN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const liters = line.diesel_liters ?? line.quantity
            const hoursAfter = line.equipment_hours_after
            const hoursBefore = line.equipment_hours_before
            const deltaH =
              hoursAfter != null && hoursBefore != null
                ? hoursAfter - hoursBefore
                : null
            const rendimiento =
              deltaH != null && deltaH > 0 ? liters / deltaH : null

            return (
              <TableRow key={line.id}>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {line.movement?.created_at
                    ? formatFechaCorta(line.movement.created_at)
                    : '—'}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {line.movement?.document_number ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-mono">
                  {formatQuantity(liters, 2)} L
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {hoursAfter != null ? `${formatQuantity(hoursAfter, 1)} h` : '—'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {rendimiento != null
                    ? `${formatQuantity(rendimiento, 2)} L/h`
                    : '—'}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums font-mono">
                  {formatMoney(line.line_total_mxn ?? 0, 'MXN')}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Refacciones tab ──────────────────────────────────────────────────────────

function RefaccionesTab({ equipmentId }: { equipmentId: string }) {
  const { data: lines = [], isLoading } = useEquipmentLines(equipmentId, false)

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
        icon={<Wrench className="size-5" />}
        title="Sin consumos de refacciones"
        description="Las refacciones y materiales aparecerán cuando registres salidas para este equipo."
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
                {line.item?.unit?.code ?? '—'}
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

export function EquipoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: equipo, isLoading } = useRecord<Equipment>('equipment', id)

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-20 rounded" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (!equipo) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1"
          onClick={() => navigate('/admin/equipos')}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Equipos
        </Button>
        <EmptyState
          icon={<Truck className="size-5" />}
          title="Equipo no encontrado"
          description="El equipo que buscas no existe o fue eliminado."
          action={{ label: 'Volver a Equipos', onClick: () => navigate('/admin/equipos') }}
        />
      </div>
    )
  }

  const type = (equipo.type ?? 'other') as EquipmentType
  const typeIcon = EQUIP_TYPE_ICON[type] ?? EQUIP_TYPE_ICON.other
  const typeLabel = EQUIP_TYPE_LABEL[type] ?? equipo.type

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1 text-muted-foreground"
          onClick={() => navigate('/admin/equipos')}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Equipos
        </Button>

        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {typeIcon}
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {equipo.name}
              </h1>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                {typeIcon}
                {typeLabel}
              </Badge>
              {!equipo.is_active && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  Inactivo
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              <span className="font-mono">{equipo.code}</span>
              {(equipo.brand || equipo.model) && (
                <span>
                  {[equipo.brand, equipo.model].filter(Boolean).join(' ')}
                  {equipo.year ? ` · ${equipo.year}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="general">
        <TabsList className="h-8">
          <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
          <TabsTrigger value="diesel" className="text-xs">Diésel</TabsTrigger>
          <TabsTrigger value="refacciones" className="text-xs">Refacciones</TabsTrigger>
        </TabsList>

        {/* ── General ──────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Información del equipo
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  <InfoRow label="Código" value={<span className="font-mono">{equipo.code}</span>} />
                  <InfoRow label="Nombre" value={equipo.name} />
                  <InfoRow
                    label="Tipo"
                    value={
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                        {typeIcon}
                        {typeLabel}
                      </Badge>
                    }
                  />
                  <InfoRow label="Marca" value={equipo.brand ?? undefined} />
                  <InfoRow label="Modelo" value={equipo.model ?? undefined} />
                  <InfoRow
                    label="Año"
                    value={
                      equipo.year ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {equipo.year}
                        </span>
                      ) : undefined
                    }
                  />
                  <InfoRow
                    label="Placas"
                    value={
                      equipo.plate ? (
                        <span className="flex items-center gap-1 font-mono">
                          <Tag className="size-3" />
                          {equipo.plate}
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Horómetro y odómetro
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  <InfoRow
                    label="Horas actuales"
                    value={
                      equipo.current_hours != null ? (
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          <Gauge className="size-3" />
                          {formatQuantity(equipo.current_hours, 1)} h
                        </span>
                      ) : undefined
                    }
                  />
                  <InfoRow
                    label="Kilómetros actuales"
                    value={
                      equipo.current_km != null ? (
                        <span className="font-mono tabular-nums">
                          {formatQuantity(equipo.current_km, 0)} km
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Diésel ───────────────────────────────────────────────────────── */}
        <TabsContent value="diesel" className="mt-4">
          <DieselTab equipmentId={equipo.id} />
        </TabsContent>

        {/* ── Refacciones ──────────────────────────────────────────────────── */}
        <TabsContent value="refacciones" className="mt-4">
          <RefaccionesTab equipmentId={equipo.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default EquipoDetailPage
