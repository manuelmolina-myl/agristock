import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Download, FileText, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useCategories, useUnits } from '@/hooks/use-supabase-query'
import { cn } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowNum: number
  sku: string
  name: string
  description?: string
  unit_id?: string
  native_currency: 'MXN' | 'USD'
  category_id?: string
  min_stock?: number
  max_stock?: number
  reorder_point?: number
  barcode?: string
  notes?: string
  errors: string[]
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

const TEMPLATE_HEADERS = [
  'sku', 'nombre', 'descripcion', 'unidad', 'moneda',
  'categoria', 'stock_minimo', 'stock_maximo', 'punto_reorden',
  'codigo_barras', 'notas',
]

const TEMPLATE_EXAMPLE = [
  'MAT-001', 'Aceite motor 15W40', 'Aceite para tractores', 'LT', 'MXN',
  'Lubricantes', '5', '50', '10', '', '',
]

function downloadTemplate() {
  const lines = [TEMPLATE_HEADERS.join(','), TEMPLATE_EXAMPLE.join(',')]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_articulos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ItemsCsvImport({ open, onOpenChange }: Props) {
  const { organization } = useAuth()
  const orgId = organization?.id
  const queryClient = useQueryClient()

  const { data: categories = [] } = useCategories()
  const { data: units = [] } = useUnits()

  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const validRows = rows.filter((r) => r.errors.length === 0)
  const errorRows = rows.filter((r) => r.errors.length > 0)

  function parseFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Solo se aceptan archivos .csv')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) { toast.error('El archivo está vacío o solo tiene encabezados'); return }

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
      const parsed: ParsedRow[] = []

      const catMap = new Map(categories.map((c) => [c.name.toLowerCase().trim(), c.id]))
      const unitMap = new Map(units.map((u) => [u.code.toLowerCase().trim(), u.id]))

      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i])
        const get = (col: string) => {
          const idx = headers.indexOf(col)
          return idx >= 0 ? (vals[idx] ?? '').trim() : ''
        }

        const sku = get('sku')
        const name = get('nombre') || get('name')
        const errors: string[] = []

        if (!sku) errors.push('SKU es requerido')
        if (!name) errors.push('Nombre es requerido')

        const moneda = (get('moneda') || get('currency') || 'MXN').toUpperCase()
        if (moneda !== 'MXN' && moneda !== 'USD') errors.push('Moneda debe ser MXN o USD')

        const unitCode = get('unidad') || get('unit')
        let unit_id: string | undefined
        if (unitCode) {
          unit_id = unitMap.get(unitCode.toLowerCase())
          if (!unit_id) errors.push(`Unidad "${unitCode}" no encontrada`)
        }

        const catName = get('categoria') || get('category')
        let category_id: string | undefined
        if (catName) {
          category_id = catMap.get(catName.toLowerCase())
          if (!category_id) errors.push(`Categoría "${catName}" no encontrada`)
        }

        const toNum = (v: string) => v ? parseFloat(v) : undefined
        const min_stock = toNum(get('stock_minimo') || get('min_stock'))
        const max_stock = toNum(get('stock_maximo') || get('max_stock'))
        const reorder_point = toNum(get('punto_reorden') || get('reorder_point'))

        parsed.push({
          rowNum: i + 1,
          sku,
          name,
          description: get('descripcion') || get('description') || undefined,
          unit_id,
          native_currency: (moneda as 'MXN' | 'USD') || 'MXN',
          category_id,
          min_stock,
          max_stock,
          reorder_point,
          barcode: get('codigo_barras') || get('barcode') || undefined,
          notes: get('notas') || get('notes') || undefined,
          errors,
        })
      }
      setRows(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  async function handleImport() {
    if (!orgId || validRows.length === 0) return
    setImporting(true)
    try {
      const payload = validRows.map((r) => ({
        organization_id: orgId,
        sku: r.sku,
        name: r.name,
        description: r.description ?? null,
        unit_id: r.unit_id ?? null,
        native_currency: r.native_currency,
        category_id: r.category_id ?? null,
        min_stock: r.min_stock ?? null,
        max_stock: r.max_stock ?? null,
        reorder_point: r.reorder_point ?? null,
        barcode: r.barcode ?? null,
        notes: r.notes ?? null,
        is_active: true,
        is_diesel: false,
      }))

      const { error } = await db.from('items').insert(payload)
      if (error) throw error

      await queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success(`${validRows.length} artículo${validRows.length !== 1 ? 's' : ''} importados correctamente`)
      onOpenChange(false)
      setRows([])
      setFileName(null)
    } catch (err: unknown) {
      const rawMsg = (err && typeof err === 'object' && 'message' in err)
        ? String((err as { message?: unknown }).message ?? '')
        : ''
      const isDuplicate = rawMsg.includes('unique') || rawMsg.includes('duplicate')
      const { title, description } = formatSupabaseError(
        err,
        isDuplicate ? 'Algunos SKUs ya existen' : 'No se pudieron importar los artículos',
      )
      toast.error(title, { description })
    } finally {
      setImporting(false)
    }
  }

  function handleClose(open: boolean) {
    if (!open) { setRows([]); setFileName(null) }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Importar artículos desde CSV</DialogTitle>
            <Button variant="ghost" size="sm" className="text-muted-foreground h-7 gap-1.5" onClick={downloadTemplate}>
              <Download className="size-3.5" />
              Plantilla
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Columnas: sku, nombre, descripcion, unidad, moneda, categoria, stock_minimo, stock_maximo, punto_reorden, codigo_barras, notas
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {/* Drop zone */}
          <div
            className={cn(
              'relative rounded-lg border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-8 cursor-pointer',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/40',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" className="sr-only" onChange={handleFileInput} />
            {fileName ? (
              <>
                <FileText className="size-8 text-primary" />
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{rows.length} filas detectadas · haz clic para cambiar</p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arrastra un archivo .csv o <span className="text-primary font-medium">haz clic para seleccionar</span>
                </p>
              </>
            )}
          </div>

          {/* Summary */}
          {rows.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-success font-medium">
                <CheckCircle2 className="size-4" />
                {validRows.length} válido{validRows.length !== 1 ? 's' : ''}
              </span>
              {errorRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-destructive font-medium">
                  <XCircle className="size-4" />
                  {errorRows.length} con error{errorRows.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
          )}

          {/* Error list */}
          {errorRows.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 divide-y divide-destructive/20 max-h-48 overflow-y-auto">
              {errorRows.map((r) => (
                <div key={r.rowNum} className="flex items-start gap-2 px-3 py-2 text-xs">
                  <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-destructive">Fila {r.rowNum}</span>
                    {r.sku && <span className="text-destructive/70"> · {r.sku}</span>}
                    <span className="text-destructive/80">: {r.errors.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Valid preview */}
          {validRows.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="px-3 py-2 text-left font-medium">Nombre</th>
                    <th className="px-3 py-2 text-left font-medium">Unidad</th>
                    <th className="px-3 py-2 text-left font-medium">Moneda</th>
                    <th className="px-3 py-2 text-left font-medium">Categoría</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {validRows.slice(0, 10).map((r) => (
                    <tr key={r.rowNum} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.sku}</td>
                      <td className="px-3 py-1.5 font-medium text-foreground max-w-40 truncate">{r.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{units.find((u) => u.id === r.unit_id)?.code ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{r.native_currency}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{categories.find((c) => c.id === r.category_id)?.name ?? '—'}</td>
                    </tr>
                  ))}
                  {validRows.length > 10 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-1.5 text-center text-muted-foreground">
                        … y {validRows.length - 10} más
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button
            disabled={validRows.length === 0 || importing}
            onClick={handleImport}
          >
            {importing ? 'Importando…' : `Importar ${validRows.length} artículo${validRows.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
