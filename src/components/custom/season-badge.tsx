import { cn } from "@/lib/utils"

interface SeasonBadgeProps {
  season: { name: string; status: string } | null
  onClick?: () => void
  className?: string
}

type SeasonStatus = 'active' | 'planning' | 'closing' | 'closed' | string

const statusDotClass: Record<string, string> = {
  active:   'bg-success',
  planning: 'bg-blue-500',
  closing:  'bg-warning',
  closed:   'bg-muted-foreground',
}

const statusLabel: Record<string, string> = {
  active:   'Activa',
  planning: 'Planeación',
  closing:  'Cierre',
  closed:   'Cerrada',
}

export function SeasonBadge({ season, onClick, className }: SeasonBadgeProps) {
  if (!season) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground",
          className
        )}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
        Sin temporada
      </span>
    )
  }

  const dotClass = statusDotClass[season.status as SeasonStatus] ?? 'bg-muted-foreground'
  const label = statusLabel[season.status as SeasonStatus] ?? season.status

  const Tag = onClick ? 'button' : 'span'

  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium",
        onClick && "cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", dotClass)} />
      <span>🌾 {season.name}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{label}</span>
    </Tag>
  )
}
