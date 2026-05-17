/**
 * DieselConsumoBarChart — extracted so Recharts can be lazy-loaded.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { formatQuantity } from '@/lib/utils'

export interface EquipBarData {
  name: string
  liters: number
}

export default function DieselConsumoBarChart({ data }: { data: EquipBarData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${formatQuantity(v, 0)}`}
          className="text-muted-foreground"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`${formatQuantity(Number(value), 1)} L`, 'Litros']}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="liters" fill="#16a34a" radius={[0, 3, 3, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}
