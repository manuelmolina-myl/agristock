/**
 * ExecMonthlySpendStackedBarChart — Tablero Ejecutivo.
 *
 * Stacked bar with three series (Compras, Mantto, Diésel) sobre los últimos
 * 6 meses. Lazy-loaded para que Recharts no entre al bundle principal.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

import { formatMoney } from '@/lib/utils'

export interface MonthlySpendPoint {
  month: string          // "ene", "feb" …
  compras: number
  mantto: number
  diesel: number
  total: number
}

interface TooltipRow {
  name: string
  value: number
  color: string
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipRow[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md min-w-[180px]">
      <p className="text-muted-foreground mb-1.5 capitalize">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-sm"
                style={{ background: p.color }}
              />
              <span className="text-xs text-muted-foreground capitalize">{p.name}</span>
            </div>
            <span className="font-mono text-xs font-medium text-foreground">
              {formatMoney(p.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 border-t border-border pt-1 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Total</span>
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatMoney(total)}
        </span>
      </div>
    </div>
  )
}

const COLOR_COMPRAS = '#16a34a' // verde primary
const COLOR_MANTTO  = '#ca8a04' // ámbar warning
const COLOR_DIESEL  = '#0ea5e9' // azul usd

export default function ExecMonthlySpendStackedBarChart({
  data,
  height = 260,
}: {
  data: MonthlySpendPoint[]
  height?: number
}) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
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
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
        />
        <Legend
          iconType="square"
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        <Bar dataKey="compras" name="Compras" stackId="a" fill={COLOR_COMPRAS} radius={[0, 0, 0, 0]} maxBarSize={42} />
        <Bar dataKey="mantto"  name="Mantto"  stackId="a" fill={COLOR_MANTTO}  radius={[0, 0, 0, 0]} maxBarSize={42} />
        <Bar dataKey="diesel"  name="Diésel"  stackId="a" fill={COLOR_DIESEL}  radius={[4, 4, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  )
}
