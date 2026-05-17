/**
 * ReportMiniDashboard — wrapper used by each report in /direccion/reportes/:slug
 * to render a small KPI grid (2-6 tiles) plus an optional Recharts chart above
 * the data table.
 *
 * Layout:
 *   ┌────────────┬────────────┬────────────┬────────────┐
 *   │  KPI 1     │  KPI 2     │  KPI 3     │  KPI 4     │   (2 cols mobile, 4 desktop)
 *   └────────────┴────────────┴────────────┴────────────┘
 *   ┌──────────────────────────────────────────────────┐
 *   │  optional <Suspense>-wrapped Recharts component  │
 *   └──────────────────────────────────────────────────┘
 *
 * All copy is provided pre-formatted by callers (e.g. "$3,480.00", "245 L").
 * The component itself doesn't format anything — it just lays out tiles.
 */
import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

import { KpiCard, type KpiTone } from '@/components/custom/kpi-card'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export interface KpiTile {
  label: string
  /** Pre-formatted display value (e.g. "$3,480.00", "245 L", "12.5%"). */
  value: string | number
  /** Optional subtitle under the value. */
  hint?: string
  tone?: KpiTone
  /** Optional Lucide component / JSX node — defaults to a generic Activity icon. */
  icon?: React.ElementType | ReactNode
}

export interface ReportMiniDashboardProps {
  kpis: KpiTile[]
  /** Optional chart node — caller wraps it in <Suspense> with its own fallback. */
  chart?: ReactNode
  /** Optional caption shown above the chart. */
  chartTitle?: string
  isLoading?: boolean
}

export function ReportMiniDashboard({
  kpis,
  chart,
  chartTitle,
  isLoading,
}: ReportMiniDashboardProps) {
  if (kpis.length === 0 && !chart) return null

  // Responsive column count: 2 cols up to sm, 4 cols from md.
  // For 2 or 3 tiles we still want a 2/3-col layout on desktop.
  const colsClass =
    kpis.length <= 2
      ? 'grid-cols-2'
      : kpis.length === 3
        ? 'grid-cols-2 md:grid-cols-3'
        : 'grid-cols-2 md:grid-cols-4'

  return (
    <div className="flex flex-col gap-4">
      {kpis.length > 0 && (
        <div className={`grid gap-3 ${colsClass}`}>
          {kpis.map((k, i) => (
            <KpiCard
              key={`${k.label}-${i}`}
              icon={k.icon ?? Activity}
              label={k.label}
              value={k.value}
              hint={k.hint}
              tone={k.tone ?? 'default'}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}

      {chart && (
        <Card>
          <CardContent className="pt-6">
            {chartTitle && (
              <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground font-medium mb-3">
                {chartTitle}
              </p>
            )}
            {isLoading ? <Skeleton className="h-56 w-full" /> : chart}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
