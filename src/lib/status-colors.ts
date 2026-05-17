/**
 * Shared status / urgency / audit colour maps used by multiple pages.
 *
 * All colours resolve through the "Tierra cultivada" semantic token palette
 * defined in src/index.css, so dark mode flips automatically — no `dark:`
 * variants are required here.
 */

import type { SolicitudStatus, SolicitudUrgency } from '@/lib/database.types'

// ─── Solicitud status ─────────────────────────────────────────────────────────

export const solicitudStatusColors: Record<SolicitudStatus, string> = {
  pendiente: 'border-warning/30 bg-warning/10 text-warning',
  aprobada:  'border-success/30 bg-success/10 text-success',
  rechazada: 'border-destructive/30 bg-destructive/10 text-destructive',
  entregada: 'border-usd/30 bg-usd/10 text-usd',
}

// ─── Solicitud urgency ────────────────────────────────────────────────────────
//
// `baja` keeps its neutral tone via muted; `alta` uses warning (orange-ish) and
// `urgente` uses destructive to convey escalating severity inside the semantic
// palette.

export const solicitudUrgencyColors: Record<SolicitudUrgency, string> = {
  baja:    'border-border bg-muted/30 text-muted-foreground',
  normal:  'border-usd/30 bg-usd/10 text-usd',
  alta:    'border-warning/30 bg-warning/10 text-warning',
  urgente: 'border-destructive/30 bg-destructive/10 text-destructive',
}

// ─── Audit log action colours ─────────────────────────────────────────────────

export const auditOpColors: Record<'INSERT' | 'UPDATE' | 'DELETE', string> = {
  INSERT: 'bg-success/15 text-success border-success/30 hover:bg-success/20',
  UPDATE: 'bg-usd/15 text-usd border-usd/30 hover:bg-usd/20',
  DELETE: 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20',
}

export const auditOpDotColors: Record<'INSERT' | 'UPDATE' | 'DELETE', string> = {
  INSERT: 'bg-success',
  UPDATE: 'bg-usd',
  DELETE: 'bg-destructive',
}
