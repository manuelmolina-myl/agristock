/**
 * TractorRendimientoLineChart — extracted from diesel-tractor-page so
 * Recharts can be lazy-loaded.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

import { formatQuantity } from '@/lib/utils'

export interface RendimientoPoint {
  fecha: string
  rendimiento: number
  anomalo?: boolean
}

export interface TractorRendimientoLineChartProps {
  data: RendimientoPoint[]
  avgRendimiento: number | null
}

export default function TractorRendimientoLineChart({
  data,
  avgRendimiento,
}: TractorRendimientoLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey="fecha"
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: number) => [`${formatQuantity(v, 2)} L/h`, 'Rendimiento']) as any}
        />
        {avgRendimiento != null && (
          <ReferenceLine
            y={avgRendimiento}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="6 3"
            label={{
              value: `Prom. ${formatQuantity(avgRendimiento, 2)}`,
              position: 'insideTopRight',
              fontSize: 11,
              fill: 'hsl(var(--muted-foreground))',
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="rendimiento"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props
            if (payload.anomalo) {
              return (
                <circle
                  key={`dot-${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill="hsl(43 96% 56%)"
                  stroke="white"
                  strokeWidth={1.5}
                />
              )
            }
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={3}
                fill="hsl(var(--primary))"
                stroke="white"
                strokeWidth={1}
              />
            )
          }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
