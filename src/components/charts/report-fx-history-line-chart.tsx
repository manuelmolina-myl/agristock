/**
 * ReportFxHistoryLineChart — line chart used by the "Conversiones de Moneda"
 * report to render the historic USD→MXN exchange rate.
 *
 * Lazy-loaded — mirrors the pattern of report-existencias-bar-chart and friends.
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

export interface FxHistoryPoint {
  date: string
  rate: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: FxHistoryPoint }>
  label?: string
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        TC USD/MXN:{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {payload[0].value.toFixed(4)}
        </span>
      </p>
    </div>
  )
}

export default function ReportFxHistoryLineChart({
  data,
  height = 260,
}: {
  data: FxHistoryPoint[]
  height?: number
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
          minTickGap={32}
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
