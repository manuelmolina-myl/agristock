/**
 * SpendByCategoryBarChart — horizontal bar chart used by the Cockpit del
 * Director to break down monthly spend by item category.
 *
 * Lazy-loaded so the Recharts bundle isn't pulled in until the cockpit page
 * actually mounts. Follows the same pattern as daily-spend-area-chart and
 * diesel-consumo-bar-chart.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

import { formatMoney } from '@/lib/utils'

export interface CategorySpendPoint {
  category: string
  total_mxn: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: CategorySpendPoint }>
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-1">{row.category}</p>
      <p className="font-semibold text-foreground">
        {formatMoney(row.total_mxn)}
      </p>
    </div>
  )
}

const BAR_COLORS = [
  '#16a34a', // green-600
  '#22c55e', // green-500
  '#65a30d', // lime-600
  '#84cc16', // lime-500
  '#ca8a04', // yellow-600
  '#eab308', // yellow-500
  '#0ea5e9', // sky-500
  '#6366f1', // indigo-500
]

export default function SpendByCategoryBarChart({
  data,
  height = 280,
}: {
  data: CategorySpendPoint[]
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
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
          className="stroke-border"
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
          }
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={120}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="total_mxn" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
