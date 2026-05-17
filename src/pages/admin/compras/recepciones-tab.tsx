import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { EmptyState } from '@/components/custom/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useReceptions } from '@/features/compras/hooks'
import type { Reception, ReceptionStatus } from '@/lib/database.types'

const STATUS_LABEL: Record<ReceptionStatus, string> = {
  draft: 'Borrador',
  accepted: 'Aceptada',
  rejected_partial: 'Rechazo parcial',
  rejected: 'Rechazada',
}

const STATUS_VARIANT: Record<ReceptionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  accepted: 'default',
  rejected_partial: 'secondary',
  rejected: 'destructive',
}

interface ReceptionWithRelations extends Reception {
  po?: { folio: string; supplier?: { name: string } | null } | null
  warehouse?: { name: string } | null
}

export function RecepcionesTab() {
  const { data: rows = [], isLoading } = useReceptions()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sin recepciones aún"
        description="Cuando recibas material de una orden de compra, las recepciones aparecerán aquí."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
      {(rows as ReceptionWithRelations[]).map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 bg-card">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">{r.folio}</span>
              <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                {STATUS_LABEL[r.status]}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground truncate">
              {r.po?.folio ? `OC ${r.po.folio}` : '—'}
              {r.po?.supplier?.name && ` · ${r.po.supplier.name}`}
              {r.warehouse?.name && ` · ${r.warehouse.name}`}
              {' · '}{format(new Date(r.reception_date), 'd MMM yyyy', { locale: es })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
