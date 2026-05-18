import { useState, useMemo, lazy, Suspense } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileDown,
  Clock,
  Boxes,
  AlertTriangle,
  Tags,
  Truck,
  Receipt,
  Users,
  Sprout,
  Layers,
  Flame,
  DollarSign,
  Fuel,
  Gauge,
  TrendingUp,
  TrendingDown,
  Percent,
  PackageX,
  ArrowDownUp,
  Wrench,
  RefreshCw,
  Activity,
  CalendarClock,
  CreditCard,
  ListChecks,
  ShieldCheck,
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { useAuth } from '@/hooks/use-auth'
import {
  useItems,
  useWarehouses,
  useSuppliers,
  useCropLots,
  useCategories,
  useEquipment,
} from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'
import { exportToCsv } from '@/lib/csv-export'
import { formatSupabaseError } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { MoneyDisplay } from '@/components/custom/money-display'
import { ReportMiniDashboard, type KpiTile } from '@/components/custom/report-mini-dashboard'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-loaded chart chunks — kept out of the initial reports bundle.
const ReportExistenciasBarChart = lazy(
  () => import('@/components/charts/report-existencias-bar-chart'),
)
const ReportHorizontalAmountBarChart = lazy(
  () => import('@/components/charts/report-horizontal-amount-bar-chart'),
)
const ReportDieselMonthlyAreaChart = lazy(
  () => import('@/components/charts/report-diesel-monthly-area-chart'),
)
const ReportFxHistoryLineChart = lazy(
  () => import('@/components/charts/report-fx-history-line-chart'),
)
const ReportAuditStackedBarChart = lazy(
  () => import('@/components/charts/report-audit-stacked-bar-chart'),
)
const ReportRotacionBucketBarChart = lazy(
  () => import('@/components/charts/report-rotacion-bucket-bar-chart'),
)

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface ReportMeta {
  slug: string
  title: string
  description: string
}

// ─── Report registry ──────────────────────────────────────────────────────────

const REPORT_META: Record<string, ReportMeta> = {
  kardex:               { slug: 'kardex',               title: 'Kardex General',          description: 'Historial de movimientos por ítem' },
  existencias:          { slug: 'existencias',           title: 'Existencias Valuadas',    description: 'Inventario valorizado a costo promedio' },
  'entradas-proveedor': { slug: 'entradas-proveedor',    title: 'Entradas por Proveedor',  description: 'Compras agrupadas por proveedor' },
  'salidas-lote':       { slug: 'salidas-lote',          title: 'Salidas por Lote',        description: 'Consumo por lote agrícola' },
  'salidas-equipo':     { slug: 'salidas-equipo',        title: 'Salidas por Equipo',      description: 'Consumo por equipo o maquinaria' },
  'consumo-diesel':     { slug: 'consumo-diesel',        title: 'Consumo Diésel',          description: 'Registro de cargas de diésel' },
  'diesel-por-equipo':  { slug: 'diesel-por-equipo',     title: 'Diésel por Equipo',       description: 'Litros y costo de diésel agregado por tractor o maquinaria' },
  rotacion:             { slug: 'rotacion',              title: 'Rotación de Inventario',  description: 'Índice de rotación por ítem' },
  'sin-movimiento':     { slug: 'sin-movimiento',        title: 'Ítems sin Movimiento',    description: 'Ítems sin movimiento en el período' },
  'variacion-precios':  { slug: 'variacion-precios',     title: 'Variación de Precios',    description: 'Comparativa de precios en el tiempo' },
  'cierre-temporada':   { slug: 'cierre-temporada',      title: 'Cierre de Temporada',     description: 'Resumen ejecutivo al cierre de temporada' },
  'auditoria-usuario':  { slug: 'auditoria-usuario',     title: 'Auditoría por Usuario',   description: 'Acciones por usuario' },
  'conversiones-moneda':{ slug: 'conversiones-moneda',   title: 'Conversiones de Moneda',  description: 'Tipos de cambio aplicados' },
  'cuentas-por-pagar':  { slug: 'cuentas-por-pagar',     title: 'Cuentas por Pagar Aging', description: 'Antigüedad de saldos por proveedor' },
  'costo-mantenimiento-equipo': { slug: 'costo-mantenimiento-equipo', title: 'Costo de Mantenimiento por Equipo', description: 'Costo de OTs por equipo en el período' },
}

// ─── PDF helper ───────────────────────────────────────────────────────────────

async function generatePdf(
  orgName: string,
  reportTitle: string,
  filtersLabel: string,
  head: string[],
  body: (string | number)[][][],
  footRow?: (string | number)[]
) {
  // Lazy-load jsPDF + autoTable so this heavy chunk only loads on PDF export
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'landscape' })
  const dateStr = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Header
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(orgName, 14, 14)
  doc.setFontSize(14)
  doc.setTextColor(30)
  doc.text(reportTitle, 14, 22)
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`Filtros: ${filtersLabel}`, 14, 29)
  doc.text(`Generado: ${dateStr}`, doc.internal.pageSize.width - 14, 29, { align: 'right' })

  autoTable(doc, {
    head: [head],
    body: body as unknown as (string | number)[][],
    foot: footRow ? [footRow] : undefined,
    startY: 34,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 80, 50], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 248] },
  })

  doc.save(`${reportTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}

// ─── Excel helper ─────────────────────────────────────────────────────────────

function generateExcel(
  reportTitle: string,
  head: string[],
  rows: (string | number)[][],
  footRow?: (string | number)[]
) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows, ...(footRow ? [footRow] : [])])

  // Auto-size columns
  const colWidths = head.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[i] ?? '').length),
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31))
  XLSX.writeFile(wb, `${reportTitle.toLowerCase().replace(/\s+/g, '-')}.xlsx`)
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

/**
 * Trigger a CSV download for a report. Reuses `exportToCsv` from
 * `@/lib/csv-export` and computes a slug-friendly filename from the title.
 *
 * Footer rows (e.g. "TOTAL") are appended verbatim so that spreadsheet apps
 * show them inline with the data rows.
 */
function downloadReportCsv(
  reportTitle: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  footRow?: Array<string | number>,
) {
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${reportTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.csv`
  exportToCsv({
    filename,
    headers,
    rows: footRow ? [...rows, footRow] : rows,
  })
}

// ─── Placeholder component ────────────────────────────────────────────────────

function ComingSoon({ title }: { title: string }) {
  return (
    <EmptyState
      icon={<Clock className="size-6" />}
      title="Próximamente"
      description={`El reporte "${title}" estará disponible en una próxima versión.`}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 1: Kardex General
// ─────────────────────────────────────────────────────────────────────────────

function KardexReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const { data: items = [] } = useItems()

  const today = new Date().toISOString().slice(0, 10)
  const [itemId, setItemId]     = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['kardex', { itemId, dateFrom, dateTo, seasonId: activeSeason?.id }],
    queryFn: async () => {
      if (itemId === 'all') return []
      let q = db
        .from('stock_movement_lines')
        .select(`
          id,
          quantity,
          unit_cost_native,
          currency,
          movement:stock_movements(
            id, document_number, movement_type, created_at
          )
        `)
        .eq('item_id', itemId)
        .order('created_at', { ascending: true })

      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return data as KardexLine[]
    },
    enabled: itemId !== 'all',
  })

  interface KardexLine {
    id: string
    quantity: number
    unit_cost_native: number
    currency: string
    movement: {
      id: string
      document_number: string | null
      movement_type: string
      created_at: string
    }
  }

  // Build kardex with running balance
  const kardex = useMemo(() => {
    const acc: Array<KardexLine & { entrada: number; salida: number; saldo: number }> = []
    let running = 0
    for (const l of lines) {
      const isEntry = l.movement?.movement_type?.startsWith('entry_')
      const entrada = isEntry ? l.quantity : 0
      const salida = isEntry ? 0 : l.quantity
      running += isEntry ? l.quantity : -l.quantity
      acc.push({ ...l, entrada, salida, saldo: running })
    }
    return acc
  }, [lines])

  const HEAD = ['Fecha', 'Tipo Movimiento', 'Folio', 'Entrada', 'Salida', 'Saldo', 'Costo Promedio']

  function buildRows() {
    return kardex.map((k) => [
      formatFechaCorta(k.movement.created_at),
      k.movement.movement_type,
      k.movement.document_number ?? '—',
      k.entrada > 0 ? formatQuantity(k.entrada) : '',
      k.salida > 0  ? formatQuantity(k.salida) : '',
      formatQuantity(k.saldo),
      formatMoney(k.unit_cost_native, k.currency as 'MXN' | 'USD'),
    ])
  }

  const selectedItem = items.find((i) => i.id === itemId)
  const filtersLabel = `Ítem: ${selectedItem?.name ?? 'N/A'} | ${dateFrom || 'inicio'} – ${dateTo}`

  // KPIs: entradas (#), salidas (#), saldo final, costo último
  const kpis: KpiTile[] = useMemo(() => {
    if (kardex.length === 0) return []
    const entradas = kardex.filter((k) => k.entrada > 0).length
    const salidas = kardex.filter((k) => k.salida > 0).length
    const lastLine = kardex[kardex.length - 1]
    return [
      { label: 'Entradas',     value: entradas,                                                  tone: 'success',  icon: TrendingUp,   hint: `${kardex.length} movimientos totales` },
      { label: 'Salidas',      value: salidas,                                                   tone: 'warning',  icon: TrendingDown, hint: 'En el período' },
      { label: 'Saldo final',  value: formatQuantity(lastLine.saldo),                            tone: 'info',     icon: Boxes,        hint: selectedItem?.name ?? '' },
      { label: 'Último costo', value: formatMoney(lastLine.unit_cost_native, lastLine.currency as 'MXN' | 'USD'), tone: 'default', icon: DollarSign, hint: formatFechaCorta(lastLine.movement.created_at) },
    ]
  }, [kardex, selectedItem])

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Ítem</Label>
          <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar ítem…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Seleccionar —</SelectItem>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.sku} – {i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Mini dashboard */}
      {kardex.length > 0 && <ReportMiniDashboard kpis={kpis} isLoading={isLoading} />}

      <Separator />

      {/* Table */}
      {itemId === 'all' ? (
        <EmptyState title="Selecciona un ítem" description="Elige un ítem del catálogo para ver su kardex de movimientos." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : kardex.length === 0 ? (
        <EmptyState title="Sin movimientos" description="No se encontraron movimientos para el ítem y período seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {kardex.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="text-xs">{formatFechaCorta(k.movement.created_at)}</TableCell>
                  <TableCell className="text-xs">{k.movement.movement_type}</TableCell>
                  <TableCell className="font-mono text-xs">{k.movement.document_number ?? '—'}</TableCell>
                  <TableCell className="text-right text-xs text-emerald-600 dark:text-emerald-400">
                    {k.entrada > 0 ? formatQuantity(k.entrada) : ''}
                  </TableCell>
                  <TableCell className="text-right text-xs text-red-600 dark:text-red-400">
                    {k.salida > 0 ? formatQuantity(k.salida) : ''}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatQuantity(k.saldo)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={k.unit_cost_native} currency={k.currency as 'MXN' | 'USD'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {kardex.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Kardex General', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Kardex General', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Kardex General', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 2: Existencias Valuadas
// ─────────────────────────────────────────────────────────────────────────────

interface ItemStockRow {
  item_id: string
  warehouse_id: string
  quantity: number
  avg_cost_mxn: number
  item?: {
    sku: string
    name: string
    reorder_point?: number | null
    category?: { name: string } | null
    unit?: { code: string } | null
  }
  warehouse?: { name: string; code: string } | null
}

function ExistenciasReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const { data: warehouses = [] } = useWarehouses()

  const [warehouseId, setWarehouseId] = useState<string>('all')

  const { data: stock = [], isLoading } = useQuery<ItemStockRow[]>({
    queryKey: ['item_stock_report', activeSeason?.id, warehouseId],
    queryFn: async () => {
      let q = db
        .from('item_stock')
        .select(`
          item_id,
          warehouse_id,
          quantity,
          avg_cost_mxn,
          item:items(sku, name, reorder_point, category:categories(name), unit:units(code)),
          warehouse:warehouses(name, code)
        `)
        .eq('season_id', activeSeason?.id)
        .gt('quantity', 0)

      if (warehouseId !== 'all') q = q.eq('warehouse_id', warehouseId)

      const { data, error } = await q
      if (error) throw error
      return data as ItemStockRow[]
    },
    enabled: !!activeSeason?.id,
  })

  const totals = useMemo(() => ({
    mxn: stock.reduce((s, r) => s + (r.quantity * (r.avg_cost_mxn ?? 0)), 0),
  }), [stock])

  // Aggregate value by category for the mini-dashboard chart (top 8).
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of stock) {
      const cat = r.item?.category?.name ?? 'Sin categoría'
      const value = r.quantity * (r.avg_cost_mxn ?? 0)
      map.set(cat, (map.get(cat) ?? 0) + value)
    }
    return Array.from(map.entries())
      .map(([category, total_mxn]) => ({ category, total_mxn }))
      .sort((a, b) => b.total_mxn - a.total_mxn)
      .slice(0, 8)
  }, [stock])

  // KPI values: total value, # items, low-stock count, top category.
  const kpis: KpiTile[] = useMemo(() => {
    if (stock.length === 0) return []
    const itemCount = new Set(stock.map((r) => r.item_id)).size
    const lowStock = stock.filter(
      (r) => (r.item?.reorder_point ?? 0) > 0 && r.quantity < (r.item?.reorder_point ?? 0),
    ).length
    const topCategory = categoryBreakdown[0]
    return [
      { label: 'Valor total',     value: formatMoney(totals.mxn, 'MXN'),                                       tone: 'success',  icon: DollarSign, hint: 'Inventario valorizado' },
      { label: 'Ítems',           value: itemCount,                                                            tone: 'info',     icon: Boxes,      hint: `${stock.length} ubicaciones` },
      { label: 'Bajo reorden',    value: lowStock,                                                             tone: lowStock > 0 ? 'warning' : 'default', icon: AlertTriangle, hint: lowStock > 0 ? 'Reponer pronto' : 'Sin alertas' },
      { label: 'Top categoría',   value: topCategory ? topCategory.category : '—',                             tone: 'default',  icon: Tags,       hint: topCategory ? formatMoney(topCategory.total_mxn, 'MXN') : '' },
    ]
  }, [stock, totals, categoryBreakdown])

  const HEAD = ['SKU', 'Nombre', 'Categoría', 'Unidad', 'Cantidad', 'Costo Prom. MXN', 'Valor Total MXN']

  function buildRows() {
    return stock.map((r) => [
      r.item?.sku ?? '—',
      r.item?.name ?? '—',
      r.item?.category?.name ?? '—',
      r.item?.unit?.code ?? '—',
      formatQuantity(r.quantity),
      formatMoney(r.avg_cost_mxn, 'MXN'),
      formatMoney(r.quantity * (r.avg_cost_mxn ?? 0), 'MXN'),
    ])
  }

  const footRow = ['', '', '', '', 'TOTAL', '', formatMoney(totals.mxn, 'MXN')]
  const filtersLabel = `Almacén: ${warehouseId === 'all' ? 'Todos' : (warehouses.find((w) => w.id === warehouseId)?.name ?? warehouseId)}`

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Almacén</Label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los almacenes</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.code} – {w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mini dashboard */}
      {stock.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top categorías por valor"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportExistenciasBarChart data={categoryBreakdown} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : stock.length === 0 ? (
        <EmptyState title="Sin existencias" description="No se encontraron ítems con existencias para los filtros seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((r) => (
                <TableRow key={`${r.item_id}-${r.warehouse_id}`}>
                  <TableCell className="font-mono text-xs">{r.item?.sku ?? '—'}</TableCell>
                  <TableCell className="text-xs font-medium">{r.item?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.item?.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs">{r.item?.unit?.code ?? '—'}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.quantity)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.avg_cost_mxn} currency="MXN" />
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.quantity * (r.avg_cost_mxn ?? 0)} currency="MXN" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell />
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.mxn} currency="MXN" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {stock.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Existencias Valuadas', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Existencias Valuadas', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Existencias Valuadas', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 3: Entradas por Proveedor
// ─────────────────────────────────────────────────────────────────────────────

interface SupplierEntryRow {
  supplier_id: string | null
  supplier_name: string
  count: number
  total_mxn: number
  total_usd: number
}

interface StockMovementRaw {
  id: string
  supplier_id: string | null
  total_mxn: number | null
  total_usd: number | null
  supplier?: { name: string } | null
}

function EntradasProveedorReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const { data: suppliers = [] } = useSuppliers()

  const today = new Date().toISOString().slice(0, 10)
  const [supplierId, setSupplierId] = useState<string>('all')
  const [dateFrom, setDateFrom]     = useState<string>('')
  const [dateTo, setDateTo]         = useState<string>(today)

  const { data: movements = [], isLoading } = useQuery<StockMovementRaw[]>({
    queryKey: ['entradas_proveedor', { seasonId: activeSeason?.id, supplierId, dateFrom, dateTo }],
    queryFn: async () => {
      let q = db
        .from('stock_movements')
        .select('id, supplier_id, total_mxn, total_usd, supplier:suppliers(name)')
        .eq('season_id', activeSeason?.id)
        .like('movement_type', 'entry_%')
        .eq('status', 'posted')

      if (supplierId !== 'all') q = q.eq('supplier_id', supplierId)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return data as StockMovementRaw[]
    },
    enabled: !!activeSeason?.id,
  })

  const grouped = useMemo<SupplierEntryRow[]>(() => {
    const map = new Map<string, SupplierEntryRow>()
    for (const m of movements) {
      const key = m.supplier_id ?? '__none__'
      const name = m.supplier?.name ?? 'Sin proveedor'
      if (!map.has(key)) {
        map.set(key, { supplier_id: m.supplier_id, supplier_name: name, count: 0, total_mxn: 0, total_usd: 0 })
      }
      const row = map.get(key)!
      row.count++
      row.total_mxn += m.total_mxn ?? 0
      row.total_usd += m.total_usd ?? 0
    }
    return Array.from(map.values()).sort((a, b) => b.total_mxn - a.total_mxn)
  }, [movements])

  const totals = useMemo(() => ({
    count: grouped.reduce((s, r) => s + r.count, 0),
    mxn:   grouped.reduce((s, r) => s + r.total_mxn, 0),
    usd:   grouped.reduce((s, r) => s + r.total_usd, 0),
  }), [grouped])

  // Top 8 suppliers by MXN amount, for the bar chart.
  const topSuppliers = useMemo(
    () =>
      grouped.slice(0, 8).map((r) => ({
        label: r.supplier_name,
        amount: r.total_mxn,
      })),
    [grouped],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (grouped.length === 0) return []
    const topSup = grouped[0]
    return [
      { label: 'Total entradas', value: formatMoney(totals.mxn, 'MXN'), tone: 'success', icon: Receipt,   hint: 'Compras del período' },
      { label: '# Entradas',     value: totals.count,                   tone: 'info',    icon: Truck,     hint: 'OCs registradas' },
      { label: '# Proveedores',  value: grouped.length,                 tone: 'default', icon: Users,     hint: 'Distintos en el período' },
      { label: 'Top proveedor',  value: topSup?.supplier_name ?? '—',   tone: 'default', icon: Tags,      hint: topSup ? formatMoney(topSup.total_mxn, 'MXN') : '' },
    ]
  }, [grouped, totals])

  const HEAD = ['Proveedor', '# Entradas', 'Total MXN', 'Total USD']

  function buildRows() {
    return grouped.map((r) => [
      r.supplier_name,
      r.count,
      formatMoney(r.total_mxn, 'MXN'),
      formatMoney(r.total_usd, 'USD'),
    ])
  }

  const footRow = ['TOTAL', totals.count, formatMoney(totals.mxn, 'MXN'), formatMoney(totals.usd, 'USD')]
  const filtersLabel = `Proveedor: ${supplierId === 'all' ? 'Todos' : (suppliers.find((s) => s.id === supplierId)?.name ?? supplierId)} | ${dateFrom || 'inicio'} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Proveedor</Label>
          <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Mini dashboard */}
      {grouped.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top proveedores por monto"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={topSuppliers} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin datos" description="No se encontraron entradas con los filtros seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r) => (
                <TableRow key={r.supplier_id ?? '__none__'}>
                  <TableCell className="text-xs font-medium">{r.supplier_name}</TableCell>
                  <TableCell className="text-center text-xs">{r.count}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.total_mxn} currency="MXN" />
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.total_usd} currency="USD" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-center text-xs font-semibold">{totals.count}</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.mxn} currency="MXN" />
                </TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.usd} currency="USD" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {grouped.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Entradas por Proveedor', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Entradas por Proveedor', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Entradas por Proveedor', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow as (string | number)[])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 4: Salidas por Lote
// ─────────────────────────────────────────────────────────────────────────────

interface CropLotRow {
  crop_lot_id: string | null
  lot_code: string
  crop_name: string
  hectares: number
  total_mxn: number
  cost_per_ha: number
}

interface MovementLineRaw {
  id: string
  total_cost_mxn: number | null
  movement?: {
    crop_lot_id: string | null
    crop_lot?: { code: string; crop_name?: string | null; hectares?: number | null } | null
  } | null
}

function SalidasLoteReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const { data: lots = [] } = useCropLots()

  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading } = useQuery<MovementLineRaw[]>({
    queryKey: ['salidas_lote', { seasonId: activeSeason?.id, dateFrom, dateTo }],
    queryFn: async () => {
      let q = db
        .from('stock_movement_lines')
        .select(`
          id,
          total_cost_mxn,
          movement:stock_movements(
            crop_lot_id,
            crop_lot:crops_lots(code, crop_name, hectares)
          )
        `)
        .like('movement.movement_type', 'exit_%')
        .eq('movement.status', 'posted')
        .eq('movement.season_id', activeSeason?.id)

      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return (data as MovementLineRaw[]).filter((l) => l.movement?.crop_lot_id)
    },
    enabled: !!activeSeason?.id,
  })

  const grouped = useMemo<CropLotRow[]>(() => {
    const map = new Map<string, CropLotRow>()
    for (const l of lines) {
      const cropLotId = l.movement?.crop_lot_id
      if (!cropLotId) continue
      const lot = l.movement?.crop_lot
      if (!map.has(cropLotId)) {
        map.set(cropLotId, {
          crop_lot_id: cropLotId,
          lot_code: lot?.code ?? '—',
          crop_name: lot?.crop_name ?? '—',
          hectares: lot?.hectares ?? 0,
          total_mxn: 0,
          cost_per_ha: 0,
        })
      }
      const row = map.get(cropLotId)!
      row.total_mxn += l.total_cost_mxn ?? 0
    }
    // Compute cost per hectare
    for (const row of map.values()) {
      row.cost_per_ha = row.hectares > 0 ? row.total_mxn / row.hectares : 0
    }
    return Array.from(map.values()).sort((a, b) => b.total_mxn - a.total_mxn)
  }, [lines])

  const totalMxn = useMemo(() => grouped.reduce((s, r) => s + r.total_mxn, 0), [grouped])

  // Top 8 lots by total MXN for the chart.
  const topLots = useMemo(
    () =>
      grouped.slice(0, 8).map((r) => ({
        label: r.lot_code,
        amount: r.total_mxn,
      })),
    [grouped],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (grouped.length === 0) return []
    const topLot = grouped[0]
    const avg = totalMxn / grouped.length
    return [
      { label: 'Costo total',     value: formatMoney(totalMxn, 'MXN'),       tone: 'success', icon: DollarSign, hint: 'Consumido por lotes' },
      { label: '# Lotes',         value: grouped.length,                     tone: 'info',    icon: Sprout,     hint: 'Con consumo' },
      { label: 'Lote más caro',   value: topLot?.lot_code ?? '—',            tone: 'warning', icon: Layers,     hint: topLot ? formatMoney(topLot.total_mxn, 'MXN') : '' },
      { label: 'Promedio / lote', value: formatMoney(avg, 'MXN'),            tone: 'default', icon: Gauge,      hint: 'Costo medio' },
    ]
  }, [grouped, totalMxn])

  const HEAD = ['Lote', 'Cultivo', 'Hectáreas', 'Total Consumido MXN', 'Costo por Ha']

  function buildRows() {
    return grouped.map((r) => [
      r.lot_code,
      r.crop_name,
      formatQuantity(r.hectares),
      formatMoney(r.total_mxn, 'MXN'),
      formatMoney(r.cost_per_ha, 'MXN'),
    ])
  }

  const footRow = ['TOTAL', '', '', formatMoney(totalMxn, 'MXN'), '']
  const filtersLabel = `${dateFrom || 'inicio'} – ${dateTo}`

  // Suppress unused variable warning for lots
  void lots

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Mini dashboard */}
      {grouped.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top lotes por costo"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={topLots} yAxisWidth={100} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin datos" description="No se encontraron salidas para el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r) => (
                <TableRow key={r.crop_lot_id}>
                  <TableCell className="font-mono text-xs">{r.lot_code}</TableCell>
                  <TableCell className="text-xs">{r.crop_name}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.hectares)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.total_mxn} currency="MXN" />
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.cost_per_ha} currency="MXN" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totalMxn} currency="MXN" />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {grouped.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Salidas por Lote', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Salidas por Lote', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Salidas por Lote', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 5: Consumo Diésel
// ─────────────────────────────────────────────────────────────────────────────

interface DieselLine {
  id: string
  quantity: number
  diesel_liters: number | null
  unit_cost_native: number
  currency: string
  movement: {
    id: string
    document_number: string | null
    created_at: string
    equipment?: { name: string; code: string } | null
    operator_employee?: { name: string } | null
  }
}

function ConsumoDieselReport({ orgName }: { orgName: string }) {
  const { activeSeason, organization } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading } = useQuery<DieselLine[]>({
    queryKey: ['consumo-diesel-report', { seasonId: activeSeason?.id, dateFrom, dateTo }],
    queryFn: async () => {
      // Step 1: get diesel item IDs for this org
      const { data: dieselItems } = await db
        .from('items')
        .select('id')
        .eq('organization_id', organization?.id)
        .eq('is_diesel', true)
      if (!dieselItems?.length) return []

      const dieselIds = dieselItems.map((d: { id: string }) => d.id)

      // Step 2: query lines for those items
      let q = db
        .from('stock_movement_lines')
        .select(`
          id, quantity, diesel_liters, unit_cost_native, currency,
          movement:stock_movements(
            id, document_number, created_at,
            equipment:equipment(name, code),
            operator_employee:employees(name)
          )
        `)
        .in('item_id', dieselIds)
        .order('created_at', { ascending: false })

      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return data as DieselLine[]
    },
    enabled: !!activeSeason?.id && !!organization?.id,
  })

  const totals = useMemo(() => ({
    liters: lines.reduce((s, l) => s + (l.diesel_liters ?? l.quantity), 0),
    cost:   lines.reduce((s, l) => s + l.unit_cost_native * (l.diesel_liters ?? l.quantity), 0),
  }), [lines])

  // Aggregate litres by month (last 6 months window).
  const monthlySeries = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of lines) {
      const d = new Date(l.movement.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map.set(key, (map.get(key) ?? 0) + (l.diesel_liters ?? l.quantity))
    }
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, liters]) => {
        const [y, m] = key.split('-')
        return { month: `${monthNames[Number(m) - 1]} ${y.slice(2)}`, liters }
      })
  }, [lines])

  const kpis: KpiTile[] = useMemo(() => {
    if (lines.length === 0) return []
    const avgPerLoad = totals.liters / lines.length
    return [
      { label: 'Total litros',   value: `${formatQuantity(totals.liters, 0)} L`,    tone: 'info',    icon: Fuel,       hint: 'Consumido' },
      { label: 'Costo total',    value: formatMoney(totals.cost, 'MXN'),            tone: 'success', icon: DollarSign, hint: 'A precio de carga' },
      { label: '# Cargas',       value: lines.length,                               tone: 'default', icon: Flame,      hint: 'Cargas registradas' },
      { label: 'Promedio/carga', value: `${formatQuantity(avgPerLoad, 1)} L`,       tone: 'default', icon: Gauge,      hint: 'Litros por carga' },
    ]
  }, [lines, totals])

  const HEAD = ['Fecha', 'Folio', 'Equipo', 'Operador', 'Litros', 'Costo/Litro', 'Total']

  function buildRows() {
    return lines.map((l) => {
      const liters = l.diesel_liters ?? l.quantity
      return [
        formatFechaCorta(l.movement.created_at),
        l.movement.document_number ?? '—',
        l.movement.equipment?.name ?? '—',
        l.movement.operator_employee?.name ?? '—',
        formatQuantity(liters),
        formatMoney(l.unit_cost_native, l.currency as 'MXN' | 'USD'),
        formatMoney(l.unit_cost_native * liters, l.currency as 'MXN' | 'USD'),
      ]
    })
  }

  const filtersLabel = `${dateFrom || 'inicio'} – ${dateTo}`
  const footRow = ['TOTAL', '', '', '', formatQuantity(totals.liters), '', formatMoney(totals.cost, 'MXN')]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {lines.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Consumo mensual (últimos 6 meses)"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportDieselMonthlyAreaChart data={monthlySeries} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}
      <Separator />
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : lines.length === 0 ? (
        <EmptyState title="Sin cargas de diésel" description="No hay registros de diésel en el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const liters = l.diesel_liters ?? l.quantity
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatFechaCorta(l.movement.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.movement.document_number ?? '—'}</TableCell>
                    <TableCell className="text-xs">{l.movement.equipment?.name ?? '—'}</TableCell>
                    <TableCell className="text-xs">{l.movement.operator_employee?.name ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs">{formatQuantity(liters)}</TableCell>
                    <TableCell className="text-right text-xs"><MoneyDisplay amount={l.unit_cost_native} currency={l.currency as 'MXN' | 'USD'} /></TableCell>
                    <TableCell className="text-right text-xs"><MoneyDisplay amount={l.unit_cost_native * liters} currency={l.currency as 'MXN' | 'USD'} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-right text-xs font-semibold">{formatQuantity(totals.liters)} L</TableCell>
                <TableCell />
                <TableCell className="text-right text-xs font-semibold"><MoneyDisplay amount={totals.cost} currency="MXN" /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {lines.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Consumo Diésel', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Consumo Diésel', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Consumo Diésel', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 6: Ítems sin Movimiento
// ─────────────────────────────────────────────────────────────────────────────

interface SinMovItemRow {
  item_id: string
  quantity: number
  item: { id: string; name: string; sku: string; category?: { name: string } | null }
}

interface MovedItemId { item_id: string }

function SinMovimientoReport({ orgName }: { orgName: string }) {
  const { activeSeason, organization } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: allStock = [], isLoading: loadingStock } = useQuery<SinMovItemRow[]>({
    queryKey: ['stock-all', activeSeason?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('item_id, quantity, item:items!inner(id, name, sku, category:categories(name))')
        .eq('season_id', activeSeason?.id)
      if (error) throw error
      return data as SinMovItemRow[]
    },
    enabled: !!activeSeason?.id,
  })

  const { data: movedIds = [], isLoading: loadingMoved } = useQuery<MovedItemId[]>({
    queryKey: ['moved-items', { seasonId: activeSeason?.id, dateFrom, dateTo, orgId: organization?.id }],
    queryFn: async () => {
      let q = db
        .from('stock_movement_lines')
        .select('item_id')
        .eq('season_id', activeSeason?.id)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
      const { data, error } = await q
      if (error) throw error
      return data as MovedItemId[]
    },
    enabled: !!activeSeason?.id,
  })

  const movedSet = useMemo(() => new Set(movedIds.map((m) => m.item_id)), [movedIds])

  const sinMovimiento = useMemo(
    () => allStock.filter((s) => !movedSet.has(s.item_id)),
    [allStock, movedSet]
  )

  const isLoading = loadingStock || loadingMoved

  const kpis: KpiTile[] = useMemo(() => {
    if (sinMovimiento.length === 0 && allStock.length === 0) return []
    const totalQty = sinMovimiento.reduce((s, r) => s + r.quantity, 0)
    const pct = allStock.length > 0 ? (sinMovimiento.length / allStock.length) * 100 : 0
    return [
      { label: 'Sin movimiento', value: sinMovimiento.length,                     tone: sinMovimiento.length > 0 ? 'warning' : 'success', icon: PackageX, hint: 'En el período' },
      { label: 'Existencia',     value: formatQuantity(totalQty, 0),              tone: 'info',    icon: Boxes,   hint: 'Unidades estancadas' },
      { label: '% del catálogo', value: `${pct.toFixed(1)}%`,                     tone: 'default', icon: Percent, hint: `de ${allStock.length} ítems` },
    ]
  }, [sinMovimiento, allStock])

  const HEAD = ['SKU', 'Artículo', 'Categoría', 'Existencia actual']

  function buildRows() {
    return sinMovimiento.map((s) => [
      s.item.sku,
      s.item.name,
      s.item.category?.name ?? '—',
      formatQuantity(s.quantity),
    ])
  }

  const filtersLabel = `${dateFrom || 'inicio'} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Mini dashboard */}
      {(sinMovimiento.length > 0 || allStock.length > 0) && (
        <ReportMiniDashboard kpis={kpis} isLoading={isLoading} />
      )}
      <Separator />
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : sinMovimiento.length === 0 ? (
        <EmptyState title="Todos los artículos tienen movimiento" description="Todos los ítems del inventario tienen al menos un movimiento en el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sinMovimiento.map((s) => (
                <TableRow key={s.item_id}>
                  <TableCell className="font-mono text-xs">{s.item.sku}</TableCell>
                  <TableCell className="text-xs font-medium">{s.item.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.item.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(s.quantity)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {sinMovimiento.length} artículo{sinMovimiento.length !== 1 ? 's' : ''} sin movimiento
      </p>

      {/* Export buttons */}
      {sinMovimiento.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Ítems sin Movimiento', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Ítems sin Movimiento', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Ítems sin Movimiento', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 7: Variación de Precios
// ─────────────────────────────────────────────────────────────────────────────

interface PriceVariationLine {
  id: string
  unit_cost_native: number
  unit_cost_mxn: number | null
  currency: string
  movement: {
    created_at: string
    document_number: string | null
    supplier?: { name: string } | null
  }
}

function VariacionPreciosReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const { data: items = [] } = useItems()
  const today = new Date().toISOString().slice(0, 10)
  const [itemId, setItemId]     = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading } = useQuery<PriceVariationLine[]>({
    queryKey: ['variacion-precios', { itemId, dateFrom, dateTo, seasonId: activeSeason?.id }],
    queryFn: async () => {
      if (itemId === 'all') return []
      let q = db
        .from('stock_movement_lines')
        .select(`
          id, unit_cost_native, unit_cost_mxn, currency,
          movement:stock_movements(
            created_at, document_number, supplier:suppliers(name)
          )
        `)
        .eq('item_id', itemId)
        .like('movement.movement_type', 'entry_%')
        .order('created_at', { ascending: true })

      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      // Filter to entry movements only
      return (data as PriceVariationLine[]).filter((l) => l.movement)
    },
    enabled: itemId !== 'all' && !!activeSeason?.id,
  })

  const selectedItem = items.find((i) => i.id === itemId)
  const currency = lines[0]?.currency ?? 'MXN'

  // Per-line variations (skipping the first entry which has no prior).
  const variations = useMemo(() => {
    const out: number[] = []
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1].unit_cost_native
      if (prev > 0) out.push(((lines[i].unit_cost_native - prev) / prev) * 100)
    }
    return out
  }, [lines])

  const kpis: KpiTile[] = useMemo(() => {
    if (lines.length === 0) return []
    const changed = variations.filter((v) => Math.abs(v) > 0.01).length
    const avg = variations.length > 0 ? variations.reduce((s, v) => s + v, 0) / variations.length : 0
    const maxInc = variations.length > 0 ? Math.max(...variations) : 0
    const maxDec = variations.length > 0 ? Math.min(...variations) : 0
    return [
      { label: 'Cambios',          value: changed,                                  tone: 'info',     icon: ArrowDownUp, hint: `de ${variations.length} comparaciones` },
      { label: 'Cambio promedio',  value: `${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`, tone: avg >= 0 ? 'warning' : 'success', icon: Percent, hint: 'Tendencia del período' },
      { label: 'Mayor incremento', value: `${maxInc >= 0 ? '+' : ''}${maxInc.toFixed(1)}%`, tone: 'warning',  icon: TrendingUp,   hint: 'Pico al alza' },
      { label: 'Mayor decremento', value: `${maxDec.toFixed(1)}%`,                  tone: 'success',  icon: TrendingDown, hint: 'Pico a la baja' },
    ]
  }, [lines, variations])

  const HEAD = ['Fecha', 'Folio', 'Proveedor', `Precio (${currency})`, 'Precio MXN', 'Variación']

  function buildRows() {
    return lines.map((l, idx) => {
      const prev = idx > 0 ? lines[idx - 1].unit_cost_native : null
      const variation = prev ? ((l.unit_cost_native - prev) / prev) * 100 : 0
      return [
        formatFechaCorta(l.movement.created_at),
        l.movement.document_number ?? '—',
        l.movement.supplier?.name ?? '—',
        formatMoney(l.unit_cost_native, l.currency as 'MXN' | 'USD'),
        formatMoney(l.unit_cost_mxn ?? l.unit_cost_native, 'MXN'),
        idx === 0 ? '—' : `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%`,
      ]
    })
  }

  const filtersLabel = `Ítem: ${selectedItem?.name ?? '—'} | ${dateFrom || 'inicio'} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Ítem</Label>
          <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar ítem…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Seleccionar —</SelectItem>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.sku} – {i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Mini dashboard */}
      {lines.length > 0 && <ReportMiniDashboard kpis={kpis} isLoading={isLoading} />}
      <Separator />
      {itemId === 'all' ? (
        <EmptyState title="Selecciona un ítem" description="Elige un artículo para ver su historial de precios de compra." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : lines.length === 0 ? (
        <EmptyState title="Sin entradas" description="No se encontraron entradas para el ítem y período seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => {
                const prev = idx > 0 ? lines[idx - 1].unit_cost_native : null
                const variation = prev ? ((l.unit_cost_native - prev) / prev) * 100 : 0
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatFechaCorta(l.movement.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.movement.document_number ?? '—'}</TableCell>
                    <TableCell className="text-xs">{l.movement.supplier?.name ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs"><MoneyDisplay amount={l.unit_cost_native} currency={l.currency as 'MXN' | 'USD'} /></TableCell>
                    <TableCell className="text-right text-xs"><MoneyDisplay amount={l.unit_cost_mxn ?? l.unit_cost_native} currency="MXN" /></TableCell>
                    <TableCell className={`text-right text-xs font-medium ${idx === 0 ? 'text-muted-foreground' : variation >= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {idx === 0 ? '—' : `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Export buttons */}
      {lines.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Variación de Precios', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Variación de Precios', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Variación de Precios', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 8: Salidas por Equipo
// ─────────────────────────────────────────────────────────────────────────────

interface SalidaEquipoLineRaw {
  id: string
  quantity: number
  line_total_mxn: number | null
  equipment_id: string | null
  equipment?: { id: string; name: string; code: string } | null
  movement?: {
    id: string
    movement_type: string
    status: string
    season_id: string
    created_at: string
  } | null
}

interface SalidaEquipoRow {
  equipment_id: string
  code: string
  name: string
  count: number
  quantity: number
  cost_mxn: number
}

function SalidasEquipoReport({ orgName }: { orgName: string }) {
  const { activeSeason } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading, error } = useQuery<SalidaEquipoLineRaw[]>({
    queryKey: ['salidas-equipo-report', { seasonId: activeSeason?.id, dateFrom, dateTo }],
    queryFn: async () => {
      let q = db
        .from('stock_movement_lines')
        .select(`
          id, quantity, line_total_mxn, equipment_id,
          equipment:equipment(id, name, code),
          movement:stock_movements!inner(id, movement_type, status, season_id, created_at)
        `)
        .eq('destination_type', 'equipment')
        .not('equipment_id', 'is', null)
        .like('movement.movement_type', 'exit_%')
        .eq('movement.status', 'posted')
        .eq('movement.season_id', activeSeason?.id)

      if (dateFrom) q = q.gte('movement.created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('movement.created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return (data as SalidaEquipoLineRaw[]).filter((l) => l.movement && l.equipment_id)
    },
    enabled: !!activeSeason?.id,
  })

  const grouped = useMemo<SalidaEquipoRow[]>(() => {
    const map = new Map<string, SalidaEquipoRow>()
    const movementSet = new Map<string, Set<string>>()
    for (const l of lines) {
      const eid = l.equipment_id
      if (!eid) continue
      if (!map.has(eid)) {
        map.set(eid, {
          equipment_id: eid,
          code: l.equipment?.code ?? '—',
          name: l.equipment?.name ?? '—',
          count: 0,
          quantity: 0,
          cost_mxn: 0,
        })
        movementSet.set(eid, new Set<string>())
      }
      const row = map.get(eid)!
      row.quantity += l.quantity ?? 0
      row.cost_mxn += l.line_total_mxn ?? 0
      if (l.movement?.id) movementSet.get(eid)!.add(l.movement.id)
    }
    for (const [eid, set] of movementSet) {
      const row = map.get(eid)
      if (row) row.count = set.size
    }
    return Array.from(map.values()).sort((a, b) => b.cost_mxn - a.cost_mxn)
  }, [lines])

  const totals = useMemo(() => ({
    count: grouped.reduce((s, r) => s + r.count, 0),
    cost: grouped.reduce((s, r) => s + r.cost_mxn, 0),
  }), [grouped])

  const topEquipos = useMemo(
    () => grouped.slice(0, 8).map((r) => ({ label: r.code, amount: r.cost_mxn })),
    [grouped],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (grouped.length === 0) return []
    const avg = grouped.length > 0 ? totals.cost / grouped.length : 0
    return [
      { label: 'Equipos atendidos', value: grouped.length,                tone: 'info',    icon: Wrench,    hint: 'Con consumo' },
      { label: '# Salidas',         value: totals.count,                  tone: 'default', icon: Receipt,   hint: 'Movimientos posted' },
      { label: 'Costo total',       value: formatMoney(totals.cost, 'MXN'), tone: 'success', icon: DollarSign, hint: 'Consumido por equipos' },
      { label: 'Promedio / equipo', value: formatMoney(avg, 'MXN'),        tone: 'default', icon: Gauge,     hint: 'Costo medio' },
    ]
  }, [grouped, totals])

  const HEAD = ['Código', 'Equipo', '# Salidas', 'Cantidad total', 'Costo MXN']

  function buildRows() {
    return grouped.map((r) => [
      r.code,
      r.name,
      r.count,
      formatQuantity(r.quantity),
      formatMoney(r.cost_mxn, 'MXN'),
    ])
  }

  const footRow = ['TOTAL', '', totals.count, '', formatMoney(totals.cost, 'MXN')]
  const filtersLabel = `${dateFrom || 'inicio'} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {grouped.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top equipos por costo"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={topEquipos} yAxisWidth={120} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin salidas a equipos" description="No se encontraron salidas con destino a equipos en el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r) => (
                <TableRow key={r.equipment_id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-center text-xs">{r.count}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.quantity)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.cost_mxn} currency="MXN" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-center text-xs font-semibold">{totals.count}</TableCell>
                <TableCell />
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.cost} currency="MXN" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Salidas por Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Salidas por Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Salidas por Equipo', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow as (string | number)[])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 8b: Diésel por Equipo
// ─────────────────────────────────────────────────────────────────────────────

interface DieselEquipoLineRaw {
  id: string
  diesel_liters: number | null
  quantity: number
  unit_cost_native: number
  currency: string
  equipment_id: string | null
  equipment?: { id: string; name: string; code: string } | null
  movement?: {
    id: string
    movement_type: string
    status: string
    season_id: string
    created_at: string
  } | null
}

interface DieselEquipoRow {
  equipment_id: string
  code: string
  name: string
  loads: number
  liters: number
  cost_mxn: number
}

function DieselPorEquipoReport({ orgName }: { orgName: string }) {
  const { activeSeason, organization } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo]     = useState<string>(today)

  const { data: lines = [], isLoading, error } = useQuery<DieselEquipoLineRaw[]>({
    queryKey: ['diesel-por-equipo-report', { orgId: organization?.id, seasonId: activeSeason?.id, dateFrom, dateTo }],
    queryFn: async () => {
      const { data: dieselItems } = await db
        .from('items')
        .select('id')
        .eq('organization_id', organization?.id)
        .eq('is_diesel', true)
      if (!dieselItems?.length) return []

      const dieselIds = dieselItems.map((d: { id: string }) => d.id)

      let q = db
        .from('stock_movement_lines')
        .select(`
          id, quantity, diesel_liters, unit_cost_native, currency, equipment_id,
          equipment:equipment(id, name, code),
          movement:stock_movements!inner(id, movement_type, status, season_id, created_at)
        `)
        .in('item_id', dieselIds)
        .not('equipment_id', 'is', null)
        .like('movement.movement_type', 'exit_%')
        .eq('movement.status', 'posted')

      if (activeSeason?.id) q = q.eq('movement.season_id', activeSeason.id)
      if (dateFrom) q = q.gte('movement.created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('movement.created_at', `${dateTo}T23:59:59`)

      const { data, error } = await q
      if (error) throw error
      return (data as DieselEquipoLineRaw[]).filter((l) => l.movement && l.equipment_id)
    },
    enabled: !!activeSeason?.id && !!organization?.id,
  })

  const grouped = useMemo<DieselEquipoRow[]>(() => {
    const map = new Map<string, DieselEquipoRow>()
    const movementSet = new Map<string, Set<string>>()
    for (const l of lines) {
      const eid = l.equipment_id
      if (!eid) continue
      if (!map.has(eid)) {
        map.set(eid, {
          equipment_id: eid,
          code: l.equipment?.code ?? '—',
          name: l.equipment?.name ?? '—',
          loads: 0,
          liters: 0,
          cost_mxn: 0,
        })
        movementSet.set(eid, new Set<string>())
      }
      const row = map.get(eid)!
      const liters = l.diesel_liters ?? l.quantity
      row.liters += liters
      // unit_cost_native está en la moneda del movimiento; lo asumimos MXN
      // para la agregación (los flujos de carga de diésel registran MXN —
      // si llegara USD, el reporte lo sumaría como si fuera MXN. Documentado.)
      row.cost_mxn += liters * (l.unit_cost_native ?? 0)
      if (l.movement?.id) movementSet.get(eid)!.add(l.movement.id)
    }
    for (const [eid, set] of movementSet) {
      const row = map.get(eid)
      if (row) row.loads = set.size
    }
    return Array.from(map.values()).sort((a, b) => b.liters - a.liters)
  }, [lines])

  const totals = useMemo(() => ({
    loads: grouped.reduce((s, r) => s + r.loads, 0),
    liters: grouped.reduce((s, r) => s + r.liters, 0),
    cost: grouped.reduce((s, r) => s + r.cost_mxn, 0),
  }), [grouped])

  const topEquipos = useMemo(
    () => grouped.slice(0, 8).map((r) => ({ label: r.code, amount: r.liters })),
    [grouped],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (grouped.length === 0) return []
    const avgPerEquipo = grouped.length > 0 ? totals.liters / grouped.length : 0
    return [
      { label: 'Equipos atendidos', value: grouped.length,                          tone: 'info',    icon: Wrench,    hint: 'Con consumo de diésel' },
      { label: 'Total litros',      value: `${formatQuantity(totals.liters, 0)} L`, tone: 'default', icon: Fuel,      hint: 'Consumido' },
      { label: 'Costo total',       value: formatMoney(totals.cost, 'MXN'),         tone: 'success', icon: DollarSign, hint: 'A precio de carga' },
      { label: 'Promedio / equipo', value: `${formatQuantity(avgPerEquipo, 0)} L`,  tone: 'default', icon: Gauge,     hint: 'Litros medios' },
    ]
  }, [grouped, totals])

  const HEAD = ['Código', 'Equipo', '# Cargas', 'Litros', 'Costo MXN']

  function buildRows() {
    return grouped.map((r) => [
      r.code,
      r.name,
      r.loads,
      formatQuantity(r.liters, 1),
      formatMoney(r.cost_mxn, 'MXN'),
    ])
  }

  const footRow = ['TOTAL', '', totals.loads, formatQuantity(totals.liters, 1), formatMoney(totals.cost, 'MXN')]
  const filtersLabel = `${dateFrom || 'inicio'} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {grouped.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top equipos por litros consumidos"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={topEquipos} yAxisWidth={120} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin consumo de diésel" description="No se encontraron cargas de diésel a equipos en el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r) => (
                <TableRow key={r.equipment_id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-center text-xs">{r.loads}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.liters, 1)} L</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.cost_mxn} currency="MXN" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-center text-xs font-semibold">{totals.loads}</TableCell>
                <TableCell className="text-right text-xs font-semibold">{formatQuantity(totals.liters, 1)} L</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.cost} currency="MXN" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Diesel por Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Diesel por Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Diesel por Equipo', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow as (string | number)[])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 9: Rotación de Inventario
// ─────────────────────────────────────────────────────────────────────────────

interface RotacionItemRaw {
  id: string
  sku: string
  name: string
  category_id: string | null
  category?: { id: string; name: string } | null
  stocks?: Array<{ quantity: number; avg_cost_mxn: number; season_id: string }>
}

interface RotacionExitRaw {
  item_id: string
  quantity: number
  movement?: { season_id: string; movement_type: string; status: string; created_at: string } | null
}

interface RotacionRow {
  id: string
  sku: string
  name: string
  category: string
  stock: number
  exits: number
  rotation: number
  days_inventory: number
}

function RotacionReport({ orgName }: { orgName: string }) {
  const { activeSeason, organization } = useAuth()
  const { data: categories = [] } = useCategories()
  const [categoryId, setCategoryId] = useState<string>('all')

  // Use the active season as the analysis window: from start_date → today.
  const startDate = activeSeason?.start_date ?? null
  const endDate = new Date().toISOString().slice(0, 10)
  const daysPeriodo = useMemo(() => {
    if (!startDate) return 365
    const start = new Date(`${startDate}T00:00:00`).getTime()
    const end = new Date(`${endDate}T23:59:59`).getTime()
    return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
  }, [startDate, endDate])

  const { data: items = [], isLoading: loadingItems, error: itemsError } = useQuery<RotacionItemRaw[]>({
    queryKey: ['rotacion-items', { orgId: organization?.id, seasonId: activeSeason?.id, categoryId }],
    queryFn: async () => {
      let q = db
        .from('items')
        .select(`
          id, sku, name, category_id,
          category:categories(id, name),
          stocks:item_stock(quantity, avg_cost_mxn, season_id)
        `)
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
      if (categoryId !== 'all') q = q.eq('category_id', categoryId)
      const { data, error } = await q
      if (error) throw error
      return data as RotacionItemRaw[]
    },
    enabled: !!organization?.id,
  })

  const { data: exits = [], isLoading: loadingExits, error: exitsError } = useQuery<RotacionExitRaw[]>({
    queryKey: ['rotacion-exits', { seasonId: activeSeason?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movement_lines')
        .select(`
          item_id, quantity,
          movement:stock_movements!inner(season_id, movement_type, status, created_at)
        `)
        .like('movement.movement_type', 'exit_%')
        .eq('movement.status', 'posted')
        .eq('movement.season_id', activeSeason?.id)
      if (error) throw error
      return data as RotacionExitRaw[]
    },
    enabled: !!activeSeason?.id,
  })

  const isLoading = loadingItems || loadingExits
  const error = itemsError ?? exitsError

  const rows = useMemo<RotacionRow[]>(() => {
    const exitsByItem = new Map<string, number>()
    for (const e of exits) {
      if (!e.movement) continue
      exitsByItem.set(e.item_id, (exitsByItem.get(e.item_id) ?? 0) + (e.quantity ?? 0))
    }
    const out: RotacionRow[] = []
    for (const it of items) {
      const stocksForSeason = (it.stocks ?? []).filter((s) => s.season_id === activeSeason?.id)
      const stock = stocksForSeason.reduce((s, r) => s + (r.quantity ?? 0), 0)
      const exitsQty = exitsByItem.get(it.id) ?? 0
      // promedio_inventario ≈ stock actual (proxy)
      // rotación = (exits / avg_inventory) * (365 / days_periodo)
      const avgInv = stock
      const rotation = avgInv > 0 ? (exitsQty / avgInv) * (365 / daysPeriodo) : 0
      const days_inventory = rotation > 0 ? 365 / rotation : Number.POSITIVE_INFINITY
      // Only include items that have either stock or exits in the period.
      if (avgInv > 0 || exitsQty > 0) {
        out.push({
          id: it.id,
          sku: it.sku,
          name: it.name,
          category: it.category?.name ?? '—',
          stock,
          exits: exitsQty,
          rotation,
          days_inventory,
        })
      }
    }
    return out.sort((a, b) => b.rotation - a.rotation)
  }, [items, exits, daysPeriodo, activeSeason?.id])

  const kpis: KpiTile[] = useMemo(() => {
    if (rows.length === 0) return []
    const withRotation = rows.filter((r) => r.rotation > 0)
    const avgRot = withRotation.length > 0
      ? withRotation.reduce((s, r) => s + r.rotation, 0) / withRotation.length
      : 0
    const avgDays = avgRot > 0 ? 365 / avgRot : 0
    const critical = rows.filter((r) => r.rotation > 0 && r.rotation < 1).length
    return [
      { label: 'Ítems analizados',  value: rows.length,                              tone: 'info',     icon: Boxes,    hint: 'Con stock o salidas' },
      { label: 'Rotación promedio', value: `${avgRot.toFixed(2)}×`,                  tone: 'default',  icon: RefreshCw, hint: 'Veces al año' },
      { label: 'Días inv. promedio', value: avgDays > 0 ? `${Math.round(avgDays)} d` : '—', tone: 'default', icon: CalendarClock, hint: 'Estimado' },
      { label: 'Ítems críticos',    value: critical,                                 tone: critical > 0 ? 'warning' : 'success', icon: AlertTriangle, hint: 'Rotación < 1×' },
    ]
  }, [rows])

  const buckets = useMemo(() => {
    const counts = { '0-1': 0, '1-3': 0, '3-6': 0, '6+': 0 }
    for (const r of rows) {
      if (r.rotation < 1) counts['0-1']++
      else if (r.rotation < 3) counts['1-3']++
      else if (r.rotation < 6) counts['3-6']++
      else counts['6+']++
    }
    return Object.entries(counts).map(([bucket, count]) => ({ bucket, count }))
  }, [rows])

  const HEAD = ['SKU', 'Nombre', 'Categoría', 'Stock', 'Salidas', 'Rotación', 'Días inv.']

  function buildRows() {
    return rows.map((r) => [
      r.sku,
      r.name,
      r.category,
      formatQuantity(r.stock),
      formatQuantity(r.exits),
      `${r.rotation.toFixed(2)}×`,
      Number.isFinite(r.days_inventory) ? `${Math.round(r.days_inventory)} d` : '∞',
    ])
  }

  const filtersLabel = `Temporada: ${activeSeason?.name ?? 'N/A'} | Categoría: ${categoryId === 'all' ? 'Todas' : (categories.find((c) => c.id === categoryId)?.name ?? categoryId)} | ${daysPeriodo} días`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Categoría</Label>
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {rows.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Distribución por rotación"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportRotacionBucketBarChart data={buckets} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin datos suficientes" description="No se encontraron ítems con stock o salidas en la temporada seleccionada." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.category}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.stock)}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.exits)}</TableCell>
                  <TableCell className={`text-right text-xs font-medium ${r.rotation > 0 && r.rotation < 1 ? 'text-destructive' : ''}`}>{r.rotation.toFixed(2)}×</TableCell>
                  <TableCell className="text-right text-xs">{Number.isFinite(r.days_inventory) ? `${Math.round(r.days_inventory)} d` : '∞'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Rotación de Inventario', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Rotación de Inventario', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Rotación de Inventario', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 10: Cierre de Temporada
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonRow {
  id: string
  name: string
  status: 'planning' | 'active' | 'closing' | 'closed'
  start_date: string
  end_date: string
}

interface CierreStockRaw {
  item_id: string
  quantity: number
  avg_cost_mxn: number
  item?: { sku: string; name: string; category?: { name: string } | null } | null
}

interface CierreMovementRaw {
  movement_type: string
  status: string
  total_mxn: number | null
}

function CierreTemporadaReport({ orgName }: { orgName: string }) {
  const { activeSeason, organization } = useAuth()

  // Seasons picker: closed/closing first, then active, then planning.
  const { data: seasons = [], isLoading: loadingSeasons } = useQuery<SeasonRow[]>({
    queryKey: ['seasons-list', organization?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('seasons')
        .select('id, name, status, start_date, end_date')
        .eq('organization_id', organization?.id)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as SeasonRow[]
    },
    enabled: !!organization?.id,
  })

  const sortedSeasons = useMemo(() => {
    const priority: Record<SeasonRow['status'], number> = {
      closed: 0,
      closing: 1,
      active: 2,
      planning: 3,
    }
    return [...seasons].sort((a, b) => {
      const pa = priority[a.status] ?? 4
      const pb = priority[b.status] ?? 4
      if (pa !== pb) return pa - pb
      return b.start_date.localeCompare(a.start_date)
    })
  }, [seasons])

  const defaultSeasonId =
    sortedSeasons.find((s) => s.status === 'closed' || s.status === 'closing')?.id ??
    activeSeason?.id ??
    sortedSeasons[0]?.id ??
    ''

  const [seasonId, setSeasonId] = useState<string>(defaultSeasonId)

  // When sortedSeasons resolves and seasonId is empty, hydrate.
  const effectiveSeasonId = seasonId || defaultSeasonId
  const selectedSeason = sortedSeasons.find((s) => s.id === effectiveSeasonId)

  const { data: stock = [], isLoading: loadingStock, error: stockError } = useQuery<CierreStockRaw[]>({
    queryKey: ['cierre-stock', effectiveSeasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select(`
          item_id, quantity, avg_cost_mxn,
          item:items(sku, name, category:categories(name))
        `)
        .eq('season_id', effectiveSeasonId)
        .gt('quantity', 0)
      if (error) throw error
      return data as CierreStockRaw[]
    },
    enabled: !!effectiveSeasonId,
  })

  const { data: movements = [], isLoading: loadingMov, error: movError } = useQuery<CierreMovementRaw[]>({
    queryKey: ['cierre-movements', effectiveSeasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('stock_movements')
        .select('movement_type, status, total_mxn')
        .eq('season_id', effectiveSeasonId)
        .eq('status', 'posted')
      if (error) throw error
      return data as CierreMovementRaw[]
    },
    enabled: !!effectiveSeasonId,
  })

  const isLoading = loadingSeasons || loadingStock || loadingMov
  const error = stockError ?? movError

  const rows = useMemo(
    () =>
      stock.map((s) => ({
        item_id: s.item_id,
        sku: s.item?.sku ?? '—',
        name: s.item?.name ?? '—',
        category: s.item?.category?.name ?? '—',
        quantity: s.quantity,
        cost_unit: s.avg_cost_mxn ?? 0,
        value: s.quantity * (s.avg_cost_mxn ?? 0),
      })),
    [stock],
  )

  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows])
  const itemCount = useMemo(() => new Set(rows.map((r) => r.item_id)).size, [rows])
  const entradas = useMemo(
    () => movements
      .filter((m) => m.movement_type.startsWith('entry_'))
      .reduce((s, m) => s + (m.total_mxn ?? 0), 0),
    [movements],
  )
  const salidas = useMemo(
    () => movements
      .filter((m) => m.movement_type.startsWith('exit_'))
      .reduce((s, m) => s + (m.total_mxn ?? 0), 0),
    [movements],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (rows.length === 0 && movements.length === 0) return []
    return [
      { label: 'Valor inventario', value: formatMoney(totalValue, 'MXN'), tone: 'success', icon: DollarSign, hint: 'Al cierre' },
      { label: '# Ítems con stock', value: itemCount,                     tone: 'info',    icon: Boxes,      hint: `${rows.length} ubicaciones` },
      { label: 'Costo entradas',    value: formatMoney(entradas, 'MXN'),  tone: 'default', icon: Truck,      hint: 'Temporada completa' },
      { label: 'Costo salidas',     value: formatMoney(salidas, 'MXN'),   tone: 'default', icon: TrendingDown, hint: 'Temporada completa' },
    ]
  }, [rows, movements, totalValue, itemCount, entradas, salidas])

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      map.set(r.category, (map.get(r.category) ?? 0) + r.value)
    }
    return Array.from(map.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
  }, [rows])

  const HEAD = ['SKU', 'Nombre', 'Categoría', 'Stock final', 'Costo unit', 'Valor MXN']

  function buildRows() {
    return rows.map((r) => [
      r.sku,
      r.name,
      r.category,
      formatQuantity(r.quantity),
      formatMoney(r.cost_unit, 'MXN'),
      formatMoney(r.value, 'MXN'),
    ])
  }

  const footRow = ['', '', '', '', 'TOTAL', formatMoney(totalValue, 'MXN')]
  const filtersLabel = `Temporada: ${selectedSeason?.name ?? '—'} (${selectedSeason?.status ?? '—'})`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Temporada</Label>
          <Select value={effectiveSeasonId} onValueChange={(v) => setSeasonId(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar temporada…" />
            </SelectTrigger>
            <SelectContent>
              {sortedSeasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {s.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {(rows.length > 0 || movements.length > 0) && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top categorías por valor final"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={categoryBreakdown} yAxisWidth={140} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {!effectiveSeasonId ? (
        <EmptyState title="Selecciona una temporada" description="Elige una temporada para ver el snapshot del inventario al cierre." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin inventario" description="No se encontraron ítems con stock para la temporada seleccionada." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.item_id}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.category}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.quantity)}</TableCell>
                  <TableCell className="text-right text-xs">
                    <MoneyDisplay amount={r.cost_unit} currency="MXN" />
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    <MoneyDisplay amount={r.value} currency="MXN" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totalValue} currency="MXN" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Cierre de Temporada', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Cierre de Temporada', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Cierre de Temporada', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 11: Auditoría por Usuario
// ─────────────────────────────────────────────────────────────────────────────

interface AuditRowRaw {
  id: number
  occurred_at: string
  user_id: string | null
  user_email: string | null
  action: string
}

interface AuditUserStat {
  user_id: string
  display: string
  insert: number
  update: number
  delete: number
  total: number
  last_at: string
}

function AuditoriaUsuarioReport({ orgName }: { orgName: string }) {
  const { organization } = useAuth()
  const today = new Date()
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>(defaultFrom)
  const [dateTo, setDateTo]     = useState<string>(todayStr)

  const { data: logs = [], isLoading, error } = useQuery<AuditRowRaw[]>({
    queryKey: ['audit-log-report', { orgId: organization?.id, dateFrom, dateTo }],
    queryFn: async () => {
      let q = db
        .from('audit_log')
        .select('id, occurred_at, user_id, user_email, action')
        .eq('organization_id', organization?.id)
        .order('occurred_at', { ascending: false })
        .limit(5000)
      if (dateFrom) q = q.gte('occurred_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('occurred_at', `${dateTo}T23:59:59`)
      const { data, error } = await q
      if (error) throw error
      return data as AuditRowRaw[]
    },
    enabled: !!organization?.id,
  })

  const stats = useMemo<AuditUserStat[]>(() => {
    const map = new Map<string, AuditUserStat>()
    for (const l of logs) {
      const key = l.user_id ?? l.user_email ?? '__anon__'
      if (!map.has(key)) {
        map.set(key, {
          user_id: key,
          display: l.user_email ?? l.user_id ?? 'Anónimo',
          insert: 0,
          update: 0,
          delete: 0,
          total: 0,
          last_at: l.occurred_at,
        })
      }
      const row = map.get(key)!
      const action = (l.action ?? '').toUpperCase()
      if (action.includes('INSERT') || action === 'CREATE') row.insert++
      else if (action.includes('UPDATE') || action === 'EDIT') row.update++
      else if (action.includes('DELETE') || action === 'REMOVE') row.delete++
      row.total++
      if (l.occurred_at > row.last_at) row.last_at = l.occurred_at
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [logs])

  const totalActions = logs.length
  const mostCommonAction = useMemo(() => {
    const counts = { INSERT: 0, UPDATE: 0, DELETE: 0, OTHER: 0 }
    for (const l of logs) {
      const a = (l.action ?? '').toUpperCase()
      if (a.includes('INSERT') || a === 'CREATE') counts.INSERT++
      else if (a.includes('UPDATE') || a === 'EDIT') counts.UPDATE++
      else if (a.includes('DELETE') || a === 'REMOVE') counts.DELETE++
      else counts.OTHER++
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[1] > 0 ? sorted[0][0] : '—'
  }, [logs])

  const kpis: KpiTile[] = useMemo(() => {
    if (logs.length === 0) return []
    const top = stats[0]
    return [
      { label: 'Usuarios activos', value: stats.length,           tone: 'info',     icon: Users,       hint: 'En el período' },
      { label: '# Acciones',       value: totalActions,           tone: 'default',  icon: Activity,    hint: 'Total registrado' },
      { label: 'Acción más común', value: mostCommonAction,       tone: 'default',  icon: ListChecks,  hint: 'Operación dominante' },
      { label: 'Usuario más activo', value: top ? top.display : '—', tone: 'success', icon: ShieldCheck, hint: top ? `${top.total} acciones` : '' },
    ]
  }, [logs, stats, totalActions, mostCommonAction])

  const chartData = useMemo(
    () =>
      stats.slice(0, 10).map((s) => ({
        user: s.display.length > 22 ? `${s.display.slice(0, 20)}…` : s.display,
        INSERT: s.insert,
        UPDATE: s.update,
        DELETE: s.delete,
      })),
    [stats],
  )

  const HEAD = ['Usuario', '# INSERT', '# UPDATE', '# DELETE', 'Última actividad']

  function buildRows() {
    return stats.map((s) => [
      s.display,
      s.insert,
      s.update,
      s.delete,
      formatFechaCorta(s.last_at),
    ])
  }

  const filtersLabel = `${dateFrom} – ${dateTo}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {logs.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top 10 usuarios por acción"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportAuditStackedBarChart data={chartData} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : logs.length === 0 ? (
        <EmptyState title="Sin actividad" description="No hay registros de auditoría en el período seleccionado." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell className="text-xs font-medium">{s.display}</TableCell>
                  <TableCell className="text-right text-xs">{s.insert}</TableCell>
                  <TableCell className="text-right text-xs">{s.update}</TableCell>
                  <TableCell className="text-right text-xs">{s.delete}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatFechaCorta(s.last_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {stats.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Auditoría por Usuario', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Auditoría por Usuario', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Auditoría por Usuario', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 12: Conversiones de Moneda
// ─────────────────────────────────────────────────────────────────────────────

interface FxRateRow {
  id: string
  date: string
  rate: number
  source: string
}

function ConversionesMonedaReport({ orgName }: { orgName: string }) {
  const { organization } = useAuth()

  const { data: rates = [], isLoading, error } = useQuery<FxRateRow[]>({
    queryKey: ['fx-rates-report', organization?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('fx_rates')
        .select('id, date, rate, source')
        .eq('organization_id', organization?.id)
        .eq('currency_from', 'USD')
        .eq('currency_to', 'MXN')
        .order('date', { ascending: false })
        .limit(365)
      if (error) throw error
      return data as FxRateRow[]
    },
    enabled: !!organization?.id,
  })

  // Newest first → reverse for chart timeline (oldest → newest).
  const chronological = useMemo(() => [...rates].reverse(), [rates])

  const chartData = useMemo(
    () =>
      chronological.map((r) => ({
        date: r.date.slice(5), // mm-dd shorthand for the axis
        rate: r.rate,
      })),
    [chronological],
  )

  const kpis: KpiTile[] = useMemo(() => {
    if (rates.length === 0) return []
    const current = rates[0].rate
    const avg = rates.reduce((s, r) => s + r.rate, 0) / rates.length
    const min = Math.min(...rates.map((r) => r.rate))
    const max = Math.max(...rates.map((r) => r.rate))
    return [
      { label: 'TC actual',        value: current.toFixed(4),               tone: 'info',     icon: DollarSign, hint: rates[0].date },
      { label: 'Promedio período', value: avg.toFixed(4),                   tone: 'default',  icon: Activity,   hint: `${rates.length} días` },
      { label: 'Mínimo',           value: min.toFixed(4),                   tone: 'success',  icon: TrendingDown, hint: 'Período' },
      { label: 'Máximo',           value: max.toFixed(4),                   tone: 'warning',  icon: TrendingUp,   hint: 'Período' },
    ]
  }, [rates])

  const HEAD = ['Fecha', 'Rate', 'Variación vs anterior', 'Fuente']

  function buildRows() {
    // Iterate newest-first; "previous" in user terms means the next entry (older date).
    return rates.map((r, idx) => {
      const prev = idx < rates.length - 1 ? rates[idx + 1].rate : null
      const variation = prev && prev > 0 ? ((r.rate - prev) / prev) * 100 : null
      return [
        r.date,
        r.rate.toFixed(4),
        variation === null ? '—' : `${variation >= 0 ? '+' : ''}${variation.toFixed(2)}%`,
        r.source,
      ]
    })
  }

  const filtersLabel = `Último año · ${rates.length} registros`

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {rates.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Histórico USD / MXN"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportFxHistoryLineChart data={chartData} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : rates.length === 0 ? (
        <EmptyState title="Sin tipos de cambio" description="No hay registros de tipo de cambio en el último año." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r, idx) => {
                const prev = idx < rates.length - 1 ? rates[idx + 1].rate : null
                const variation = prev && prev > 0 ? ((r.rate - prev) / prev) * 100 : null
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.date}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums font-medium">{r.rate.toFixed(4)}</TableCell>
                    <TableCell className={`text-right text-xs font-medium ${variation === null ? 'text-muted-foreground' : variation >= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {variation === null ? '—' : `${variation >= 0 ? '+' : ''}${variation.toFixed(2)}%`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rates.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Conversiones de Moneda', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Conversiones de Moneda', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Conversiones de Moneda', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 13: Cuentas por Pagar Aging
// ─────────────────────────────────────────────────────────────────────────────

interface ApAgingRow {
  id: string
  supplier_id: string | null
  supplier_name: string
  invoice_folio: string | null
  due_date: string | null
  total: number
  currency: string
  status: string
  paid_at: string | null
  bucket: string
  days_overdue: number | null
}

const BUCKET_LABEL: Record<string, string> = {
  al_corriente: 'Al corriente',
  d_0_30: '0–30 días',
  d_31_60: '31–60 días',
  d_61_90: '61–90 días',
  d_90_plus: '+90 días',
  paid: 'Pagada',
  sin_vencimiento: 'Sin vencimiento',
}

const BUCKET_TONE: Record<string, 'default' | 'success' | 'info' | 'warning' | 'destructive'> = {
  al_corriente: 'success',
  d_0_30: 'info',
  d_31_60: 'warning',
  d_61_90: 'warning',
  d_90_plus: 'destructive',
  paid: 'default',
  sin_vencimiento: 'default',
}

function CuentasPorPagarReport({ orgName }: { orgName: string }) {
  const { organization } = useAuth()
  const { data: suppliers = [] } = useSuppliers()
  const [bucket, setBucket]         = useState<string>('all')
  const [supplierId, setSupplierId] = useState<string>('all')

  const { data: rows = [], isLoading, error } = useQuery<ApAgingRow[]>({
    queryKey: ['ap-aging-report', { orgId: organization?.id, bucket, supplierId }],
    queryFn: async () => {
      let q = db
        .from('ap_aging')
        .select('id, supplier_id, supplier_name, invoice_folio, due_date, total, currency, status, paid_at, bucket, days_overdue')
        .eq('organization_id', organization?.id)
        .order('days_overdue', { ascending: false, nullsFirst: false })
      if (bucket !== 'all') q = q.eq('bucket', bucket)
      if (supplierId !== 'all') q = q.eq('supplier_id', supplierId)
      const { data, error } = await q
      if (error) throw error
      return data as ApAgingRow[]
    },
    enabled: !!organization?.id,
  })

  // Aggregate amount + count per bucket. Convert USD → MXN with a simple flag
  // (raw amount is shown in its own currency for the table; KPIs are in MXN).
  const byBucket = useMemo(() => {
    const order = ['al_corriente', 'd_0_30', 'd_31_60', 'd_61_90', 'd_90_plus']
    const map = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      if (r.status === 'paid') continue
      if (!order.includes(r.bucket)) continue
      const cur = map.get(r.bucket) ?? { total: 0, count: 0 }
      cur.total += r.total ?? 0
      cur.count += 1
      map.set(r.bucket, cur)
    }
    return order
      .filter((b) => map.has(b))
      .map((b) => ({
        label: BUCKET_LABEL[b] ?? b,
        amount: map.get(b)!.total,
        count: map.get(b)!.count,
      }))
  }, [rows])

  const kpis: KpiTile[] = useMemo(() => {
    if (rows.length === 0) return []
    const pending = rows.filter((r) => r.status !== 'paid')
    const overdue = pending.filter((r) => (r.days_overdue ?? 0) > 0)
    const totalPending = pending.reduce((s, r) => s + (r.total ?? 0), 0)
    const totalOverdue = overdue.reduce((s, r) => s + (r.total ?? 0), 0)
    const maxOverdue = overdue.reduce((m, r) => Math.max(m, r.days_overdue ?? 0), 0)
    return [
      { label: 'Saldo total',          value: formatMoney(totalPending, 'MXN'),  tone: 'info',        icon: CreditCard, hint: 'Pendiente de pago' },
      { label: 'Vencido total',        value: formatMoney(totalOverdue, 'MXN'),  tone: totalOverdue > 0 ? 'warning' : 'success', icon: AlertTriangle, hint: `${overdue.length} facturas` },
      { label: '# Facturas pendientes', value: pending.length,                    tone: 'default',     icon: Receipt,    hint: `${rows.length} en total` },
      { label: 'Mayor mora',            value: maxOverdue > 0 ? `${maxOverdue} d` : '—', tone: maxOverdue > 60 ? 'critical' : 'default', icon: CalendarClock, hint: 'Días de atraso' },
    ]
  }, [rows])

  const chartData = useMemo(
    () => byBucket.map((b) => ({ label: `${b.label} (${b.count})`, amount: b.amount })),
    [byBucket],
  )

  const HEAD = ['Factura', 'Proveedor', 'Vencimiento', 'Días mora', 'Monto', 'Status']

  function buildRows() {
    return rows.map((r) => [
      r.invoice_folio ?? '—',
      r.supplier_name,
      r.due_date ?? '—',
      r.days_overdue !== null && r.days_overdue !== undefined ? r.days_overdue : '—',
      formatMoney(r.total ?? 0, (r.currency as 'MXN' | 'USD') ?? 'MXN'),
      r.status,
    ])
  }

  const filtersLabel = `Bucket: ${bucket === 'all' ? 'Todos' : (BUCKET_LABEL[bucket] ?? bucket)} | Proveedor: ${supplierId === 'all' ? 'Todos' : (suppliers.find((s) => s.id === supplierId)?.name ?? supplierId)}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Bucket</Label>
          <Select value={bucket} onValueChange={(v) => setBucket(v ?? 'all')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los buckets</SelectItem>
              <SelectItem value="al_corriente">Al corriente</SelectItem>
              <SelectItem value="d_0_30">0–30 días</SelectItem>
              <SelectItem value="d_31_60">31–60 días</SelectItem>
              <SelectItem value="d_61_90">61–90 días</SelectItem>
              <SelectItem value="d_90_plus">+90 días</SelectItem>
              <SelectItem value="paid">Pagadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Proveedor</Label>
          <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? 'all')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {rows.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Aging por bucket"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={chartData} yAxisWidth={140} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin facturas" description="No se encontraron facturas de proveedor con los filtros seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tone = BUCKET_TONE[r.bucket] ?? 'default'
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.invoice_folio ?? '—'}</TableCell>
                    <TableCell className="text-xs font-medium">{r.supplier_name}</TableCell>
                    <TableCell className="text-xs">{r.due_date ?? '—'}</TableCell>
                    <TableCell className={`text-right text-xs font-medium ${(r.days_overdue ?? 0) > 60 ? 'text-destructive' : (r.days_overdue ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                      {r.days_overdue !== null && r.days_overdue !== undefined ? `${r.days_overdue} d` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <MoneyDisplay amount={r.total ?? 0} currency={(r.currency as 'MXN' | 'USD') ?? 'MXN'} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge
                        variant={tone === 'destructive' ? 'destructive' : tone === 'success' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {BUCKET_LABEL[r.bucket] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Cuentas por Pagar', HEAD, buildRows() as (string | number)[][])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Cuentas por Pagar', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Cuentas por Pagar', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 14: Costo de Mantenimiento por Equipo
// ─────────────────────────────────────────────────────────────────────────────

interface MantenimientoWoRaw {
  id: string
  equipment_id: string
  total_cost_mxn: number | null
  downtime_minutes: number | null
  created_at: string
  equipment?: { id: string; name: string; code: string; type: string } | null
}

interface MantenimientoRow {
  equipment_id: string
  code: string
  name: string
  type: string
  count: number
  downtime_h: number
  cost: number
}

function CostoMantenimientoEquipoReport({ orgName }: { orgName: string }) {
  const { organization } = useAuth()
  const { data: equipment = [] } = useEquipment()
  void equipment // referenced via the type filter only
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>(yearAgo)
  const [dateTo, setDateTo]     = useState<string>(todayStr)
  const [equipType, setEquipType] = useState<string>('all')

  const { data: wos = [], isLoading, error } = useQuery<MantenimientoWoRaw[]>({
    queryKey: ['mantenimiento-wo', { orgId: organization?.id, dateFrom, dateTo, equipType }],
    queryFn: async () => {
      let q = db
        .from('work_orders')
        .select(`
          id, equipment_id, total_cost_mxn, downtime_minutes, created_at,
          equipment:equipment!inner(id, name, code, type)
        `)
        .eq('organization_id', organization?.id)
        .is('deleted_at', null)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
      if (equipType !== 'all') q = q.eq('equipment.type', equipType)
      const { data, error } = await q
      if (error) throw error
      return (data as MantenimientoWoRaw[]).filter((w) => w.equipment)
    },
    enabled: !!organization?.id,
  })

  const grouped = useMemo<MantenimientoRow[]>(() => {
    const map = new Map<string, MantenimientoRow>()
    for (const w of wos) {
      const eid = w.equipment_id
      if (!map.has(eid)) {
        map.set(eid, {
          equipment_id: eid,
          code: w.equipment?.code ?? '—',
          name: w.equipment?.name ?? '—',
          type: w.equipment?.type ?? '—',
          count: 0,
          downtime_h: 0,
          cost: 0,
        })
      }
      const row = map.get(eid)!
      row.count++
      row.downtime_h += (w.downtime_minutes ?? 0) / 60
      row.cost += w.total_cost_mxn ?? 0
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost)
  }, [wos])

  const totals = useMemo(() => ({
    cost: grouped.reduce((s, r) => s + r.cost, 0),
    downtime: grouped.reduce((s, r) => s + r.downtime_h, 0),
  }), [grouped])

  const kpis: KpiTile[] = useMemo(() => {
    if (grouped.length === 0) return []
    const avg = totals.cost / grouped.length
    const top = grouped[0]
    return [
      { label: 'Costo total año',  value: formatMoney(totals.cost, 'MXN'), tone: 'success', icon: DollarSign, hint: 'En el período' },
      { label: '# Equipos',        value: grouped.length,                  tone: 'info',    icon: Wrench,     hint: 'Con OTs' },
      { label: 'Promedio / equipo', value: formatMoney(avg, 'MXN'),         tone: 'default', icon: Gauge,      hint: 'Costo medio' },
      { label: 'Equipo más caro',  value: top?.code ?? '—',                tone: 'warning', icon: AlertTriangle, hint: top ? formatMoney(top.cost, 'MXN') : '' },
    ]
  }, [grouped, totals])

  const topEquipos = useMemo(
    () => grouped.slice(0, 8).map((r) => ({ label: r.code, amount: r.cost })),
    [grouped],
  )

  const HEAD = ['Equipo', 'Tipo', '# OTs', 'Downtime hrs', 'Costo MXN', 'Costo/h']

  function buildRows() {
    return grouped.map((r) => [
      `${r.code} – ${r.name}`,
      r.type,
      r.count,
      formatQuantity(r.downtime_h, 1),
      formatMoney(r.cost, 'MXN'),
      r.downtime_h > 0 ? formatMoney(r.cost / r.downtime_h, 'MXN') : '—',
    ])
  }

  const footRow = [
    'TOTAL',
    '',
    grouped.reduce((s, r) => s + r.count, 0),
    formatQuantity(totals.downtime, 1),
    formatMoney(totals.cost, 'MXN'),
    '',
  ]
  const filtersLabel = `${dateFrom} – ${dateTo} | Tipo: ${equipType === 'all' ? 'Todos' : equipType}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Tipo equipo</Label>
          <Select value={equipType} onValueChange={(v) => setEquipType(v ?? 'all')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="tractor">Tractor</SelectItem>
              <SelectItem value="implement">Implemento</SelectItem>
              <SelectItem value="vehicle">Vehículo</SelectItem>
              <SelectItem value="pump">Bomba</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{formatSupabaseError(error).description}</p>
      )}

      {grouped.length > 0 && (
        <ReportMiniDashboard
          kpis={kpis}
          chartTitle="Top equipos por costo"
          chart={
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <ReportHorizontalAmountBarChart data={topEquipos} yAxisWidth={120} />
            </Suspense>
          }
          isLoading={isLoading}
        />
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin órdenes de trabajo" description="No se encontraron OTs para los filtros seleccionados." />
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEAD.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((r) => (
                <TableRow key={r.equipment_id}>
                  <TableCell className="text-xs font-medium">{r.code} – {r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.type}</TableCell>
                  <TableCell className="text-center text-xs">{r.count}</TableCell>
                  <TableCell className="text-right text-xs">{formatQuantity(r.downtime_h, 1)} h</TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    <MoneyDisplay amount={r.cost} currency="MXN" />
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {r.downtime_h > 0 ? <MoneyDisplay amount={r.cost / r.downtime_h} currency="MXN" /> : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-center text-xs font-semibold">{grouped.reduce((s, r) => s + r.count, 0)}</TableCell>
                <TableCell className="text-right text-xs font-semibold">{formatQuantity(totals.downtime, 1)} h</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  <MoneyDisplay amount={totals.cost} currency="MXN" />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadReportCsv('Costo Mantenimiento Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileDown className="mr-1.5 size-3.5" />
            Descargar CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Costo Mantenimiento Equipo', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Costo Mantenimiento Equipo', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow as (string | number)[])}>
            <Download className="mr-1.5 size-3.5" />
            Descargar PDF
          </Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportViewerPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const basePath = useBasePath()
  const { organization } = useAuth()

  // Mantén el mismo prefijo de ruta al volver al índice.
  const reportsRoot = location.pathname.startsWith('/direccion/reportes')
    ? '/direccion/reportes'
    : location.pathname.startsWith('/gerente/reportes')
    ? '/gerente/reportes'
    : location.pathname.startsWith('/reportes')
    ? '/reportes'
    : `${basePath}/reportes`

  const meta = REPORT_META[slug]
  const orgName = organization?.name ?? 'AgriStock'

  if (!meta) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => navigate(reportsRoot)}>
          <ArrowLeft className="size-3.5" />
          Reportes
        </Button>
        <EmptyState title="Reporte no encontrado" description={`No existe ningún reporte con el slug "${slug}".`} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back + header */}
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(reportsRoot)}
        >
          <ArrowLeft className="size-3.5" />
          Reportes
        </Button>
        <PageHeader
          title={meta.title}
          description={meta.description}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {slug === 'kardex' && <KardexReport orgName={orgName} />}
          {slug === 'existencias' && <ExistenciasReport orgName={orgName} />}
          {slug === 'entradas-proveedor' && <EntradasProveedorReport orgName={orgName} />}
          {slug === 'salidas-lote' && <SalidasLoteReport orgName={orgName} />}
          {slug === 'consumo-diesel' && <ConsumoDieselReport orgName={orgName} />}
          {slug === 'diesel-por-equipo' && <DieselPorEquipoReport orgName={orgName} />}
          {slug === 'sin-movimiento' && <SinMovimientoReport orgName={orgName} />}
          {slug === 'variacion-precios' && <VariacionPreciosReport orgName={orgName} />}
          {slug === 'salidas-equipo' && <SalidasEquipoReport orgName={orgName} />}
          {slug === 'rotacion' && <RotacionReport orgName={orgName} />}
          {slug === 'cierre-temporada' && <CierreTemporadaReport orgName={orgName} />}
          {slug === 'auditoria-usuario' && <AuditoriaUsuarioReport orgName={orgName} />}
          {slug === 'conversiones-moneda' && <ConversionesMonedaReport orgName={orgName} />}
          {slug === 'cuentas-por-pagar' && <CuentasPorPagarReport orgName={orgName} />}
          {slug === 'costo-mantenimiento-equipo' && <CostoMantenimientoEquipoReport orgName={orgName} />}

          {![
            'kardex', 'existencias', 'entradas-proveedor', 'salidas-lote', 'consumo-diesel',
            'diesel-por-equipo', 'sin-movimiento', 'variacion-precios', 'salidas-equipo',
            'rotacion', 'cierre-temporada', 'auditoria-usuario', 'conversiones-moneda',
            'cuentas-por-pagar', 'costo-mantenimiento-equipo',
          ].includes(slug) && (
            <ComingSoon title={meta.title} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
