/**
 * generate-po-pdf — Genera el PDF de una Orden de Compra (OC).
 *
 * Sigue el patrón de generate-vale-pdf.ts: jsPDF + autoTable lazy-loaded
 * para no inflar el bundle inicial.  Palette: tokens del sistema
 * "Tierra cultivada" (primary #2F5D3F, paper #F7F3EA, ink #1F1A13).
 * Incluye logo de la organización, info del proveedor + condiciones,
 * tabla de partidas, totales subtotal/IVA/total MXN (+ USD informativo
 * si aplica) y una caja de firma "Autorizado por" centrada.
 */
import type { PurchaseOrder, POLine, Organization, Item, Currency } from '@/lib/database.types'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

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

/**
 * Loads a signature PNG from the private 'cotizaciones' bucket as a data URL.
 * The bucket is private so we use a short-lived signedUrl + fetch + FileReader.
 * Returns null on any failure — the PDF still renders without the signature.
 */
async function loadSignatureDataUrl(storagePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.storage as any)
      .from('cotizaciones')
      .createSignedUrl(storagePath, 60)
    if (error || !data?.signedUrl) return null
    const res = await fetch(data.signedUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
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

  // ── Palette: Tierra cultivada — los mismos tokens del sistema ──────────────
  // Mapeados de src/index.css :root:
  //   primary       #2F5D3F (verde forest)         → PRIMARY
  //   primary alt   #244A33 (oscurecido para títulos contraste alto) → PRIMARY_DARK
  //   background    #F7F3EA (lino-blanco)         → PAPER (color del header)
  //   foreground    #1F1A13 (marrón muy oscuro)   → INK
  //   muted-fg      ≈ #6B5E48 (marrón medio)      → MUTED
  //   border        ≈ #E6DECB                      → BORDER
  //   card          #FDFBF4 (crema más clara)     → CARD
  const PRIMARY: [number, number, number]      = [47, 93, 63]    // #2F5D3F
  const PRIMARY_DARK: [number, number, number] = [36, 74, 51]    // #244A33
  const INK: [number, number, number]          = [31, 26, 19]    // #1F1A13
  const MUTED: [number, number, number]        = [107, 94, 72]   // #6B5E48
  const BORDER: [number, number, number]       = [230, 222, 203] // #E6DECB
  const CARD: [number, number, number]         = [253, 251, 244] // #FDFBF4
  const PAPER: [number, number, number]        = [247, 243, 234] // #F7F3EA

  // ── Header band ────────────────────────────────────────────────────────────
  const HEADER_H = 32
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, HEADER_H, 'F')

  // Logo (optional)
  let textStartX = margin
  if (organization.logo_url) {
    const logo = await loadLogoDataUrl(organization.logo_url)
    if (logo) {
      try {
        // Logo box: 22x22 mm, white background for contrast on the green band.
        doc.setFillColor(...PAPER)
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
  doc.setTextColor(...PAPER)
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
  doc.setTextColor(...PAPER)
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
  doc.setFillColor(...CARD)
  doc.setDrawColor(...BORDER)
  doc.roundedRect(margin, y, contentW, INFO_H, 2, 2, 'FD')

  const col1x = margin + 5
  const col2x = margin + contentW / 2 + 2

  // Labels
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('PROVEEDOR', col1x, y + 6)
  doc.text('FECHA EMISIÓN', col2x, y + 6)
  doc.text('ALMACÉN DESTINO', col1x, y + 18)
  doc.text('ENTREGA ESPERADA', col2x, y + 18)
  doc.text('CONDICIONES DE PAGO', col1x, y + 30)
  doc.text('TIPO DE CAMBIO', col2x, y + 30)

  // Values
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)

  const supplierText = po.supplier?.name ?? '—'
  doc.text(doc.splitTextToSize(supplierText, contentW / 2 - 8)[0], col1x, y + 12)
  if (po.supplier?.rfc) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(`RFC: ${po.supplier.rfc}`, col1x, y + 15.5)
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
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
    styles: { fontSize: 8, cellPadding: 2.5, textColor: INK },
    headStyles: {
      fillColor: PRIMARY,
      textColor: PAPER,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: PAPER },
    columnStyles: {
      0: { cellWidth: 8,   halign: 'center', textColor: MUTED },
      1: { cellWidth: 22,  fontStyle: 'bold', textColor: MUTED },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 18,  halign: 'right' },
      4: { cellWidth: 22,  halign: 'right', font: 'courier' },
      5: { cellWidth: 14,  halign: 'center' },
      6: { cellWidth: 26,  halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...PRIMARY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...PAPER)
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
  doc.setTextColor(...MUTED)
  doc.text('Subtotal:', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...INK)
  doc.text(formatMoney(subtotalMxn, 'MXN'), amountX, totY, { align: 'right' })

  totY += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('IVA (16%):', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...INK)
  doc.text(formatMoney(taxMxn, 'MXN'), amountX, totY, { align: 'right' })

  if (po.total_usd && po.total_usd > 0) {
    totY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('Total USD (info):', totalsX, totY)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...INK)
    doc.text(formatMoney(po.total_usd, 'USD'), amountX, totY, { align: 'right' })
  }

  totY += 3
  doc.setDrawColor(...BORDER)
  doc.line(totalsX, totY, pageW - margin, totY)
  totY += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...PRIMARY_DARK)
  doc.text('TOTAL MXN:', totalsX, totY)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...INK)
  doc.text(formatMoney(totalMxn, 'MXN'), amountX, totY, { align: 'right' })

  totY += 10

  // ── Signature box — sólo "Autorizado por", centrada ───────────────────────
  // (Quitada la firma del proveedor por petición — la OC es un documento
  // emitido por la organización, el proveedor no necesita firmarla aquí.)
  const sigH    = 36
  const sigY    = Math.max(totY + 6, finalY + 50)
  const sigBoxW = 84  // centrada, no full-width
  const sigX    = (pageW - sigBoxW) / 2

  if (sigY + sigH > pageH - 14) {
    doc.addPage()
    doc.setFillColor(...PRIMARY)
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setTextColor(...PAPER)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text(organization.name, margin, 7)
    doc.text(`Orden de Compra — ${po.folio}`, pageW - margin, 7, { align: 'right' })
  }

  const bY = Math.min(sigY, pageH - sigH - 12)
  doc.setDrawColor(...BORDER)
  doc.setFillColor(...CARD)
  doc.roundedRect(sigX, bY, sigBoxW, sigH, 2, 2, 'FD')

  // signature line
  doc.setDrawColor(...MUTED)
  doc.line(sigX + 6, bY + 20, sigX + sigBoxW - 6, bY + 20)

  // "Firma" label
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('Firma', sigX + sigBoxW / 2, bY + 4, { align: 'center' })

  // Handwritten signature (PNG embedded above the line) — only if the OC
  // está firmada y tenemos el path en storage.
  if (po.signature_url) {
    const sigImg = await loadSignatureDataUrl(po.signature_url)
    if (sigImg) {
      try {
        const imgW = sigBoxW - 12
        const imgH = 14
        doc.addImage(sigImg, 'PNG', sigX + 6, bY + 5, imgW, imgH)
      } catch {
        /* image embed failed — preserve text fallback */
      }
    }
  }

  // Title
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_DARK)
  doc.text('AUTORIZADO POR', sigX + sigBoxW / 2, bY + 26, { align: 'center' })

  // Name + fecha de firma (si está firmada)
  if (createdByName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(createdByName, sigX + sigBoxW / 2, bY + 31.5, { align: 'center' })
  }
  if (po.approved_at) {
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `Firmado: ${new Date(po.approved_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`,
      sigX + sigBoxW / 2, bY + 34.5, { align: 'center' },
    )
  }

  // ── Footer with page numbers ──────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footY = pageH - 5
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
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
