/**
 * DieselTendenciaAreaChart — extracted so Recharts can be lazy-loaded.
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

import { formatQuantity } from '@/lib/utils'

export interface TrendData {
  date: string
  liters: number
}

export default function DieselTendenciaAreaChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `${formatQuantity(v, 0)}`}
          className="text-muted-foreground"
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`${formatQuantity(Number(value), 1)} L`, 'Litros']}
          contentStyle={{ fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="liters"
          stroke="#16a34a"
          strokeWidth={2}
          fill="#16a34a"
          fillOpacity={0.15}
          dot={data.length <= 14 ? { r: 3, fill: '#16a34a' } : false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
