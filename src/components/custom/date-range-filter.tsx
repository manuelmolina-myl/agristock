import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DateRangeFilterProps {
  /** Label shown above the inputs — purely cosmetic. */
  label?: string
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  className?: string
}

/**
 * Two date inputs side-by-side ("Desde" / "Hasta") used to filter list pages.
 * Stateless on purpose — caller owns the values and the persistence layer
 * (typically `useSearchParams`).
 */
export function DateRangeFilter({
  label,
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: DateRangeFilterProps) {
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label="Desde"
          className="h-9 text-sm"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">a</span>
        <Input
          type="date"
          aria-label="Hasta"
          className="h-9 text-sm"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>
    </div>
  )
}
