/**
 * PriceHistoryLineChart — extracted from item-detail-page so Recharts can
 * be lazy-loaded.
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

import { formatFechaCorta, formatMoney } from '@/lib/utils'

export interface PricePoint {
  date: string
  cost: number
  costMxn: number
}

export interface PriceHistoryLineChartProps {
  points: PricePoint[]
  currency: string
}

function PriceHistoryTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
  currency: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold">{formatMoney(payload[0].value, currency as 'MXN' | 'USD')}</p>
      {currency !== 'MXN' && payload[1] && (
        <p className="text-muted-foreground">{formatMoney(payload[1].value, 'MXN')} MXN</p>
      )}
    </div>
  )
}

export default function PriceHistoryLineChart({ points, currency }: PriceHistoryLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: string) => formatFechaCorta(v)}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
          tickLine={false}
          axisLine={false}
          width={46}
        />
        <Tooltip content={<PriceHistoryTooltip currency={currency} />} />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={points.length < 20}
          activeDot={{ r: 4 }}
        />
        {currency !== 'MXN' && (
          <Line
            type="monotone"
            dataKey="costMxn"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
