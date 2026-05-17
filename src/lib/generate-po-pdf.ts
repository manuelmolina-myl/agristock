/**
 * generate-po-pdf — Genera el PDF de una Orden de Compra (OC).
 *
 * Sigue el patrón de generate-vale-pdf.ts: jsPDF + autoTable lazy-loaded
 * para no inflar el bundle inicial, header verde "Tierra cultivada", logo
 * de la organización opcional, partidas con costo unitario y subtotal,
 * totales subtotal/IVA/total en MXN (más USD informativo si aplica),
 * bloques de firma proveedor + autorizado por.
 */
import type { PurchaseOrder, POLine, Organization, Item, Currency } from '@/lib/database.types'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'

export interface POForPdf extends PurchaseOrder {
  supplier?: { name: string; rfc: string | null } | null
  warehouse?: { name: string; code: string | null } | null
  lines?: Array<POLine & { item?: Pick<Item, 'name' | 'sku'> | null }>
}

export interface GeneratePoPDFOptions {
  po: POForPdf
  organization: Organization
  createdByName?: string
}

/**
 * Loads an image URL into a data URL so jsPDF can embed it.
 * Returns null on failure (CORS / 404 / etc.) so the PDF still generates
 * without the logo instead of throwing.
 */
async function loadLogoDataUrl(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || 'image/png'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { data, mime }
  } catch {
    return null
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft:               'BORRADOR',
  sent:                'ENVIADA',
  confirmed:           'CONFIRMADA',
  partially_received:  'RECEPCIÓN PARCIAL',
  received:            'RECIBIDA',
  cancelled:           'CANCELADA',
  closed:              'CERRADA',
}

/** Build the jsPDF doc for the PO.  Reused by `generatePoPDF` (download) and
 *  `previewPoPDF` (returns a blob URL for in-page iframe preview). */
async function buildPoPdfDoc(opts: GeneratePoPDFOptions) {
  const { po, organization, createdByName } = opts

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW   = doc.internal.pageSize.getWidth()
  const pageH   = doc.internal.pageSize.getHeight()
  const margin  = 14
  const contentW = pageW - margin * 2

  // ── Palette (Tierra cultivada — agro green) ────────────────────────────────
  const GREEN: [number, number, number]      = [22, 163, 74]    // #16A34A
  const GREEN_DARK: [number, number, number] = [15, 118, 53]
  const GRAY_DARK: [number, number, number]  = [25, 25, 25]
  const GRAY_MID: [number, number, number]   = [100, 100, 100]
  const GRAY_LIGHT: [number, number, number] = [225, 225, 225]
  const GRAY_BG: [number, number, number]    = [248, 250, 248]
  const WHITE: [number, number, number]      = [255, 255, 255]

  // ── Header band ────────────────────────────────────────────────────────────
  const HEADER_H = 32
  doc.setFillColor(...GREEN)
  doc.rect(0, 0, pageW, HEADER_H, 'F')

  // Logo (optional)
  let textStartX = margin
  if (organization.logo_url) {
    const logo = await loadLogoDataUrl(organization.logo_url)
    if (logo) {
      try {
        // Logo box: 22x22 mm, white background for contrast on the green band.
        doc.setFillColor(...WHITE)
        doc.roundedRect(margin, 5, 22, 22, 2, 2, 'F')
        doc.addImage(logo.data, logo.mime.includes('png') ? 'PNG' : 'JPEG',
          margin + 1.5, 6.5, 19, 19)
        textStartX = margin + 26
      } catch {
        textStartX = margin
      }
    }
  }

  // Org name + RFC + address (left of header)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(organization.name.toUpperCase(), textStartX, 11)

  if (organization.rfc) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`RFC: ${organization.rfc}`, textStartX, 16)
  }
  if (organization.address) {
    doc.setFontSize(7)
    const addrLines = doc.splitTextToSize(organization.address, 80)
    doc.text(addrLines, textStartX, 21)
  }

  // Document title + folio + status (right)
  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('ORDEN DE COMPRA', pageW - margin, 11, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Folio: ${po.folio}`, pageW - margin, 18, { align: 'right' })

  doc.setFontSize(7.5)
  doc.text(
    `${formatFechaCorta(po.issue_date)}  ·  ${STATUS_LABEL[po.status] ?? po.status.toUpperCase()}`,
    pageW - margin, 25, { align: 'right' },
  )

  let y = HEADER_H + 8

  // ── Info section — 2 columns (Proveedor / Destino — Fechas / Condiciones) ─
  const INFO_H = 38
  doc.setFillColor(...GRAY_BG)
  doc.setDrawColor(...GRAY_LIGHT)
  doc.roundedRect(margin, y, contentW, INFO_H, 2, 2, 'FD')

  const col1x = margin + 5
  const col2x = margin + contentW / 2 + 2

  // Labels
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)
  doc.text('PROVEEDOR', col1x, y + 6)
  doc.text('FECHA EMISIÓN', col2x, y + 6)
  doc.text('ALMACÉN DESTINO', col1x, y + 18)
  doc.text('ENTREGA ESPERADA', col2x, y + 18)
  doc.text('CONDICIONES DE PAGO', col1x, y + 30)
  doc.text('TIPO DE CAMBIO', col2x, y + 30)

  // Values
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_DARK)

  const supplierText = po.supplier?.name ?? '—'
  doc.text(doc.splitTextToSize(supplierText, contentW / 2 - 8)[0], col1x, y + 12)
  if (po.supplier?.rfc) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(`RFC: ${po.supplier.rfc}`, col1x, y + 15.5)
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatFechaCorta(po.issue_date), col2x, y + 12)

  doc.setFontSize(8.5)
  const whText = po.warehouse
    ? `${po.warehouse.code ? po.warehouse.code + ' — ' : ''}${po.warehouse.name}`
    : '—'
  doc.text(whText, col1x, y + 24)
  doc.text(
    po.expected_delivery_date ? formatFechaCorta(po.expected_delivery_date) : 'Por confirmar',
    col2x, y + 24,
  )

  doc.setFontSize(8.5)
  doc.text(po.payment_terms ?? '—', col1x, y + 35)
  doc.text(po.fx_rate ? `1 USD = ${po.fx_rate.toFixed(2)} MXN` : '—', col2x, y + 35)

  y += INFO_H + 6

  // ── Lines table ────────────────────────────────────────────────────────────
  const head = ['#', 'SKU', 'Descripción', 'Cantidad', 'Costo unit.', 'Moneda', 'Subtotal']

  const tableRows = (po.lines ?? []).map((line, i) => {
    const sku   = line.item?.sku ?? '—'
    const name  = line.item?.name ?? line.item_id
    const qty   = formatQuantity(line.quantity)
    const unit  = line.currency
    const sub   = line.quantity * line.unit_cost
    return [
      `${i + 1}`,
      sku,
      name,
      qty,
      formatMoney(line.unit_cost, line.currency as Currency),
      unit,
      formatMoney(sub, line.currency as Currency),
    ]
  })

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
    columnStyles: {
      0: { cellWidth: 8,   halign: 'center', textColor: GRAY_MID },
      1: { cellWidth: 22,  fontStyle: 'bold', textColor: GRAY_MID },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 18,  halign: 'right' },
      4: { cellWidth: 22,  halign: 'right', font: 'courier' },
      5: { cellWidth: 14,  halign: 'center' },
      6: { cellWidth: 26,  halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...GREEN)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...WHITE)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(`Orden de Compra — ${po.folio}`, pageW - margin, 7, { align: 'right' })
      }
    },
  })

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  const finalY = lastAutoTable?.finalY ?? y
  let totY = finalY + 6

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalsX = pageW - margin - 72
  const amountX = pageW - margin

  const subtotalMxn = po.subtotal_mxn ?? 0
  const taxMxn      = po.tax_mxn      ?? 0
  const totalMxn    = po.total_mxn    ?? subtotalMxn + taxMxn

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)
  doc.text('Subtotal:', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatMoney(subtotalMxn, 'MXN'), amountX, totY, { align: 'right' })

  totY += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_MID)
  doc.text('IVA (16%):', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatMoney(taxMxn, 'MXN'), amountX, totY, { align: 'right' })

  if (po.total_usd && po.total_usd > 0) {
    totY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text('Total USD (info):', totalsX, totY)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...GRAY_DARK)
    doc.text(formatMoney(po.total_usd, 'USD'), amountX, totY, { align: 'right' })
  }

  totY += 3
  doc.setDrawColor(...GRAY_LIGHT)
  doc.line(totalsX, totY, pageW - margin, totY)
  totY += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GREEN_DARK)
  doc.text('TOTAL MXN:', totalsX, totY)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...GRAY_DARK)
  doc.text(formatMoney(totalMxn, 'MXN'), amountX, totY, { align: 'right' })

  totY += 10

  // ── Signature boxes — Proveedor + Autorizado por ──────────────────────────
  const sigH    = 36
  const sigY    = Math.max(totY + 6, finalY + 50)
  const sigBoxW = (contentW - 16) / 2
  const sig1x   = margin
  const sig2x   = margin + sigBoxW + 16

  if (sigY + sigH > pageH - 14) {
    doc.addPage()
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text(organization.name, margin, 7)
    doc.text(`Orden de Compra — ${po.folio}`, pageW - margin, 7, { align: 'right' })
  }

  function signatureBox(x: number, title: string, name?: string) {
    const bY = Math.min(sigY, pageH - sigH - 12)
    doc.setDrawColor(...GRAY_LIGHT)
    doc.setFillColor(252, 253, 252)
    doc.roundedRect(x, bY, sigBoxW, sigH, 2, 2, 'FD')
    // signature line
    doc.setDrawColor(170, 170, 170)
    doc.line(x + 6, bY + 20, x + sigBoxW - 6, bY + 20)
    // Firma label
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text('Firma', x + sigBoxW / 2, bY + 4, { align: 'center' })
    // title
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
  }

  signatureBox(sig1x, 'Proveedor', po.supplier?.name)
  signatureBox(sig2x, 'Autorizado por', createdByName)

  // ── Footer with page numbers ──────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footY = pageH - 5
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY_MID)
    doc.text(`Generado por AgriStock — ${new Date().toLocaleString('es-MX')}`, margin, footY)
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, footY, { align: 'right' })
  }

  return doc
}

/** Build the PO PDF and trigger a browser download.  Filename: `OC-<folio>.pdf`. */
export async function generatePoPDF(opts: GeneratePoPDFOptions): Promise<void> {
  const doc = await buildPoPdfDoc(opts)
  doc.save(`OC-${opts.po.folio}.pdf`)
}

/** Build the PO PDF and return a Blob URL suitable for `<iframe src=...>`.
 *  Caller is responsible for revoking the URL with `URL.revokeObjectURL`
 *  when the preview is dismissed to free the blob. */
export async function previewPoPDF(opts: GeneratePoPDFOptions): Promise<string> {
  const doc = await buildPoPdfDoc(opts)
  const blob = doc.output('blob')
  return URL.createObjectURL(blob)
}

export default generatePoPDF
