/**
 * TractorConsumoMensualBarChart — extracted from diesel-tractor-page so
 * Recharts can be lazy-loaded.
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

import { formatMoney, formatQuantity } from '@/lib/utils'

export interface ConsumoMensualPoint {
  mes: string
  litros: number
  costo: number
}

export default function TractorConsumoMensualBarChart({
  data,
}: {
  data: ConsumoMensualPoint[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          width={45}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
          }}
          formatter={((v: number, name: string) => {
            if (name === 'litros') return [`${formatQuantity(v, 1)} L`, 'Litros']
            return [formatMoney(v, 'MXN'), 'Costo']
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any}
        />
        <Bar dataKey="litros" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
