import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowDownToLine, Loader2, CheckCheck, AlertCircle } from 'lucide-react'

import { useProcessReception } from '@/features/compras/hooks'
import type { PurchaseOrder, POLine } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface POWithLines extends PurchaseOrder {
  lines?: POLine[]
  warehouse?: { name: string; code: string | null } | null
}

interface LineState {
  po_line_id: string
  received_qty: string
  accepted_qty: string
  rejection_reason: string
  supplier_lot: string
  expiry_date: string
  notes: string
}

interface Props {
  open: boolean
  po: POWithLines
  onClose: () => void
}

export function ReceptionWizard({ open, po, onClose }: Props) {
  const { mutate, isPending } = useProcessReception()

  // Warehouse selector — default to PO's destination warehouse if set
  const { data: warehouses = [] } = useQuery<Array<{ id: string; name: string; code: string | null }>>({
    queryKey: ['warehouses-list'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('warehouses')
        .select('id, name, code')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data
    },
  })

  const [warehouseId, setWarehouseId] = useState<string>(po.destination_warehouse_id ?? '')
  const [supplierNote, setSupplierNote] = useState('')
  const [qualityNotes, setQualityNotes] = useState('')
  const [lines, setLines] = useState<LineState[]>([])

  // Seed line state when dialog opens or PO lines change.
  useEffect(() => {
    if (!open) return
    setWarehouseId(po.destination_warehouse_id ?? warehouses[0]?.id ?? '')
    setLines((po.lines ?? []).map((l) => {
      const pending = Math.max(l.quantity - l.received_quantity, 0)
      return {
        po_line_id:       l.id,
        received_qty:     pending > 0 ? String(pending) : '0',
        accepted_qty:     pending > 0 ? String(pending) : '0',
        rejection_reason: '',
        supplier_lot:     '',
        expiry_date:      '',
        notes:            '',
      }
    }))
  }, [open, po.id, po.destination_warehouse_id, po.lines, warehouses])

  const setLineField = (idx: number, field: keyof LineState, value: string) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  // Auto-mirror received to accepted unless user changed accepted independently.
  const handleReceivedChange = (idx: number, value: string) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      const accept = Number(l.received_qty) === Number(l.accepted_qty) ? value : l.accepted_qty
      return { ...l, received_qty: value, accepted_qty: accept }
    }))
  }

  const totals = useMemo(() => {
    let received = 0, accepted = 0, rejected = 0
    for (const l of lines) {
      const r = Number(l.received_qty) || 0
      const a = Number(l.accepted_qty) || 0
      received += r
      accepted += a
      rejected += Math.max(0, r - a)
    }
    return { received, accepted, rejected }
  }, [lines])

  const hasAnyAccepted = totals.accepted > 0
  const allRejected    = totals.received > 0 && totals.accepted === 0

  const onSubmit = () => {
    if (!warehouseId) {
      toast.error('Selecciona el almacén destino')
      return
    }
    if (totals.received <= 0) {
      toast.error('Captura al menos una cantidad recibida > 0')
      return
    }
    // Validate accepted ≤ received per line.
    for (const l of lines) {
      const r = Number(l.received_qty) || 0
      const a = Number(l.accepted_qty) || 0
      if (a > r) {
        toast.error('Aceptado no puede exceder recibido', {
          description: 'Revisa las cantidades antes de continuar.',
        })
        return
      }
      if (r > a && !l.rejection_reason.trim()) {
        toast.error('Indica motivo de rechazo', {
          description: 'Las líneas con cantidad rechazada necesitan una razón.',
        })
        return
      }
    }

    mutate({
      po_id: po.id,
      warehouse_id: warehouseId,
      supplier_note: supplierNote || null,
      quality_notes: qualityNotes || null,
      photos: [],
      lines: lines
        .filter((l) => Number(l.received_qty) > 0)
        .map((l) => ({
          po_line_id:       l.po_line_id,
          received_qty:     Number(l.received_qty),
          accepted_qty:     Number(l.accepted_qty),
          rejection_reason: l.rejection_reason || null,
          supplier_lot:     l.supplier_lot || null,
          expiry_date:      l.expiry_date || null,
          notes:            l.notes || null,
        })),
    }, {
      onSuccess: () => {
        toast.success('Recepción registrada', {
          description: hasAnyAccepted
            ? 'El movimiento de inventario y el costo promedio se actualizaron.'
            : 'Material rechazado registrado para auditoría.',
        })
        onClose()
      },
      onError: (e) => {
        const { title, description } = formatSupabaseError(e, 'No se pudo registrar la recepción')
        toast.error(title, { description })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="!max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="size-4 text-success" strokeWidth={2} />
            Recepción de OC <span className="font-mono">{po.folio}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Warehouse + delivery note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Almacén destino <span className="text-destructive">*</span></Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code ? `${w.code} — ` : ''}{w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-note">Nota de remisión del proveedor</Label>
              <Input
                id="supplier-note"
                value={supplierNote}
                onChange={(e) => setSupplierNote(e.target.value)}
                placeholder="Folio remisión / referencia"
                className="h-9"
              />
            </div>
          </div>

          {/* Lines table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Ítem</th>
                  <th className="px-2 py-2 text-right font-medium">Pedido</th>
                  <th className="px-2 py-2 text-right font-medium">Recibido</th>
                  <th className="px-2 py-2 text-right font-medium">Aceptado</th>
                  <th className="px-2 py-2 text-left font-medium">Motivo rechazo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(po.lines ?? []).map((l, idx) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const itemRel = (l as any).item as { name: string; sku: string } | undefined
                  const lineState = lines[idx]
                  if (!lineState) return null
                  const r = Number(lineState.received_qty) || 0
                  const a = Number(lineState.accepted_qty) || 0
                  const rejected = Math.max(0, r - a)
                  const pendingPedido = Math.max(l.quantity - l.received_quantity, 0)
                  return (
                    <tr key={l.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 align-top">
                        <div className="text-xs font-medium truncate">{itemRel?.name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{itemRel?.sku ?? ''}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-xs align-top">
                        <div>{l.quantity.toLocaleString('es-MX')}</div>
                        {l.received_quantity > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            (faltan {pendingPedido.toLocaleString('es-MX')})
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineState.received_qty}
                          onChange={(e) => handleReceivedChange(idx, e.target.value)}
                          className="h-8 text-right font-mono tabular-nums text-xs w-24 ml-auto"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineState.accepted_qty}
                          onChange={(e) => setLineField(idx, 'accepted_qty', e.target.value)}
                          className={`h-8 text-right font-mono tabular-nums text-xs w-24 ml-auto ${rejected > 0 ? 'border-warning' : ''}`}
                        />
                        {rejected > 0 && (
                          <div className="text-[10px] text-warning mt-0.5 text-right">
                            {rejected.toLocaleString('es-MX')} rechazado
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {rejected > 0 ? (
                          <Input
                            value={lineState.rejection_reason}
                            onChange={(e) => setLineField(idx, 'rejection_reason', e.target.value)}
                            placeholder="Motivo..."
                            className="h-8 text-xs"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr className="text-xs">
                  <td className="px-3 py-2 text-muted-foreground uppercase tracking-[0.06em] text-[10px] font-medium">Totales</td>
                  <td />
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{totals.received.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-success font-medium">{totals.accepted.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-warning">
                    {totals.rejected > 0 && `${totals.rejected.toLocaleString('es-MX', { minimumFractionDigits: 2 })} rech.`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Quality notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quality">Observaciones de calidad (opcional)</Label>
            <Textarea
              id="quality"
              value={qualityNotes}
              onChange={(e) => setQualityNotes(e.target.value)}
              placeholder="Estado del material, empaque, condiciones de entrega…"
              rows={2}
            />
          </div>

          {/* Summary box */}
          {hasAnyAccepted && (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 text-xs flex items-start gap-2">
              <CheckCheck className="size-4 text-success shrink-0 mt-0.5" />
              <div>
                Al confirmar, se generará el movimiento <span className="font-mono">entry_reception</span> en
                inventario por las cantidades aceptadas y se recalculará el costo promedio del ítem.
              </div>
            </div>
          )}
          {allRejected && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs flex items-start gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div>
                Todas las cantidades están marcadas como rechazadas. No se moverá inventario;
                la recepción quedará registrada para auditoría.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            <ArrowDownToLine className="size-4" />
            {isPending ? 'Procesando…' : 'Registrar recepción'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
