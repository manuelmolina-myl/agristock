/**
 * FxRateLineChart — extracted from fx-rates-page so Recharts can be lazy-loaded.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export interface FxRatePoint {
  date: string
  rate: number
}

export interface FxRateLineChartProps {
  data: FxRatePoint[]
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        TC:{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {payload[0].value.toFixed(4)}
        </span>
      </p>
    </div>
  )
}

export default function FxRateLineChart({ data }: FxRateLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(v) => v.toFixed(2)}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#16A34A"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#16A34A' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
