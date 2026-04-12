import { cn } from "@/lib/utils"

interface CurrencyBadgeProps {
  currency: 'MXN' | 'USD'
  size?: 'sm' | 'md'
  className?: string
}

export function CurrencyBadge({ currency, size = 'md', className }: CurrencyBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums tracking-wide",
        currency === 'MXN'
          ? "bg-mxn text-mxn-foreground"
          : "bg-usd text-usd-foreground",
        size === 'sm'
          ? "h-4 px-1.5 text-[10px]"
          : "h-5 px-2 text-xs",
        className
      )}
    >
      {currency}
    </span>
  )
}
