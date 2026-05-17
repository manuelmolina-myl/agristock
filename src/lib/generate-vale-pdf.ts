import type { StockMovement, StockMovementLine, Organization, Item, Currency } from '@/lib/database.types'
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'

// ─── Destination label helper ─────────────────────────────────────────────────

const DESTINATION_TYPE_LABELS: Record<string, string> = {
  crop_lot:    'Lote de cultivo',
  equipment:   'Tractor / Equipo',
  employee:    'Empleado',
  maintenance: 'Mantenimiento',
  waste:       'Merma',
  other:       'Otro',
}

function getDestinationLabel(line: StockMovementLine): string {
  const type = line.destination_type
  if (!type) return '—'

  if (type === 'crop_lot' && line.crop_lot) {
    const lot = line.crop_lot
    return `Lote ${lot.code ?? ''} — ${lot.crop_type ?? ''}`
  }
  if (type === 'equipment' && line.equipment) {
    const eq = line.equipment
    return `${eq.code ?? ''} — ${eq.name ?? ''}`
  }
  if (type === 'employee' && line.employee) {
    const emp = line.employee
    return `${emp.employee_code ?? ''} — ${emp.full_name ?? ''}`
  }
  return DESTINATION_TYPE_LABELS[type] ?? type
}

// ─── Options interface ────────────────────────────────────────────────────────

export interface GenerateValePDFOptions {
  movement: StockMovement & { lines: StockMovementLine[] }
  organization: Organization
  items?: Item[]
  deliveredByName?: string
  receivedByName?: string
  destinationName?: string
  canSeePrices?: boolean
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function generateValePDF(options: GenerateValePDFOptions): Promise<void> {
  const {
    movement,
    organization,
    deliveredByName,
    receivedByName,
    destinationName,
    canSeePrices = true,
  } = options

  // Lazy-load jsPDF + autoTable so this heavy chunk only loads on PDF export
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  // ── Colors ──────────────────────────────────────────────────────────────────
  const GREEN: [number, number, number] = [22, 163, 74]    // #16A34A
  const GREEN_DARK: [number, number, number] = [15, 118, 53]
  const GRAY_DARK: [number, number, number] = [25, 25, 25]
  const GRAY_MID: [number, number, number] = [100, 100, 100]
  const GRAY_LIGHT: [number, number, number] = [225, 225, 225]
  const GRAY_BG: [number, number, number] = [248, 250, 248]
  const WHITE: [number, number, number] = [255, 255, 255]

  // ── Header band (30mm tall) ──────────────────────────────────────────────────
  const HEADER_H = 30
  doc.setFillColor(...GREEN)
  doc.rect(0, 0, pageW, HEADER_H, 'F')

  // Left: Org name
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(organization.name.toUpperCase(), margin, 10)

  // Left: RFC
  if (organization.rfc) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`RFC: ${organization.rfc}`, margin, 16)
  }

  // Left: Address
  if (organization.address) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    const addrLines = doc.splitTextToSize(organization.address, 80)
    doc.text(addrLines, margin, 21)
  }

  // Right: Document title
  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('VALE DE SALIDA', pageW - margin, 11, { align: 'right' })

  // Right: Folio
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Folio: ${movement.document_number ?? '(Sin folio)'}`,
    pageW - margin, 18, { align: 'right' }
  )

  // Right: Date + Status
  const movDate = movement.fx_date ?? movement.created_at
  const statusLabel =
    movement.status === 'posted' ? 'REGISTRADO'
    : movement.status === 'draft' ? 'BORRADOR'
    : 'CANCELADO'
  doc.setFontSize(7.5)
  doc.text(
    `${formatFechaCorta(movDate)}  ·  ${statusLabel}`,
    pageW - margin, 25, { align: 'right' }
  )

  let y = HEADER_H + 8

  // ── Info section — 2 columns ─────────────────────────────────────────────────
  doc.setFillColor(...GRAY_BG)
  doc.setDrawColor(...GRAY_LIGHT)
  doc.roundedRect(margin, y, contentW, 28, 2, 2, 'FD')

  const col1x = margin + 5
  const col2x = margin + contentW / 2 + 2

  // Labels (small caps)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)
  doc.text('ALMACÉN ORIGEN', col1x, y + 6)
  doc.text('TIPO DE MOVIMIENTO', col2x, y + 6)
  doc.text('DESTINO', col1x, y + 18)
  doc.text('NOTAS', col2x, y + 18)

  // Values
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_DARK)

  const warehouseName = movement.warehouse
    ? `${movement.warehouse.code} — ${movement.warehouse.name}`
    : '—'
  doc.text(warehouseName, col1x, y + 12)
  doc.text(
    MOVEMENT_TYPE_LABELS[movement.movement_type] ?? movement.movement_type,
    col2x, y + 12
  )

  // Destination
  const firstLine = movement.lines?.[0]
  const destLabel = destinationName ?? (firstLine ? getDestinationLabel(firstLine) : '—')
  doc.setFontSize(8)
  doc.text(destLabel, col1x, y + 24)

  // Notes (truncated)
  if (movement.notes) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY_MID)
    const noteText = doc.splitTextToSize(movement.notes, contentW / 2 - 8)
    doc.text(noteText[0] ?? '', col2x, y + 24)
  }

  y += 36

  // ── Line items table ──────────────────────────────────────────────────────────
  const numColBase = ['#', 'SKU', 'Descripción', 'Cantidad', 'Unidad']
  const numColPrices = ['Costo Unit.', 'Total MXN']
  const head = canSeePrices ? [...numColBase, ...numColPrices] : numColBase

  const tableRows = (movement.lines ?? []).map((line, i) => {
    const item = line.item
    const sku  = item?.sku ?? '—'
    const name = item?.name ?? line.item_id
    const qty  = formatQuantity(line.quantity)
    const unit = item?.unit?.code ?? ''
    const row: string[] = [`${i + 1}`, sku, name, qty, unit]
    if (canSeePrices) {
      row.push(formatMoney(line.unit_cost_native, line.native_currency as Currency))
      row.push(formatMoney(line.line_total_mxn, 'MXN'))
    }
    return row
  })

  const colStyles: Record<number, object> = {
    0: { cellWidth: 8, halign: 'center', textColor: GRAY_MID },
    1: { cellWidth: 22, fontStyle: 'bold', textColor: GRAY_MID },
    2: { cellWidth: 'auto' },
    3: { cellWidth: 20, halign: 'right' },
    4: { cellWidth: 14, halign: 'center' },
  }
  if (canSeePrices) {
    colStyles[5] = { cellWidth: 24, halign: 'right', font: 'courier' }
    colStyles[6] = { cellWidth: 28, halign: 'right', font: 'courier', fontStyle: 'bold' }
  }

  autoTable(doc, {
    startY: y,
    head: [head],
    body: tableRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: GRAY_DARK },
    headStyles: {
      fillColor: GREEN,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [245, 250, 245] },
    columnStyles: colStyles,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...GREEN)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...WHITE)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(
          `Vale de Salida — ${movement.document_number ?? ''}`,
          pageW - margin, 7, { align: 'right' }
        )
      }
    },
  })

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  const finalY = lastAutoTable?.finalY ?? y
  let totY = finalY + 6

  // ── Totals (only if canSeePrices) ─────────────────────────────────────────────
  if (canSeePrices) {
    const totalMxn = movement.total_mxn
      ?? (movement.lines ?? []).reduce((s, l) => s + l.line_total_mxn, 0)
    const totalUsd = movement.total_usd

    const totalsX  = pageW - margin - 72
    const amountX  = pageW - margin

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text('Subtotal MXN:', totalsX, totY)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...GRAY_DARK)
    doc.text(formatMoney(totalMxn, 'MXN'), amountX, totY, { align: 'right' })

    if (totalUsd && totalUsd > 0) {
      totY += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY_MID)
      doc.text('Total USD:', totalsX, totY)
      doc.setFont('courier', 'normal')
      doc.setTextColor(...GRAY_DARK)
      doc.text(formatMoney(totalUsd, 'USD'), amountX, totY, { align: 'right' })
    }

    totY += 3
    doc.setDrawColor(...GRAY_LIGHT)
    doc.line(totalsX, totY, pageW - margin, totY)
    totY += 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...GREEN_DARK)
    doc.text('TOTAL MXN:', totalsX, totY)
    doc.setFont('courier', 'bold')
    doc.setTextColor(...GRAY_DARK)
    doc.text(formatMoney(totalMxn, 'MXN'), amountX, totY, { align: 'right' })

    totY += 8
  } else {
    totY += 4
  }

  // ── Signature section ─────────────────────────────────────────────────────────
  const sigH  = 36
  const sigY  = Math.max(totY + 10, finalY + 44)

  // If not enough space, new page
  if (sigY + sigH > pageH - 14) {
    doc.addPage()
    // re-draw mini header
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text(organization.name, margin, 7)
    doc.text(`Vale de Salida — ${movement.document_number ?? ''}`, pageW - margin, 7, { align: 'right' })
  }

  const sigBoxW = (contentW - 16) / 2
  const sig1x   = margin
  const sig2x   = margin + sigBoxW + 16

  function drawSignatureBox(x: number, title: string, name?: string) {
    const bY = Math.min(sigY, pageH - sigH - 12)
    doc.setDrawColor(...GRAY_LIGHT)
    doc.setFillColor(252, 253, 252)
    doc.roundedRect(x, bY, sigBoxW, sigH, 2, 2, 'FD')

    // signature line
    doc.setDrawColor(170, 170, 170)
    doc.line(x + 6, bY + 20, x + sigBoxW - 6, bY + 20)

    // label
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GREEN_DARK)
    doc.text(title.toUpperCase(), x + sigBoxW / 2, bY + 26, { align: 'center' })

    // name
    if (name) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...GRAY_DARK)
      doc.text(name, x + sigBoxW / 2, bY + 31.5, { align: 'center' })
    }

    // Firma sub-label
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text('Firma', x + sigBoxW / 2, bY + 4, { align: 'center' })
  }

  drawSignatureBox(sig1x, 'Entrega', deliveredByName)
  drawSignatureBox(sig2x, 'Recibe',  receivedByName)

  // ── Footer ─────────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footY = pageH - 5
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(
      `Generado por AgriStock — ${new Date().toLocaleString('es-MX')}`,
      margin, footY
    )
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, footY, { align: 'right' })
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  const filename = `vale-salida-${movement.document_number ?? movement.id.slice(0, 8)}.pdf`
  doc.save(filename)
}

export default generateValePDF
