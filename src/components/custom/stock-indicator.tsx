import { cn } from "@/lib/utils"

interface StockIndicatorProps {
  quantity: number
  minStock?: number | null
  maxStock?: number | null
  reorderPoint?: number | null
  showLabel?: boolean
  className?: string
}

type StockLevel = 'empty' | 'low' | 'minimum' | 'ok'

function getStockLevel(
  quantity: number,
  minStock?: number | null,
  reorderPoint?: number | null
): StockLevel {
  if (quantity <= 0) return 'empty'
  if (reorderPoint != null && quantity <= reorderPoint) return 'low'
  if (minStock != null && quantity <= minStock) return 'minimum'
  return 'ok'
}

const levelConfig: Record<StockLevel, { label: string; bar: string; dot: string }> = {
  empty:   { label: 'Sin stock', bar: 'bg-destructive',          dot: 'bg-destructive' },
  low:     { label: 'Bajo',      bar: 'bg-warning',              dot: 'bg-warning' },
  minimum: { label: 'Mínimo',    bar: 'bg-yellow-400 dark:bg-yellow-500', dot: 'bg-yellow-400 dark:bg-yellow-500' },
  ok:      { label: 'OK',        bar: 'bg-success',              dot: 'bg-success' },
}

export function StockIndicator({
  quantity,
  minStock,
  maxStock,
  reorderPoint,
  showLabel = true,
  className,
}: StockIndicatorProps) {
  const level = getStockLevel(quantity, minStock, reorderPoint)
  const config = levelConfig[level]

  const fillPercent =
    maxStock != null && maxStock > 0
      ? Math.min((quantity / maxStock) * 100, 100)
      : quantity > 0
        ? 100
        : 0

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", config.bar)}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center gap-1">
          <span className={cn("size-1.5 rounded-full shrink-0", config.dot)} />
          <span className="text-xs text-muted-foreground leading-none">
            {config.label}
          </span>
        </div>
      )}
    </div>
  )
}
