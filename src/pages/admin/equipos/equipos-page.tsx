import { useNavigate } from 'react-router-dom'
import { Truck, Wrench, Car, Droplets, Settings2 } from 'lucide-react'

import { useEquipment } from '@/hooks/use-supabase-query'
import type { Equipment, EquipmentType } from '@/lib/database.types'
import { formatQuantity } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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

// ─── Skeleton card ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-4 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-28" />
      <div className="flex items-center gap-4 pt-1 border-t">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  )
}

// ─── Equipment card ───────────────────────────────────────────────────────────

function EquipoCard({
  equipo,
  onClick,
}: {
  equipo: Equipment
  onClick: () => void
}) {
  const type = (equipo.type ?? 'other') as EquipmentType
  const icon = EQUIP_TYPE_ICON[type] ?? EQUIP_TYPE_ICON.other
  const label = EQUIP_TYPE_LABEL[type] ?? equipo.type

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md group"
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Code + Name + type badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              {equipo.code}
            </span>
            <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {equipo.name}
            </span>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] h-4 px-1.5 gap-1">
            {icon}
            {label}
          </Badge>
        </div>

        {/* Brand + model */}
        <div className="text-xs text-muted-foreground">
          {[equipo.brand, equipo.model].filter(Boolean).join(' · ') || '—'}
          {equipo.year ? ` (${equipo.year})` : ''}
        </div>

        {/* Hours / km */}
        <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          {equipo.current_hours != null && (
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {formatQuantity(equipo.current_hours, 0)}
              </span>{' '}
              h
            </span>
          )}
          {equipo.current_km != null && (
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {formatQuantity(equipo.current_km, 0)}
              </span>{' '}
              km
            </span>
          )}
          {equipo.current_hours == null && equipo.current_km == null && (
            <span>Sin horómetro</span>
          )}
        </div>

        {/* Diesel this month (placeholder) */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Droplets className="size-3 shrink-0" />
          <span>Diésel este mes: </span>
          <span className="font-mono font-medium text-foreground">— L</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EquiposPage() {
  const navigate = useNavigate()
  const { data: equipos = [], isLoading } = useEquipment()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Equipos y Tractores"
        description="Maquinaria agrícola y vehículos"
      />

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : equipos.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-5" />}
          title="Sin equipos registrados"
          description="Los equipos y tractores aparecerán aquí cuando los configures en el catálogo."
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {equipos.map((eq) => (
            <EquipoCard
              key={eq.id}
              equipo={eq as Equipment}
              onClick={() => navigate(`/admin/equipos/${eq.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default EquiposPage
