/**
 * ExecCashFlowLineChart — Tablero Ejecutivo.
 *
 * Línea de pagos por día (31 puntos) con una línea de referencia (avg diaria).
 * Tooltip muestra día + monto + N facturas. Lazy-loaded.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

import { formatMoney, formatFechaCorta } from '@/lib/utils'

export interface CashFlowPoint {
  day: string            // ISO date
  due_amount_mxn: number
  invoice_count: number
}

interface TooltipRow {
  value: number
  payload: CashFlowPoint
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipRow[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md min-w-[160px]">
      <p className="text-muted-foreground mb-1 text-xs">
        {formatFechaCorta(row.day)}
      </p>
      <p className="font-semibold text-foreground tabular-nums">
        {formatMoney(row.due_amount_mxn)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {row.invoice_count} {row.invoice_count === 1 ? 'factura' : 'facturas'}
      </p>
    </div>
  )
}

export default function ExecCashFlowLineChart({
  data,
  height = 260,
}: {
  data: CashFlowPoint[]
  height?: number
}) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin pagos programados
      </div>
    )
  }

  const totalAmt = data.reduce((s, d) => s + (d.due_amount_mxn ?? 0), 0)
  const avg = totalAmt / data.length

  // X labels: día del mes (1, 5, 10…) — solo cada 3-4 puntos para no saturar
  const tickFormatter = (v: string) => {
    const d = new Date(v)
    return String(d.getDate())
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : v >= 1000
              ? `$${(v / 1000).toFixed(0)}k`
              : `$${v}`
          }
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<ChartTooltip />} />
        {avg > 0 && (
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: `Promedio · ${formatMoney(avg)}`,
              position: 'insideTopRight',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="due_amount_mxn"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 2.5, fill: '#16a34a', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
