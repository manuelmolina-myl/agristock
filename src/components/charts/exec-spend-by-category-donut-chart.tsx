/**
 * ExecSpendByCategoryDonutChart — Tablero Ejecutivo.
 *
 * Donut/pie de las top 8 categorías + "Otros". Legend abajo. Lazy-loaded.
 */
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

import { formatMoney } from '@/lib/utils'

export interface CategorySlice {
  name: string
  value: number
}

const PALETTE = [
  '#16a34a', // primary verde
  '#22c55e', // verde más claro
  '#ca8a04', // warning ámbar
  '#0ea5e9', // usd azul
  '#dc2626', // destructive
  '#65a30d', // lime
  '#9333ea', // púrpura
  '#f97316', // naranja
  '#94a3b8', // slate (Otros)
]

interface TooltipRow {
  name: string
  value: number
  payload: CategorySlice
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipRow[]
}) {
  if (!active || !payload?.length) return null
  const slice = payload[0]
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md min-w-[160px]">
      <p className="text-muted-foreground mb-0.5 text-xs">{slice.name}</p>
      <p className="font-semibold text-foreground tabular-nums">
        {formatMoney(slice.value)}
      </p>
    </div>
  )
}

export default function ExecSpendByCategoryDonutChart({
  data,
  height = 280,
}: {
  data: CategorySlice[]
  height?: number
}) {
  // Reducir a top 8 + "Otros"
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 8)
  const rest = sorted.slice(8)
  const restSum = rest.reduce((s, r) => s + r.value, 0)
  const chartData =
    rest.length > 0
      ? [...top, { name: 'Otros', value: restSum }]
      : top

  if (chartData.length === 0 || chartData.every((c) => c.value <= 0)) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sin gasto registrado este mes
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        >
          {chartData.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={
                entry.name === 'Otros'
                  ? PALETTE[PALETTE.length - 1]
                  : PALETTE[i % (PALETTE.length - 1)]
              }
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
