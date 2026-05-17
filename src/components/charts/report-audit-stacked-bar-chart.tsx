/**
 * ReportAuditStackedBarChart — stacked horizontal bar chart used by the
 * "Auditoría por Usuario" report to show INSERT/UPDATE/DELETE counts per user.
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
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface AuditUserPoint {
  user: string
  INSERT: number
  UPDATE: number
  DELETE: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          <span style={{ color: p.color }}>■</span> {p.name}:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {p.value}
          </span>
        </p>
      ))}
      <p className="mt-1 border-t border-border pt-1 text-muted-foreground">
        Total:{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {total}
        </span>
      </p>
    </div>
  )
}

export default function ReportAuditStackedBarChart({
  data,
  height = 280,
}: {
  data: AuditUserPoint[]
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
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="user"
          width={160}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="INSERT" stackId="a" fill="#16a34a" maxBarSize={22} />
        <Bar dataKey="UPDATE" stackId="a" fill="#ca8a04" maxBarSize={22} />
        <Bar dataKey="DELETE" stackId="a" fill="#dc2626" maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
