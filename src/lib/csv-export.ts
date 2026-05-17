/**
 * Client-side CSV export helper.
 *
 * Builds a CSV string from an array of records, escaping cells that contain
 * commas, quotes or newlines per RFC 4180. Triggers a browser download via a
 * Blob URL — no server round-trip required.
 *
 * Usage:
 *   exportToCsv({
 *     filename: 'auditoria-2026-05-16.csv',
 *     headers: ['occurred_at', 'table_name', 'operation'],
 *     rows: data.map(d => [d.occurred_at, d.entity_type, d.action]),
 *   })
 */

export interface CsvExportOptions {
  filename: string
  headers: string[]
  rows: Array<Array<string | number | null | undefined>>
}

/** Escape a single CSV cell per RFC 4180. */
function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if the cell contains comma, quote, newline or carriage return.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Build a CSV string from headers + rows. */
export function buildCsv(headers: string[], rows: CsvExportOptions['rows']): string {
  const lines: string[] = []
  lines.push(headers.map(escapeCell).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  // Prepend BOM so Excel opens UTF-8 cleanly with accents (á, é, ñ).
  return '﻿' + lines.join('\r\n')
}

/** Trigger a browser download of the CSV file. */
export function exportToCsv({ filename, headers, rows }: CsvExportOptions): void {
  const csv = buildCsv(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so the click handler can process before the URL is invalidated.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
