import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, TrendingUp } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useFxRates, useCreate } from '@/hooks/use-supabase-query'
import type { FxRate } from '@/lib/database.types'
import { DataTable, createColumnHelper } from '@/components/shared/data-table'
import { CrudDialog } from '@/components/shared/crud-dialog'
import { PageHeader } from '@/components/custom/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatFechaCorta } from '@/lib/utils'

// ─── Schema ──────────────────────────────────────────────────────────────────

const schema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  rate: z.coerce
    .number()
    .min(1, 'El tipo de cambio debe ser mayor a 1'),
})

type FormValues = z.infer<typeof schema>

// ─── Source badge ─────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<FxRate['source'], string> = {
  DOF_FIX: 'DOF FIX',
  banxico: 'Banxico',
  manual: 'Manual',
}

const SOURCE_VARIANTS: Record<
  FxRate['source'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  DOF_FIX: 'default',
  banxico: 'secondary',
  manual: 'outline',
}

const SOURCE_CLASSES: Record<FxRate['source'], string> = {
  DOF_FIX:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  banxico:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  manual:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs text-popover-foreground">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        TC:{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {payload[0].value.toFixed(4)}
        </span>
      </p>
    </div>
  )
}

// ─── Column helper ────────────────────────────────────────────────────────────

const helper = createColumnHelper<FxRate>()

const columns = [
  helper.accessor('date', {
    header: 'Fecha',
    cell: (info) => formatFechaCorta(info.getValue()),
    enableSorting: true,
  }),
  helper.accessor('rate', {
    header: 'TC',
    cell: (info) => (
      <span className="font-semibold tabular-nums">
        {info.getValue().toFixed(4)}
      </span>
    ),
    enableSorting: true,
  }),
  helper.accessor('source', {
    header: 'Fuente',
    cell: (info) => {
      const src = info.getValue()
      return (
        <Badge
          variant={SOURCE_VARIANTS[src]}
          className={`text-xs font-normal ${SOURCE_CLASSES[src]}`}
        >
          {SOURCE_LABELS[src]}
        </Badge>
      )
    },
    enableSorting: false,
  }),
  helper.accessor('created_by', {
    header: 'Registrado',
    cell: () => (
      <span className="text-muted-foreground text-xs">
        —
      </span>
    ),
    enableSorting: false,
  }),
] as any

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FxRatesPage() {
  const { data: rawData = [], isLoading } = useFxRates()
  const data = rawData as FxRate[]
  const create = useCreate<FxRate>('fx_rates')

  const [dialogOpen, setDialogOpen] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { date: '', rate: undefined },
  })

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10)
    form.reset({ date: today, rate: undefined })
    setDialogOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        date: values.date,
        rate: values.rate,
        currency_from: 'USD',
        currency_to: 'MXN',
        source: 'manual',
      } as Partial<FxRate>)
      toast.success('Tipo de cambio registrado')
      setDialogOpen(false)
    } catch {
      toast.error('Ocurrió un error. Intenta de nuevo.')
    }
  })

  // Chart: last 30 entries (data is already desc, so reverse for ascending chart)
  const chartData = useMemo(() => {
    return [...data]
      .slice(0, 30)
      .reverse()
      .map((r) => ({
        date: formatFechaCorta(r.date),
        rate: r.rate,
      }))
  }, [data])

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Tipo de Cambio"
        description="Historial de tipos de cambio USD/MXN"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Registrar TC manual
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Table — 2/3 */}
        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            emptyMessage="No hay tipos de cambio registrados."
          />
        </div>

        {/* Chart — 1/3 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <TrendingUp className="size-3.5" />
                </div>
                <CardTitle className="text-sm font-medium">Evolución USD/MXN</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading || chartData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  {isLoading ? 'Cargando…' : 'Sin datos suficientes para la gráfica.'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => v.toFixed(2)}
                      width={44}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#16A34A"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#16A34A' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog */}
      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Registrar tipo de cambio manual"
        description="Ingresa la fecha y el tipo de cambio USD → MXN."
        isSubmitting={create.isPending}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Fecha *</Label>
            <Input
              id="date"
              type="date"
              className="h-8 text-sm"
              {...form.register('date')}
            />
            {form.formState.errors.date && (
              <p className="text-xs text-destructive">
                {form.formState.errors.date.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate">Tipo de cambio (MXN por USD) *</Label>
            <Input
              id="rate"
              type="number"
              step="0.0001"
              min="1"
              placeholder="Ej. 17.2500"
              className="h-8 text-sm"
              {...form.register('rate')}
            />
            {form.formState.errors.rate && (
              <p className="text-xs text-destructive">
                {form.formState.errors.rate.message}
              </p>
            )}
          </div>
        </div>
      </CrudDialog>
    </div>
  )
}

export default FxRatesPage
