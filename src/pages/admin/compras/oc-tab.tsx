import { useState } from 'react'
import { Search, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { EmptyState } from '@/components/custom/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePurchaseOrders } from '@/features/compras/hooks'
import type { POStatus } from '@/lib/database.types'

const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Borrador',
  pending_signature: 'Pendiente de firma',
  sent: 'Firmada',
  confirmed: 'Confirmada',
  partially_received: 'Recepción parcial',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
}

const PO_STATUS_VARIANT: Record<POStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  pending_signature: 'secondary',
  sent: 'secondary',
  confirmed: 'secondary',
  partially_received: 'secondary',
  received: 'default',
  closed: 'default',
  cancelled: 'destructive',
}

interface Props {
  onOpenDetail: (id: string) => void
}

export function OcTab({ onOpenDetail }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<POStatus | 'all'>('all')
  const { data: rows = [], isLoading } = usePurchaseOrders({
    search: search.trim() || undefined,
    status,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as POStatus | 'all')}>
          <SelectTrigger className="h-9 sm:w-52">
            <SelectValue placeholder="Estatus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="partially_received">Recepción parcial</SelectItem>
            <SelectItem value="received">Recibida</SelectItem>
            <SelectItem value="closed">Cerrada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin órdenes de compra"
          description="Las OCs aprobadas aparecerán aquí. Genera una desde una requisición aprobada."
        />
      ) : (
        <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
          {rows.map((po) => (
            <button
              key={po.id}
              type="button"
              onClick={() => onOpenDetail(po.id)}
              className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{po.folio}</span>
                  <Badge variant={PO_STATUS_VARIANT[po.status]} className="text-[10px]">
                    {PO_STATUS_LABEL[po.status]}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground truncate">
                  {po.supplier?.name ?? '—'} · emisión {format(new Date(po.issue_date), 'd MMM', { locale: es })}
                  {po.warehouse?.name && ` · destino ${po.warehouse.name}`}
                </div>
              </div>

              {po.total_mxn != null && (
                <div className="hidden sm:block text-right shrink-0">
                  <div className="text-sm font-medium tabular-nums">
                    ${po.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">MXN incl. IVA</div>
                </div>
              )}

              <ArrowRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
