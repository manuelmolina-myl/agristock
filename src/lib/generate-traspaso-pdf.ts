import type { StockMovement, StockMovementLine, Organization } from '@/lib/database.types'
import { formatFechaCorta, formatQuantity } from '@/lib/utils'

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateTraspasoPDF(
  movement: StockMovement & { lines: StockMovementLine[] },
  organization: Organization
): Promise<void> {
  // Lazy-load jsPDF + autoTable so this heavy chunk only loads on PDF export
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW   = doc.internal.pageSize.getWidth()
  const pageH   = doc.internal.pageSize.getHeight()
  const margin  = 18
  const contentW = pageW - margin * 2

  // ── Palette ──────────────────────────────────────────────────────────────────
  const PRIMARY:    [number, number, number] = [22, 101, 52]    // green-800
  const GRAY_DARK:  [number, number, number] = [30, 30, 30]
  const GRAY_MID:   [number, number, number] = [100, 100, 100]
  const GRAY_LIGHT: [number, number, number] = [230, 230, 230]
  const WHITE:      [number, number, number] = [255, 255, 255]

  // ── Header band ───────────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 28, 'F')

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(organization.name.toUpperCase(), margin, 11)

  if (organization.rfc) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`RFC: ${organization.rfc}`, margin, 17)
  }

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('TRASPASO DE ALMACÉN', pageW - margin, 10, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Folio: ${movement.document_number ?? '(Sin folio)'}`, pageW - margin, 17, { align: 'right' })

  const movDate = movement.fx_date ?? movement.created_at
  doc.setFontSize(8)
  doc.text(`Fecha: ${formatFechaCorta(movDate)}`, pageW - margin, 23, { align: 'right' })

  let y = 36

  // ── Info section (2 columns) ──────────────────────────────────────────────────
  doc.setTextColor(...GRAY_DARK)
  doc.setDrawColor(...GRAY_LIGHT)
  doc.setFillColor(248, 250, 248)
  doc.roundedRect(margin, y, contentW, 36, 2, 2, 'FD')

  const col1x = margin + 6
  const col2x = margin + contentW / 2

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)

  doc.text('ALMACÉN ORIGEN', col1x, y + 7)
  doc.text('ALMACÉN DESTINO', col1x, y + 20)
  doc.text('FECHA', col2x, y + 7)
  doc.text('NOTAS DE TRANSPORTE', col2x, y + 20)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_DARK)

  const originWh = movement.warehouse
  const destWh   = movement.counterpart_warehouse

  const originLabel = originWh ? `${originWh.code} — ${originWh.name}` : '—'
  const destLabel   = destWh   ? `${destWh.code} — ${destWh.name}`     : '—'

  doc.text(originLabel, col1x, y + 13)
  doc.text(destLabel,   col1x, y + 26)
  doc.text(formatFechaCorta(movDate), col2x, y + 13)

  const transportNotes = movement.transport_notes ?? '—'
  const notesClipped = doc.splitTextToSize(transportNotes, contentW / 2 - 10) as string[]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(notesClipped[0] ?? '—', col2x, y + 26)

  y += 44

  // ── Lines table ───────────────────────────────────────────────────────────────
  const tableRows = (movement.lines ?? []).map((line, idx) => {
    const item = line.item
    const sku  = item?.sku  ?? '—'
    const name = item?.name ?? line.item_id
    const qty  = formatQuantity(line.quantity)
    const unit = item?.unit?.code ?? ''
    return [String(idx + 1), sku, name, qty, unit]
  })

  autoTable(doc, {
    startY: y,
    head: [['#', 'SKU', 'Descripción', 'Cantidad', 'Unidad']],
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
      0: { cellWidth: 10, halign: 'center', textColor: GRAY_MID },
      1: { cellWidth: 24, fontStyle: 'bold', textColor: GRAY_MID },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 24, halign: 'right', font: 'courier' },
      4: { cellWidth: 20, halign: 'center' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...PRIMARY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...WHITE)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(
          `Traspaso — ${movement.document_number ?? ''}`,
          pageW - margin, 7, { align: 'right' }
        )
      }
    },
  })

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  const finalY = lastAutoTable?.finalY ?? y

  // ── Signature boxes ───────────────────────────────────────────────────────────

  const sigY   = Math.max(finalY + 16, y + 60)
  const sigH   = 32
  const sigBoxW = (contentW - 20) / 3
  const gap     = 10

  // Check page space
  if (sigY + sigH > pageH - 14) {
    doc.addPage()
  }

  const drawSigBox = (x: number, label: string, name?: string) => {
    const boxY = sigY + sigH > pageH - 14 ? margin : sigY
    doc.setDrawColor(...GRAY_LIGHT)
    doc.setFillColor(252, 252, 252)
    doc.roundedRect(x, boxY, sigBoxW, sigH, 1, 1, 'FD')

    // Signature line
    doc.setDrawColor(160, 160, 160)
    doc.line(x + 8, boxY + 19, x + sigBoxW - 8, boxY + 19)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY_MID)
    doc.text(label.toUpperCase(), x + sigBoxW / 2, boxY + 25, { align: 'center' })

    if (name) {
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY_DARK)
      const nameText = doc.splitTextToSize(name, sigBoxW - 8) as string[]
      doc.text(nameText[0] ?? '', x + sigBoxW / 2, boxY + 29, { align: 'center' })
    } else {
      doc.setFontSize(6)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY_MID)
      doc.text('Firma y nombre', x + sigBoxW / 2, boxY + 29, { align: 'center' })
    }
  }

  const deliveredByName = movement.delivered_by_employee
    ? `${movement.delivered_by_employee.employee_code ?? ''} — ${movement.delivered_by_employee.full_name ?? ''}`
    : undefined

  const receivedByName = movement.received_by_employee
    ? `${movement.received_by_employee.employee_code ?? ''} — ${movement.received_by_employee.full_name ?? ''}`
    : undefined

  drawSigBox(margin,                          `Entrega: ${deliveredByName ?? ''}`, deliveredByName)
  drawSigBox(margin + sigBoxW + gap / 2,      'Transporta:', undefined)
  drawSigBox(margin + sigBoxW * 2 + gap,      `Recibe: ${receivedByName ?? ''}`,  receivedByName)

  // ── Footer ────────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = pageH - 6
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(
      `Generado el ${formatFechaCorta(new Date())} · AgriStock · ${organization.name}`,
      margin,
      footerY
    )
    doc.text(
      `Página ${p} de ${totalPages}`,
      pageW - margin,
      footerY,
      { align: 'right' }
    )
  }

  doc.save(`traspaso-${movement.document_number ?? movement.id.slice(0, 8)}.pdf`)
}
