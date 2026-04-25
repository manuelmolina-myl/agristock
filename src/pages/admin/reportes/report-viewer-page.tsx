import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import { ArrowLeft, Download, FileSpreadsheet, Clock } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

import { useAuth } from '@/hooks/use-auth'
import { useItems, useWarehouses, useSuppliers, useCropLots } from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { MoneyDisplay } from '@/components/custom/money-display'

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

function generatePdf(
  orgName: string,
  reportTitle: string,
  filtersLabel: string,
  head: string[],
  body: (string | number)[][][],
  footRow?: (string | number)[]
) {
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
    queryKey: ['kardex', itemId, dateFrom, dateTo, activeSeason?.id],
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

      {/* Export buttons */}
      {kardex.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Kardex General', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][])}>
            <Download className="mr-1.5 size-3.5" />
            Exportar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Kardex General', HEAD, buildRows() as (string | number)[][])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
        </div>
      )}

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
          item:items(sku, name, category:categories(name), unit:units(code)),
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

      {/* Export */}
      {stock.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Existencias Valuadas', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Exportar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Existencias Valuadas', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
        </div>
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
    queryKey: ['entradas_proveedor', activeSeason?.id, supplierId, dateFrom, dateTo],
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

      {/* Export */}
      {grouped.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Entradas por Proveedor', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow as (string | number)[])}>
            <Download className="mr-1.5 size-3.5" />
            Exportar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Entradas por Proveedor', HEAD, buildRows() as (string | number)[][], footRow as (string | number)[])}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
        </div>
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
    queryKey: ['salidas_lote', activeSeason?.id, dateFrom, dateTo],
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

      {/* Export */}
      {grouped.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generatePdf(orgName, 'Salidas por Lote', filtersLabel, HEAD, buildRows() as unknown as (string | number)[][][], footRow)}>
            <Download className="mr-1.5 size-3.5" />
            Exportar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => generateExcel('Salidas por Lote', HEAD, buildRows() as (string | number)[][], footRow)}>
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Exportar Excel
          </Button>
        </div>
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportViewerPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization } = useAuth()

  const meta = REPORT_META[slug]
  const orgName = organization?.name ?? 'AgriStock'

  if (!meta) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => navigate(`${basePath}/reportes`)}>
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
          onClick={() => navigate(`${basePath}/reportes`)}
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

          {!['kardex', 'existencias', 'entradas-proveedor', 'salidas-lote'].includes(slug) && (
            <ComingSoon title={meta.title} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
