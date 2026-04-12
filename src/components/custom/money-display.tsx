import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/utils"

interface MoneyDisplayProps {
  amount: number
  currency: 'MXN' | 'USD'
  fxRate?: number
  showBoth?: boolean
  className?: string
}

export function MoneyDisplay({
  amount,
  currency,
  fxRate,
  showBoth = false,
  className,
}: MoneyDisplayProps) {
  const primaryFormatted = formatMoney(amount, currency)

  const convertedCurrency = currency === 'MXN' ? 'USD' : 'MXN'
  const convertedAmount =
    showBoth && fxRate != null
      ? currency === 'MXN'
        ? amount / fxRate
        : amount * fxRate
      : null

  return (
    <div className={cn("flex flex-col items-end", className)}>
      <span className="font-mono tabular-nums text-sm font-medium leading-tight">
        {primaryFormatted}
      </span>
      {convertedAmount != null && (
        <span className="font-mono tabular-nums text-xs text-muted-foreground leading-tight">
          {formatMoney(convertedAmount, convertedCurrency)}
        </span>
      )}
    </div>
  )
}
