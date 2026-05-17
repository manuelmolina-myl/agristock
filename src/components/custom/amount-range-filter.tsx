import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AmountRangeFilterProps {
  label?: string
  min: string
  max: string
  onMinChange: (value: string) => void
  onMaxChange: (value: string) => void
  /** Placeholder hint shown inside the inputs — e.g. "MXN". */
  placeholder?: string
  className?: string
}

/**
 * Min / Max numeric inputs for filtering monetary ranges. Stateless — the
 * caller decides where the values live (typically `useSearchParams`).
 */
export function AmountRangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  placeholder,
  className,
}: AmountRangeFilterProps) {
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-label="Mínimo"
          placeholder={placeholder ? `mín ${placeholder}` : 'mín'}
          className="h-9 text-sm text-right font-mono tabular-nums"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">a</span>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-label="Máximo"
          placeholder={placeholder ? `máx ${placeholder}` : 'máx'}
          className="h-9 text-sm text-right font-mono tabular-nums"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </div>
    </div>
  )
}
