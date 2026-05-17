/**
 * ReportExistenciasBarChart — horizontal bar chart used by the "Existencias
 * Valuadas" report to break inventory value down by category (top 8).
 *
 * Lazy-loaded via React.lazy in the report viewer, mirroring the pattern of
 * spend-by-category-bar-chart and diesel-consumo-bar-chart.
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

export interface CategoryValuePoint {
  category: string
  total_mxn: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: CategoryValuePoint }>
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
  '#16a34a',
  '#22c55e',
  '#65a30d',
  '#84cc16',
  '#ca8a04',
  '#eab308',
  '#0ea5e9',
  '#6366f1',
]

export default function ReportExistenciasBarChart({
  data,
  height = 260,
}: {
  data: CategoryValuePoint[]
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
          width={140}
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
