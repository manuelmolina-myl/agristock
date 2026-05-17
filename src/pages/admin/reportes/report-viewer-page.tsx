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
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { useAuth } from '@/hooks/use-auth'
import { useItems, useWarehouses, useSuppliers, useCropLots } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'
import { exportToCsv } from '@/lib/csv-export'

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
  rotacion:             { slug: 'rotacion',              title: 'Rotación de Inventario',  description: 'Índice de rotación por ítem' },
  'sin-movimiento':     { slug: 'sin-movimiento',        title: 'Ítems sin Movimiento',    description: 'Ítems sin movimiento en el período' },
  'variacion-precios':  { slug: 'variacion-precios',     title: 'Variación de Precios',    description: 'Comparativa de precios en el tiempo' },
  'cierre-temporada':   { slug: 'cierre-temporada',      title: 'Cierre de Temporada',     description: 'Resumen ejecutivo al cierre de temporada' },
  'auditoria-usuario':  { slug: 'auditoria-usuario',     title: 'Auditoría por Usuario',   description: 'Acciones por usuario' },
  'conversiones-moneda':{ slug: 'conversiones-moneda',   title: 'Conversiones de Moneda',  description: 'Tipos de cambio aplicados' },
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
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
          {slug === 'sin-movimiento' && <SinMovimientoReport orgName={orgName} />}
          {slug === 'variacion-precios' && <VariacionPreciosReport orgName={orgName} />}

          {!['kardex', 'existencias', 'entradas-proveedor', 'salidas-lote', 'consumo-diesel', 'sin-movimiento', 'variacion-precios'].includes(slug) && (
            <ComingSoon title={meta.title} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
