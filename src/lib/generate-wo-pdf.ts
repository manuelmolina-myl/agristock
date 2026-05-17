/**
 * generate-wo-pdf — Genera el PDF "Reporte de OT" para una Orden de Trabajo
 * de mantenimiento.  Análogo a `generate-po-pdf.ts`: jsPDF + autoTable
 * cargados perezosamente para no inflar el bundle inicial.  Palette:
 * tokens "Tierra cultivada" (primary #2F5D3F, paper #F7F3EA, ink #1F1A13).
 *
 * Incluye:
 *  - Logo de la organización + RFC + título "REPORTE DE OT" + folio + status
 *  - Info: equipo, tipo, prioridad, reportada por, técnico asignado + ayudantes,
 *    fechas (reportada/iniciada/completada), horómetros abierto/cerrado, downtime
 *  - Falla (descripción + tipo)
 *  - Solución aplicada
 *  - Tabla "Partes consumidas"
 *  - Tabla "Mano de obra"
 *  - Totales: subtotal partes + mano de obra + externo = total MXN
 *  - Caja de firma "Técnico responsable" centrada
 *  - Footer con paginación
 */
import type { Organization, WorkOrder, WOStatus, WOType, WOPriority } from '@/lib/database.types'
import { formatFechaCorta, formatMoney, formatQuantity } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

export interface WoPartRow {
  id: string
  delivered_quantity: number
  total_cost_mxn: number | null
  item?: { name: string | null; sku: string | null } | null
}

export interface WoLaborRow {
  id: string
  work_date: string
  hours: number
  hourly_rate_mxn: number | null
  total_mxn: number
  technician?: { full_name: string | null } | null
}

export interface WoForPdf extends WorkOrder {
  equipment?: { code: string | null; name: string | null } | null
  failure_type?: { code: string | null; label: string | null; severity: string | null } | null
  primary_technician?: { full_name: string | null } | null
  reporter?: { full_name: string | null } | null
  parts?: WoPartRow[]
  labor?: WoLaborRow[]
  /** Optional pre-resolved names for helper technician ids — keeps the
   *  caller free to hydrate from `employees` once and pass us the strings. */
  helper_technician_names?: string[]
  /** Name of the user who signed off the WO (resolved from profiles by the
   *  caller).  Used in the signature box of the PDF. */
  signed_off_by_name?: string | null
}

export interface GenerateWoPDFOptions {
  wo: WoForPdf
  organization: Organization
}

const STATUS_LABEL: Record<WOStatus, string> = {
  reported:      'REPORTADA',
  scheduled:     'PROGRAMADA',
  assigned:      'ASIGNADA',
  in_progress:   'EN PROCESO',
  waiting_parts: 'ESPERANDO PARTES',
  completed:     'COMPLETADA',
  closed:        'CERRADA',
  cancelled:     'CANCELADA',
}

const TYPE_LABEL: Record<WOType, string> = {
  corrective:  'Correctivo',
  preventive:  'Preventivo',
  predictive:  'Predictivo',
  improvement: 'Mejora',
  inspection:  'Inspección',
}

const PRIORITY_LABEL: Record<WOPriority, string> = {
  low:      'Baja',
  medium:   'Normal',
  high:     'Alta',
  critical: 'Crítica',
}

/**
 * Loads a signature PNG from the private 'cotizaciones' bucket as a data URL.
 * Same pattern used by generate-po-pdf — short-lived signedUrl + fetch +
 * FileReader.  Returns null on any failure so the PDF still renders without
 * the signature image.
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

/** Loads an image URL into a data URL so jsPDF can embed it.  Returns null
 *  on failure (CORS / 404 / etc.) so the PDF still generates without logo. */
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

/** Build the jsPDF doc for a WO.  Reused by `generateWoPDF` (download) and
 *  `previewWoPDF` (returns a blob URL for the in-page iframe preview). */
async function buildWoPdfDoc(opts: GenerateWoPDFOptions) {
  const { wo, organization } = opts

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  // ── Palette: Tierra cultivada ──────────────────────────────────────────────
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

  let textStartX = margin
  if (organization.logo_url) {
    const logo = await loadLogoDataUrl(organization.logo_url)
    if (logo) {
      try {
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

  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PAPER)
  doc.text('REPORTE DE OT', pageW - margin, 11, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Folio: ${wo.folio}`, pageW - margin, 18, { align: 'right' })

  doc.setFontSize(7.5)
  doc.text(
    `${formatFechaCorta(wo.reported_at)}  ·  ${STATUS_LABEL[wo.status] ?? wo.status.toUpperCase()}`,
    pageW - margin, 25, { align: 'right' },
  )

  let y = HEADER_H + 8

  // ── Info section — 2 columns ───────────────────────────────────────────────
  const INFO_H = 56
  doc.setFillColor(...CARD)
  doc.setDrawColor(...BORDER)
  doc.roundedRect(margin, y, contentW, INFO_H, 2, 2, 'FD')

  const col1x = margin + 5
  const col2x = margin + contentW / 2 + 2
  const labelSize = 6.5
  const valueSize = 8.5

  // Row 1: Equipo / Tipo + Prioridad
  doc.setFontSize(labelSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('EQUIPO', col1x, y + 6)
  doc.text('TIPO · PRIORIDAD', col2x, y + 6)

  doc.setFontSize(valueSize)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  const eqName = wo.equipment?.name ?? '—'
  const eqCode = wo.equipment?.code ?? ''
  doc.text(doc.splitTextToSize(eqName, contentW / 2 - 8)[0], col1x, y + 11)
  if (eqCode) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(eqCode, col1x, y + 14.5)
  }

  doc.setFontSize(valueSize)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.text(
    `${TYPE_LABEL[wo.wo_type] ?? wo.wo_type} · ${PRIORITY_LABEL[wo.priority] ?? wo.priority}`,
    col2x, y + 11,
  )

  // Row 2: Reportada por / Técnico asignado
  doc.setFontSize(labelSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('REPORTADA POR', col1x, y + 20)
  doc.text('TÉCNICO ASIGNADO', col2x, y + 20)

  doc.setFontSize(valueSize)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.text(wo.reporter?.full_name ?? '—', col1x, y + 25)
  doc.text(wo.primary_technician?.full_name ?? 'Sin asignar', col2x, y + 25)
  if (wo.helper_technician_names && wo.helper_technician_names.length > 0) {
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    const helpers = `Ayudantes: ${wo.helper_technician_names.join(', ')}`
    doc.text(doc.splitTextToSize(helpers, contentW / 2 - 8)[0], col2x, y + 28.5)
  }

  // Row 3: Fechas
  doc.setFontSize(labelSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('REPORTADA · INICIADA · COMPLETADA', col1x, y + 34)
  doc.text('HORÓMETRO · DOWNTIME', col2x, y + 34)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  const reported  = formatFechaCorta(wo.reported_at)
  const started   = wo.started_at ? formatFechaCorta(wo.started_at) : '—'
  const completed = wo.completed_at ? formatFechaCorta(wo.completed_at) : '—'
  doc.text(`${reported}  ·  ${started}  ·  ${completed}`, col1x, y + 39)

  const hrOpen  = wo.hours_meter_open  != null ? `${wo.hours_meter_open.toLocaleString('es-MX')} h`   : '—'
  const hrClose = wo.hours_meter_close != null ? `${wo.hours_meter_close.toLocaleString('es-MX')} h` : '—'
  const downtime = wo.downtime_minutes != null ? `${wo.downtime_minutes.toLocaleString('es-MX')} min` : '—'
  doc.text(`${hrOpen} → ${hrClose}  ·  ${downtime}`, col2x, y + 39)

  // Row 4: Programada / Estado scheduled_date
  doc.setFontSize(labelSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('PROGRAMADA', col1x, y + 46)
  doc.text('HORAS ESTIMADAS · REALES', col2x, y + 46)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.text(wo.scheduled_date ? formatFechaCorta(wo.scheduled_date) : '—', col1x, y + 51)
  const est = wo.estimated_hours != null ? `${wo.estimated_hours} h` : '—'
  const act = wo.actual_hours    != null ? `${wo.actual_hours} h` : '—'
  doc.text(`${est}  ·  ${act}`, col2x, y + 51)

  y += INFO_H + 6

  // ── Falla ─────────────────────────────────────────────────────────────────
  if (wo.failure_description || wo.failure_type?.label) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PRIMARY_DARK)
    doc.text('FALLA', margin, y)
    y += 3

    doc.setDrawColor(...BORDER)
    doc.setFillColor(...PAPER)
    const failTextLines = doc.splitTextToSize(wo.failure_description ?? '—', contentW - 6)
    const failH = Math.max(14, failTextLines.length * 3.5 + 6)
    doc.roundedRect(margin, y, contentW, failH, 2, 2, 'FD')

    if (wo.failure_type?.label) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...MUTED)
      doc.text(
        `${wo.failure_type.label}${wo.failure_type.severity ? ` · severidad ${wo.failure_type.severity}` : ''}`,
        margin + 3, y + 4.5,
      )
    }
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(failTextLines, margin + 3, y + (wo.failure_type?.label ? 9 : 4.5))
    y += failH + 5
  }

  // ── Solución ──────────────────────────────────────────────────────────────
  if (wo.solution_applied) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PRIMARY_DARK)
    doc.text('SOLUCIÓN APLICADA', margin, y)
    y += 3

    const solLines = doc.splitTextToSize(wo.solution_applied, contentW - 6)
    const solH = Math.max(14, solLines.length * 3.5 + 6)
    doc.setDrawColor(...BORDER)
    doc.setFillColor(...CARD)
    doc.roundedRect(margin, y, contentW, solH, 2, 2, 'FD')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(solLines, margin + 3, y + 4.5)
    y += solH + 5
  }

  // ── Tabla Partes consumidas ───────────────────────────────────────────────
  const parts = wo.parts ?? []
  const partsRows = parts.map((p, i) => {
    const qty   = p.delivered_quantity
    const total = p.total_cost_mxn ?? 0
    const unit  = qty > 0 ? total / qty : 0
    return [
      `${i + 1}`,
      p.item?.sku ?? '—',
      p.item?.name ?? '—',
      formatQuantity(qty),
      formatMoney(unit, 'MXN'),
      formatMoney(total, 'MXN'),
    ]
  })

  let partsSubtotal = 0
  for (const p of parts) partsSubtotal += p.total_cost_mxn ?? 0

  autoTable(doc, {
    startY: y,
    head: [['#', 'SKU', 'Refacción', 'Cant.', 'Costo unit.', 'Subtotal']],
    body: partsRows.length > 0 ? partsRows : [['—', '—', 'Sin refacciones consumidas', '—', '—', formatMoney(0, 'MXN')]],
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
      0: { cellWidth: 8,  halign: 'center', textColor: MUTED },
      1: { cellWidth: 24, fontStyle: 'bold', textColor: MUTED },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', font: 'courier' },
      5: { cellWidth: 28, halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...PRIMARY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...PAPER)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(`Reporte de OT — ${wo.folio}`, pageW - margin, 7, { align: 'right' })
      }
    },
  })

  let lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  y = lastY + 4

  // ── Tabla Mano de obra ────────────────────────────────────────────────────
  const labor = wo.labor ?? []
  const laborRows = labor.map((l, i) => [
    `${i + 1}`,
    l.technician?.full_name ?? '—',
    formatFechaCorta(l.work_date),
    formatQuantity(l.hours),
    l.hourly_rate_mxn != null ? formatMoney(l.hourly_rate_mxn, 'MXN') : '—',
    formatMoney(l.total_mxn, 'MXN'),
  ])

  let laborSubtotal = 0
  for (const l of labor) laborSubtotal += l.total_mxn ?? 0

  autoTable(doc, {
    startY: y,
    head: [['#', 'Técnico', 'Fecha', 'Horas', 'Tarifa/h', 'Subtotal']],
    body: laborRows.length > 0 ? laborRows : [['—', 'Sin registros de mano de obra', '—', '—', '—', formatMoney(0, 'MXN')]],
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
      0: { cellWidth: 8,  halign: 'center', textColor: MUTED },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 26 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', font: 'courier' },
      5: { cellWidth: 28, halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...PRIMARY)
        doc.rect(0, 0, pageW, 10, 'F')
        doc.setTextColor(...PAPER)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text(organization.name, margin, 7)
        doc.text(`Reporte de OT — ${wo.folio}`, pageW - margin, 7, { align: 'right' })
      }
    },
  })

  lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  let totY = lastY + 6

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalsX = pageW - margin - 76
  const amountX = pageW - margin
  const externalCost = wo.external_service_cost_mxn ?? 0
  const grandTotal = wo.total_cost_mxn ?? (partsSubtotal + laborSubtotal + externalCost)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('Subtotal partes:', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...INK)
  doc.text(formatMoney(partsSubtotal, 'MXN'), amountX, totY, { align: 'right' })

  totY += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('Mano de obra:', totalsX, totY)
  doc.setFont('courier', 'normal')
  doc.setTextColor(...INK)
  doc.text(formatMoney(laborSubtotal, 'MXN'), amountX, totY, { align: 'right' })

  if (externalCost > 0) {
    totY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('Servicio externo:', totalsX, totY)
    doc.setFont('courier', 'normal')
    doc.setTextColor(...INK)
    doc.text(formatMoney(externalCost, 'MXN'), amountX, totY, { align: 'right' })
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
  doc.text(formatMoney(grandTotal, 'MXN'), amountX, totY, { align: 'right' })

  totY += 10

  // ── Caja de firma "Técnico responsable" centrada ──────────────────────────
  const sigH    = 36
  const sigBoxW = 84
  const sigX    = (pageW - sigBoxW) / 2

  if (totY + sigH > pageH - 14) {
    doc.addPage()
    doc.setFillColor(...PRIMARY)
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setTextColor(...PAPER)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text(organization.name, margin, 7)
    doc.text(`Reporte de OT — ${wo.folio}`, pageW - margin, 7, { align: 'right' })
    totY = 18
  }

  const bY = Math.min(totY, pageH - sigH - 12)
  doc.setDrawColor(...BORDER)
  doc.setFillColor(...CARD)
  doc.roundedRect(sigX, bY, sigBoxW, sigH, 2, 2, 'FD')

  doc.setDrawColor(...MUTED)
  doc.line(sigX + 6, bY + 20, sigX + sigBoxW - 6, bY + 20)

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('Firma de cierre', sigX + sigBoxW / 2, bY + 4, { align: 'center' })

  // Handwritten signature (PNG embedded above the line) — only if the WO
  // está firmada (signature_url) y podemos leer el PNG del bucket privado.
  if (wo.signature_url) {
    const sigImg = await loadSignatureDataUrl(wo.signature_url)
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

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_DARK)
  doc.text('TÉCNICO RESPONSABLE', sigX + sigBoxW / 2, bY + 26, { align: 'center' })

  // Prefer the explicit signer name when the WO está cerrada; fallback al
  // técnico principal para OTs aún sin firma.
  const signerName = wo.signed_off_by_name ?? wo.primary_technician?.full_name ?? null
  if (signerName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(signerName, sigX + sigBoxW / 2, bY + 31.5, { align: 'center' })
  }
  if (wo.signed_off_at) {
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `Firmado: ${new Date(wo.signed_off_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`,
      sigX + sigBoxW / 2, bY + 34.5, { align: 'center' },
    )
  } else if (wo.completed_at) {
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `Completada: ${new Date(wo.completed_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`,
      sigX + sigBoxW / 2, bY + 34.5, { align: 'center' },
    )
  }

  // ── Footer con paginación ─────────────────────────────────────────────────
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

/** Build the WO PDF and trigger a browser download.  Filename: `OT-<folio>.pdf`. */
export async function generateWoPDF(opts: GenerateWoPDFOptions): Promise<void> {
  const doc = await buildWoPdfDoc(opts)
  doc.save(`OT-${opts.wo.folio}.pdf`)
}

/** Build the WO PDF and return a Blob URL suitable for `<iframe src=...>`.
 *  Caller is responsible for revoking the URL with `URL.revokeObjectURL`
 *  when the preview is dismissed to free the blob. */
export async function previewWoPDF(opts: GenerateWoPDFOptions): Promise<string> {
  const doc = await buildWoPdfDoc(opts)
  const blob = doc.output('blob')
  return URL.createObjectURL(blob)
}

export default generateWoPDF
