/**
 * ReportRotacionBucketBarChart — vertical bar chart used by the "Rotación de
 * Inventario" report to show how many items fall into each rotation bucket
 * (0–1, 1–3, 3–6, 6+).
 *
 * Lazy-loaded.
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

export interface RotationBucketPoint {
  bucket: string
  count: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: RotationBucketPoint }>
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="text-muted-foreground mb-0.5">Rotación {row.bucket}</p>
      <p className="font-semibold tabular-nums">{row.count} ítems</p>
    </div>
  )
}

const BUCKET_COLORS = ['#dc2626', '#ca8a04', '#16a34a', '#0ea5e9']

export default function ReportRotacionBucketBarChart({
  data,
  height = 240,
}: {
  data: RotationBucketPoint[]
  height?: number
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Sin datos para graficar
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ left: 0, right: 12, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-border"
        />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
