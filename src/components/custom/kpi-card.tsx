/**
 * KpiCard — universal dashboard KPI tile.
 *
 * Supports two API flavours so we can consolidate the 4 previously-duplicated
 * implementations (admin dashboard, diesel page, diesel-tractor, gerente
 * dashboard, plus the existing compras/mantto/almacen-mod usage).
 *
 * Visual: a left-edge colour rail that picks up the tone (default / success /
 * warning / critical / info), a tinted icon tile, then label + value + hint.
 * Optional `trend` row at the bottom with arrow + percentage.
 */
import type { ReactNode } from 'react'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export type KpiTone = 'default' | 'warning' | 'critical' | 'success' | 'info'

interface KpiCardProps {
  /**
   * Either a Lucide component (`Wrench`) or a JSX node (`<Wrench className="..." />`).
   * Both are accepted to support legacy callers that pre-render the icon.
   */
  icon: React.ElementType | ReactNode
  label: string
  value: ReactNode
  /** Free text shown under the value (alias: `description`, `sub`). */
  hint?: string
  /** Same as `hint` — kept for legacy callers. */
  description?: string
  /** Same as `hint` — diesel pages use this name. */
  sub?: string
  tone?: KpiTone
  onClick?: () => void
  className?: string
  /** Renders a skeleton in place of the value. */
  isLoading?: boolean
  /** Alias for `isLoading` — diesel pages use this. */
  loading?: boolean
  /** Overrides the default iconBg/iconFg colours. */
  iconClassName?: string
  /** Trend chip rendered under the value. Positive = success, negative = destructive. */
  trend?: { value: number; label: string }
}

const TONE_STYLES: Record<KpiTone, { rail: string; iconBg: string; iconFg: string }> = {
  default: {
    rail:   'bg-border',
    iconBg: 'bg-muted',
    iconFg: 'text-muted-foreground',
  },
  warning: {
    rail:   'bg-warning',
    iconBg: 'bg-warning/15',
    iconFg: 'text-warning',
  },
  critical: {
    rail:   'bg-destructive',
    iconBg: 'bg-destructive/15',
    iconFg: 'text-destructive',
  },
  success: {
    rail:   'bg-success',
    iconBg: 'bg-success/15',
    iconFg: 'text-success',
  },
  info: {
    rail:   'bg-usd',
    iconBg: 'bg-usd/15',
    iconFg: 'text-usd',
  },
}

function isComponentType(icon: React.ElementType | ReactNode): icon is React.ElementType {
  return typeof icon === 'function' || typeof icon === 'object' && icon != null && 'render' in (icon as object)
}

export function KpiCard({
  icon,
  label,
  value,
  hint,
  description,
  sub,
  tone = 'default',
  onClick,
  className,
  isLoading,
  loading,
  iconClassName,
  trend,
}: KpiCardProps) {
  const t = TONE_STYLES[tone]
  const isLoadingFinal = isLoading ?? loading ?? false
  const interactive = !!onClick && !isLoadingFinal
  const finalHint = hint ?? description ?? sub

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card',
        'flex items-stretch gap-0 text-left transition-all duration-150',
        interactive && 'hover:border-foreground/20 hover:shadow-sm cursor-pointer',
        !interactive && 'cursor-default',
        className,
      )}
    >
      <span aria-hidden className={cn('w-1 shrink-0', t.rail)} />

      <div className="flex items-start gap-3 p-4 flex-1 min-w-0">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            t.iconBg,
            t.iconFg,
            iconClassName,
          )}
        >
          {isComponentType(icon)
            ? (() => { const I = icon as React.ElementType; return <I className="size-4" strokeWidth={1.75} /> })()
            : icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
            {label}
          </div>

          {isLoadingFinal ? (
            <div className="mt-1.5 space-y-1">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-semibold tabular-nums text-foreground mt-0.5">
                {value}
              </div>
              {finalHint && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{finalHint}</div>
              )}
              {trend && (
                <div
                  className={cn(
                    'mt-1 inline-flex items-center gap-0.5 text-xs font-medium',
                    trend.value > 0 ? 'text-success' : trend.value < 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {trend.value > 0 ? (
                    <TrendingUp className="size-3" strokeWidth={2} />
                  ) : trend.value < 0 ? (
                    <TrendingDown className="size-3" strokeWidth={2} />
                  ) : null}
                  {trend.value > 0 ? '+' : ''}{trend.value.toFixed(0)}% {trend.label}
                </div>
              )}
            </>
          )}
        </div>

        {interactive && (
          <ArrowRight
            className="size-4 text-muted-foreground/60 shrink-0 mt-1 group-hover:text-foreground transition-colors"
            strokeWidth={1.75}
          />
        )}
      </div>
    </button>
  )
}
