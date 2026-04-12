import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import type { StockMovement, StockMovementLine, Organization } from '@/lib/database.types'
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'

// ─── Destination label helper ─────────────────────────────────────────────────

const DESTINATION_TYPE_LABELS: Record<string, string> = {
  crop_lot: 'Lote de cultivo',
  equipment: 'Tractor / Equipo',
  employee: 'Empleado',
  maintenance: 'Mantenimiento',
  waste: 'Merma',
  other: 'Otro',
}

function getDestinationLabel(line: StockMovementLine): string {
  const type = line.destination_type
  if (!type) return '—'

  if (type === 'crop_lot' && line.crop_lot) {
    const lot = line.crop_lot as any
    return `Lote ${lot.code ?? ''} — ${lot.crop_type ?? ''}`
  }
  if (type === 'equipment' && line.equipment) {
    const eq = line.equipment as any
    return `${eq.code ?? ''} — ${eq.name ?? ''}`
  }
  if (type === 'employee' && line.employee) {
    const emp = line.employee as any
    return `${emp.employee_code ?? ''} — ${emp.full_name ?? ''}`
  }
  return DESTINATION_TYPE_LABELS[type] ?? type
}

// ─── Main export function ─────────────────────────────────────────────────────

export function generateValePDF(
  movement: StockMovement & { lines: StockMovementLine[] },
  organization: Organization
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  const contentW = pageW - margin * 2

  // ── Colors ──────────────────────────────────────────────────────────────────
  const PRIMARY: [number, number, number] = [22, 101, 52]   // green-800
  const GRAY_DARK: [number, number, number] = [30, 30, 30]
  const GRAY_MID: [number, number, number] = [100, 100, 100]
  const GRAY_LIGHT: [number, number, number] = [230, 230, 230]
  const WHITE: [number, number, number] = [255, 255, 255]

  let y = margin

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 28, 'F')

  // Org name
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(organization.name.toUpperCase(), margin, 11)

  // RFC
  if (organization.rfc) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`RFC: ${organization.rfc}`, margin, 17)
  }

  // Document title (right side)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('VALE DE SALIDA', pageW - margin, 10, { align: 'right' })

  // Folio
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Folio: ${movement.document_number ?? '(Sin folio)'}`, pageW - margin, 17, {
    align: 'right',
  })

  // Status
  doc.setFontSize(8)
  doc.text(
    movement.status === 'posted' ? 'REGISTRADO' : movement.status === 'draft' ? 'BORRADOR' : 'CANCELADO',
    pageW - margin,
    23,
    { align: 'right' }
  )

  y = 36

  // ── Info section ─────────────────────────────────────────────────────────────
  doc.setTextColor(...GRAY_DARK)

  // Draw a light box for metadata
  doc.setDrawColor(...GRAY_LIGHT)
  doc.setFillColor(248, 250, 248)
  doc.roundedRect(margin, y, contentW, 32, 2, 2, 'FD')

  const col1x = margin + 6
  const col2x = margin + contentW / 2

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)

  doc.text('FECHA', col1x, y + 7)
  doc.text('TIPO DE MOVIMIENTO', col2x, y + 7)
  doc.text('ALMACÉN ORIGEN', col1x, y + 18)
  doc.text('DESTINO', col2x, y + 18)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_DARK)

  const movDate = movement.fx_date ?? movement.created_at
  doc.text(formatFechaCorta(movDate), col1x, y + 13)
  doc.text(MOVEMENT_TYPE_LABELS[movement.movement_type] ?? movement.movement_type, col2x, y + 13)

  const warehouseName =
    (movement.warehouse as any)?.name
      ? `${(movement.warehouse as any).code} — ${(movement.warehouse as any).name}`
      : '—'
  doc.text(warehouseName, col1x, y + 24)

  // Derive destination from first line
  const firstLine = movement.lines?.[0]
  const destinationLabel = firstLine ? getDestinationLabel(firstLine) : '—'
  doc.text(destinationLabel, col2x, y + 24)

  y += 40

  // ── Lines table ───────────────────────────────────────────────────────────────
  const tableRows = movement.lines.map((line) => {
    const item = line.item as any
    const sku = item?.sku ?? '—'
    const name = item?.name ?? line.item_id
    const qty = formatQuantity(line.quantity)
    const unit = item?.unit?.code ?? ''
    const costUnit = formatMoney(line.unit_cost_native, line.native_currency)
    const lineTotal = formatMoney(line.line_total_mxn, 'MXN')

    return [sku, name, qty, unit, costUnit, lineTotal]
  })

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Descripción', 'Cantidad', 'Unidad', 'Costo unit.', 'Total MXN']],
    body: tableRows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: GRAY_DARK,
    },
    headStyles: {
      fillColor: PRIMARY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [245, 250, 245],
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold', textColor: GRAY_MID },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 28, halign: 'right', font: 'courier' },
      5: { cellWidth: 30, halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      // Re-draw header on additional pages
      if (data.pageNumber > 1) {
        doc.setFillColor(...PRIMARY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...WHITE)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(
          `Vale de Salida — ${movement.document_number ?? ''}`,
          pageW - margin,
          7,
          { align: 'right' }
        )
      }
    },
  })

  // Get Y after table
  const finalY = (doc as any).lastAutoTable.finalY as number

  // ── Totals ────────────────────────────────────────────────────────────────────
  let totY = finalY + 6

  // Subtotal, FX, Total
  const subtotalNative = movement.lines.reduce((s, l) => s + l.line_total_native, 0)
  const totalMxn = movement.total_mxn ?? movement.lines.reduce((s, l) => s + l.line_total_mxn, 0)

  const totalsX = pageW - margin - 70
  const amountX = pageW - margin

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)
  doc.text('Subtotal:', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatMoney(subtotalNative, 'MXN'), amountX, totY, { align: 'right' })

  if (movement.fx_rate) {
    totY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(`T/C USD/MXN:`, totalsX, totY)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...GRAY_DARK)
    doc.text(movement.fx_rate.toFixed(4), amountX, totY, { align: 'right' })
  }

  // Total line
  totY += 3
  doc.setDrawColor(...GRAY_LIGHT)
  doc.line(totalsX, totY, pageW - margin, totY)
  totY += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY)
  doc.text('TOTAL MXN:', totalsX, totY)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatMoney(totalMxn, 'MXN'), amountX, totY, { align: 'right' })

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (movement.notes) {
    totY += 10
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY_MID)
    doc.text('NOTAS:', margin, totY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_DARK)
    const noteLines = doc.splitTextToSize(movement.notes, contentW - 20)
    doc.text(noteLines, margin, totY + 5)
    totY += 5 + noteLines.length * 4.5
  }

  // ── Signature boxes ───────────────────────────────────────────────────────────
  const sigY = Math.max(totY + 16, finalY + 40)

  // Check if we have space; if not, add a page
  const pageH = doc.internal.pageSize.getHeight()
  const sigH = 28
  if (sigY + sigH > pageH - 10) {
    doc.addPage()
    totY = margin
  }

  const sigBoxW = (contentW - 20) / 2
  const sig1x = margin
  const sig2x = margin + sigBoxW + 20

  const drawSignatureBox = (x: number, label: string) => {
    const boxY = Math.min(sigY, pageH - sigH - 10)
    doc.setDrawColor(...GRAY_LIGHT)
    doc.setFillColor(252, 252, 252)
    doc.roundedRect(x, boxY, sigBoxW, sigH, 1, 1, 'FD')

    // Signature line
    doc.setDrawColor(160, 160, 160)
    doc.line(x + 8, boxY + 17, x + sigBoxW - 8, boxY + 17)

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY_MID)
    doc.text(label.toUpperCase(), x + sigBoxW / 2, boxY + 23, { align: 'center' })

    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.text('Firma y nombre', x + sigBoxW / 2, boxY + 26, { align: 'center' })
  }

  drawSignatureBox(sig1x, 'Entregó')
  drawSignatureBox(sig2x, 'Recibió')

  // ── Footer ────────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = pageH - 6
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(
      `Generado el ${formatFechaCorta(new Date())} · ${organization.name}`,
      margin,
      footerY
    )
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, footerY, { align: 'right' })
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const filename = `vale-salida-${movement.document_number ?? movement.id.slice(0, 8)}.pdf`
  doc.save(filename)
}

export default generateValePDF
