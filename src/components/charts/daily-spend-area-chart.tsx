/**
 * DailySpendAreaChart — extracted from admin/gerente dashboard pages so that
 * Recharts can be code-split via React.lazy.
 *
 * Identical to the inline JSX it replaces; only the gradient id differs by
 * page to avoid SVG id collisions when both charts mount.
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { formatFechaCorta, formatMoney } from '@/lib/utils'

export interface DailySpendPoint {
  date: string
  total: number
}

export interface DailySpendAreaChartProps {
  data: DailySpendPoint[]
  /** Pixel height of the chart (default 180) */
  height?: number
  /** Tick font size (default 10) */
  fontSize?: number
  /** Y-axis label width (default 42) */
  yAxisWidth?: number
  /** Unique gradient id to avoid SVG defs collisions when multiple charts mount */
  gradientId?: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">
        {formatMoney(payload[0].value)}
      </p>
    </div>
  )
}

export default function DailySpendAreaChart({
  data,
  height = 180,
  fontSize = 10,
  yAxisWidth = 42,
  gradientId = 'gastoGradient',
}: DailySpendAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => formatFechaCorta(v)}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
          }
          tickLine={false}
          axisLine={false}
          width={yAxisWidth}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#22c55e"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
