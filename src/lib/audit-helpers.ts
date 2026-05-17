/**
 * audit-helpers — shared label/colour helpers for the audit_log feed.
 *
 * Extracted from admin & gerente dashboards so the new Cockpit del Director
 * can reuse them without copy-paste. Pure functions, no React imports.
 */

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    INSERT: 'Creó',
    UPDATE: 'Actualizó',
    DELETE: 'Eliminó',
  }
  return map[action] ?? action
}

export function entityLabel(entity: string): string {
  const map: Record<string, string> = {
    items: 'artículo',
    stock_movements: 'movimiento',
    stock_movement_lines: 'línea',
    warehouses: 'almacén',
    suppliers: 'proveedor',
    categories: 'categoría',
    seasons: 'temporada',
    fx_rates: 'tipo de cambio',
    adjustment_reasons: 'motivo de ajuste',
    units: 'unidad',
    equipment: 'equipo',
    employees: 'empleado',
    crops_lots: 'lote',
    crop_lots: 'lote',
    purchase_requisitions: 'requisición',
    purchase_requisition_lines: 'línea de requisición',
    quotations: 'cotización',
    quotation_lines: 'línea de cotización',
    purchase_orders: 'orden de compra',
    po_lines: 'línea de OC',
    receptions: 'recepción',
    reception_lines: 'línea de recepción',
    supplier_invoices: 'factura',
    work_orders: 'orden de trabajo',
    wo_parts: 'refacción de OT',
    wo_labor: 'mano de obra',
    wo_checklist_items: 'tarea de checklist',
    maintenance_plans: 'plan de mantenimiento',
    solicitudes: 'solicitud',
    solicitud_lines: 'línea de solicitud',
  }
  return map[entity] ?? entity
}

export function actionBadgeColor(action: string): string {
  if (action === 'INSERT') return 'bg-success/15 text-success'
  if (action === 'DELETE') return 'bg-destructive/15 text-destructive'
  return 'bg-usd/15 text-usd'
}

export function userInitial(email: string | null): string {
  if (!email) return '?'
  return email[0].toUpperCase()
}

// ─── Module classification ──────────────────────────────────────────────────
// Used by the Cockpit del Director feed filters. Maps an audit_log.entity_type
// value to one of the high-level modules so we can chip-filter the feed.

export type AuditModule = 'compras' | 'mantenimiento' | 'almacen' | 'other'

const COMPRAS_ENTITIES = new Set([
  'purchase_requisitions',
  'purchase_requisition_lines',
  'quotations',
  'quotation_lines',
  'purchase_orders',
  'po_lines',
  'receptions',
  'reception_lines',
  'supplier_invoices',
  'suppliers',
])

const MANTENIMIENTO_ENTITIES = new Set([
  'work_orders',
  'wo_parts',
  'wo_labor',
  'wo_checklist_items',
  'maintenance_plans',
  'equipment',
])

const ALMACEN_ENTITIES = new Set([
  'stock_movements',
  'stock_movement_lines',
  'items',
  'item_stock',
  'warehouses',
  'solicitudes',
  'solicitud_lines',
])

export function moduleForEntity(entity: string): AuditModule {
  if (COMPRAS_ENTITIES.has(entity)) return 'compras'
  if (MANTENIMIENTO_ENTITIES.has(entity)) return 'mantenimiento'
  if (ALMACEN_ENTITIES.has(entity)) return 'almacen'
  return 'other'
}
