import { useNavigate } from 'react-router-dom'
import { Layers, MapPin, Leaf } from 'lucide-react'

import { useCropLots } from '@/hooks/use-supabase-query'
import type { CropLot } from '@/lib/database.types'
import { formatMoney } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={STATUS_VARIANT[status] ?? 'secondary'}
      className="text-[10px] h-4 px-1.5"
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="h-1.5 w-full" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-20 rounded-full" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center justify-between pt-1 border-t">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({ lot, onClick }: { lot: CropLot; onClick: () => void }) {
  const stripeColor = lot.color ?? '#94a3b8'

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md group"
      onClick={onClick}
    >
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ backgroundColor: stripeColor }} />

      <CardContent className="p-4 flex flex-col gap-3">
        {/* Code + Name */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            {lot.code}
          </span>
          <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {lot.name}
          </span>
        </div>

        {/* Crop type badge */}
        <Badge variant="outline" className="w-fit text-[10px] h-4 px-1.5 gap-1">
          <Leaf className="size-2.5" />
          {lot.crop_type}
        </Badge>

        {/* Hectares */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span>{lot.hectares} ha</span>
        </div>

        {/* Total cost + status */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex flex-col gap-0">
            <span className="text-[10px] text-muted-foreground">Total consumido</span>
            <span className="text-xs font-mono font-medium tabular-nums">
              {formatMoney(0, 'MXN')}
            </span>
          </div>
          <StatusBadge status={lot.status} />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LotesPage() {
  const navigate = useNavigate()
  const { data: _lots = [], isLoading } = useCropLots()
  const lots = _lots as CropLot[]

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Lotes de Cultivo"
        description="Centros de costo por lote"
      />

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : lots.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="Sin lotes registrados"
          description="Los lotes de cultivo aparecerán aquí cuando los configures en el catálogo."
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              onClick={() => navigate(`/admin/lotes/${lot.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default LotesPage
