import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { EmptyState } from '@/components/custom/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useSupplierInvoices } from '@/features/compras/hooks'
import type { InvoiceStatus } from '@/lib/database.types'

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: 'Pendiente',
  reconciled: 'Conciliada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  discrepancy: 'Discrepancia',
}

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  reconciled: 'secondary',
  paid: 'default',
  cancelled: 'outline',
  discrepancy: 'destructive',
}

export function FacturasTab() {
  const { data: rows = [], isLoading } = useSupplierInvoices()

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
        title="Sin facturas registradas"
        description="Carga la factura CFDI XML/PDF del proveedor para iniciar la conciliación contra la orden de compra."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
      {rows.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-card">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">{inv.invoice_folio}</span>
              <Badge variant={STATUS_VARIANT[inv.status]} className="text-[10px]">
                {STATUS_LABEL[inv.status]}
              </Badge>
              {inv.cfdi_uuid && (
                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">
                  CFDI {inv.cfdi_uuid.slice(0, 8)}…
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground truncate">
              {format(new Date(inv.issue_date), 'd MMM yyyy', { locale: es })}
              {inv.due_date && ` · vence ${format(new Date(inv.due_date), 'd MMM', { locale: es })}`}
            </div>
          </div>
          {inv.total != null && (
            <div className="text-right shrink-0">
              <div className="text-sm font-medium tabular-nums">
                ${inv.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-muted-foreground">{inv.currency}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
