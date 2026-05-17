import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, AlertOctagon, ArrowDownToLine, ArrowUpFromLine,
  Fuel, MapPin, ArrowRight,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/custom/kpi-card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export default function AlmacenDashboard() {
  const navigate = useNavigate()
  const { activeSeason, organization } = useAuth()

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['almacen-kpis', organization?.id, activeSeason?.id],
    enabled: !!organization?.id && !!activeSeason?.id,
    staleTime: 60_000,
    queryFn: async () => {
      // Items + stock for KPIs. Real column names per 001_schema.sql:
      //   items.min_stock, items.max_stock (no stock_min/stock_max).
      const [itemsRes, stockRes, todayMovsRes] = await Promise.all([
        db.from('items').select('id, min_stock, max_stock').is('deleted_at', null),
        db.from('item_stock').select('item_id, quantity, avg_cost_mxn').eq('season_id', activeSeason!.id),
        db.from('stock_movements')
          .select('id, movement_type, posted_at')
          .gte('posted_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
          .eq('status', 'posted'),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (stockRes.error) throw stockRes.error
      if (todayMovsRes.error) throw todayMovsRes.error

      const items = (itemsRes.data ?? []) as Array<{ id: string; min_stock: number | null; max_stock: number | null }>
      const stock = (stockRes.data ?? []) as Array<{ item_id: string; quantity: number; avg_cost_mxn: number }>
      const movs  = (todayMovsRes.data ?? []) as Array<{ movement_type: string }>

      // Aggregate stock per item across warehouses.
      const stockByItem = new Map<string, number>()
      let totalValue = 0
      for (const s of stock) {
        stockByItem.set(s.item_id, (stockByItem.get(s.item_id) ?? 0) + s.quantity)
        totalValue += s.quantity * (s.avg_cost_mxn ?? 0)
      }

      let belowMin = 0
      for (const it of items) {
        const qty = stockByItem.get(it.id) ?? 0
        if (it.min_stock != null && qty < it.min_stock) belowMin += 1
      }

      const entriesToday = movs.filter((m) => m.movement_type.startsWith('entry_')).length
      const exitsToday   = movs.filter((m) => m.movement_type.startsWith('exit_')).length

      return { belowMin, totalValue, entriesToday, exitsToday, totalItems: items.length }
    },
  })

  if (isLoading || !kpis) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Almacén"
        description={`${kpis.totalItems} ítems en catálogo · Valor inventario actual: $${kpis.totalValue.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={AlertOctagon}
          label="Bajo mínimo"
          value={kpis.belowMin}
          hint="Ítems por reordenar"
          tone={kpis.belowMin > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/almacen/inventario?filter=low')}
        />
        <KpiCard
          icon={ArrowDownToLine}
          label="Entradas hoy"
          value={kpis.entriesToday}
          tone="success"
          onClick={() => navigate('/almacen/entradas')}
        />
        <KpiCard
          icon={ArrowUpFromLine}
          label="Salidas hoy"
          value={kpis.exitsToday}
          onClick={() => navigate('/almacen/salidas')}
        />
        <KpiCard
          icon={Package}
          label="Ítems en catálogo"
          value={kpis.totalItems}
          onClick={() => navigate('/almacen/inventario')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => navigate('/almacen/diesel')}
          className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-foreground/20 hover:shadow-sm transition-all text-left"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Fuel className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-sm font-medium">Diésel</div>
            <div className="text-[11px] text-muted-foreground">Cargas y dispensación</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground ml-auto" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/almacen/lotes')}
          className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-foreground/20 hover:shadow-sm transition-all text-left"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MapPin className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-sm font-medium">Lotes</div>
            <div className="text-[11px] text-muted-foreground">Costo por lote de cultivo</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground ml-auto" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/almacen/traspasos')}
          className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-foreground/20 hover:shadow-sm transition-all text-left"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <ArrowDownToLine className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="text-sm font-medium">Traspasos</div>
            <div className="text-[11px] text-muted-foreground">Entre almacenes</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground ml-auto" />
        </button>
      </div>
    </div>
  )
}
