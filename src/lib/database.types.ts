// Legacy single-role type read from profiles.role (deprecated, kept for back-compat).
// New code should consume `UserRoleEnum` via usePermissions() / current_user_roles() RPC.
export type UserRole = 'super_admin' | 'admin' | 'gerente' | 'almacenista' | 'supervisor'

// Simplified 4-role model (migrations 024-026):
//   admin           — full access to all modules + approvals
//   compras         — procurement workspace (requisitions, quotes, POs, invoices, suppliers)
//   mantenimiento   — CMMS workspace (work orders, equipment, plans)
//   almacenista     — warehouse workspace (stock, receptions, dispatches, fuel)
// Legacy enum values still exist in the Postgres type but are revoked from
// every user_roles row; do not introduce them in new code.
export type UserRoleEnum =
  | 'admin'
  | 'compras'
  | 'mantenimiento'
  | 'almacenista'

// Permission claims used by usePermissions().can(claim). Each claim maps to a
// set of roles allowed to perform that action; see src/hooks/use-permissions.tsx.
export type PermissionClaim =
  | 'costs.view'
  | 'settings.manage'
  | 'users.manage'
  | 'purchase.create'
  | 'purchase.read'
  | 'purchase.approve'
  | 'stock_exit.create'
  | 'stock_exit.approve'
  | 'work_order.create'
  | 'work_order.assign'
  | 'work_order.close'
  | 'audit.read'

export type SeasonStatus = 'planning' | 'active' | 'closing' | 'closed'

export type MovementType =
  | 'entry_purchase'
  | 'entry_return'
  | 'entry_transfer'
  | 'entry_adjustment'
  | 'entry_initial'
  | 'exit_consumption'
  | 'exit_transfer'
  | 'exit_adjustment'
  | 'exit_waste'
  | 'exit_sale'
  // New types added in 016_stock_movement_types_extend.sql (Sprints 2-5).
  | 'entry_reception'
  | 'exit_work_order'
  | 'exit_fuel_dispensing'
  | 'exit_external_service'

// Polymorphic source-document type for stock_movements.source_type.
export type MovementSourceType =
  | 'purchase_order'
  | 'work_order'
  | 'fuel_dispensing'
  | 'service_event'

// ─── Purchasing (Sprint 2) ───────────────────────────────────────────────────

export type RequisitionStatus =
  | 'draft' | 'submitted' | 'in_quotation' | 'approved' | 'rejected'
  | 'po_generated' | 'cancelled'

export type RequisitionPriority = 'low' | 'medium' | 'high' | 'urgent'

export type QuotationStatus = 'requested' | 'received' | 'selected' | 'discarded'

export type QuoteRequestStatus = 'pending' | 'responded' | 'declined' | 'expired'

export interface PurchaseRequestQuote {
  id: string
  organization_id: string
  purchase_request_id: string
  supplier_id: string
  requested_by: string
  requested_at: string
  responded_at: string | null
  status: QuoteRequestStatus
  notes: string | null
  quotation_id: string | null
  created_at: string
  updated_at: string | null
}

export type POStatus =
  | 'draft' | 'pending_signature' | 'sent' | 'confirmed' | 'partially_received'
  | 'received' | 'closed' | 'cancelled'

export type ReceptionStatus = 'draft' | 'accepted' | 'rejected_partial' | 'rejected'

export type InvoiceStatus = 'pending' | 'reconciled' | 'paid' | 'cancelled' | 'discrepancy'

export interface PurchaseRequisition {
  id: string
  organization_id: string
  folio: string
  requester_id: string
  request_date: string
  priority: RequisitionPriority
  justification: string | null
  crop_lot_id: string | null
  equipment_id: string | null
  status: RequisitionStatus
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  estimated_total_mxn: number | null
  notes: string | null
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export interface RequisitionLine {
  id: string
  requisition_id: string
  item_id: string | null
  free_description: string | null
  quantity: number
  unit_id: string | null
  estimated_unit_cost: number | null
  currency: Currency | null
  notes: string | null
  created_at: string
}

export interface Quotation {
  id: string
  organization_id: string
  requisition_id: string
  supplier_id: string
  folio: string
  quotation_date: string
  status: QuotationStatus
  pdf_url: string | null
  payment_terms: string | null
  delivery_days: number | null
  validity_days: number | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface QuotationLine {
  id: string
  quotation_id: string
  requisition_line_id: string
  unit_cost: number
  currency: Currency
  discount_pct: number | null
  tax_pct: number | null
  available: boolean
  notes: string | null
}

export interface PurchaseOrder {
  id: string
  organization_id: string
  folio: string
  supplier_id: string
  quotation_id: string | null
  requisition_id: string | null
  issue_date: string
  expected_delivery_date: string | null
  payment_terms: string | null
  delivery_location: string | null
  destination_warehouse_id: string | null
  subtotal_mxn: number | null
  tax_mxn: number | null
  total_mxn: number | null
  subtotal_usd: number | null
  total_usd: number | null
  fx_rate: number | null
  status: POStatus
  pdf_url: string | null
  sent_to_supplier_at: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export interface POLine {
  id: string
  po_id: string
  item_id: string
  quantity: number
  unit_cost: number
  currency: Currency
  tax_pct: number | null
  received_quantity: number
  notes: string | null
}

export interface Reception {
  id: string
  organization_id: string
  folio: string
  po_id: string
  reception_date: string
  warehouse_id: string
  received_by: string | null
  supplier_delivery_note: string | null
  delivery_note_url: string | null
  quality_notes: string | null
  status: ReceptionStatus
  photos: unknown[]
  stock_movement_id: string | null
  created_at: string
}

export interface ReceptionLine {
  id: string
  reception_id: string
  po_line_id: string
  item_id: string
  received_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  rejection_reason: string | null
  supplier_lot: string | null
  expiry_date: string | null
  notes: string | null
}

// ─── CMMS (Sprint 3) ─────────────────────────────────────────────────────────

export type WOType = 'corrective' | 'preventive' | 'predictive' | 'improvement' | 'inspection'
export type WOPriority = 'low' | 'medium' | 'high' | 'critical'
export type WOStatus =
  | 'reported' | 'scheduled' | 'assigned' | 'in_progress' | 'waiting_parts'
  | 'completed' | 'closed' | 'cancelled'
export type PlanTriggerType = 'hours' | 'kilometers' | 'calendar' | 'usage_hours'

export interface MaintenancePlan {
  id: string
  organization_id: string
  equipment_id: string
  name: string
  trigger_type: PlanTriggerType
  interval_value: number
  interval_unit: string
  last_execution_value: number | null
  next_execution_value: number
  advance_warning: number | null
  default_checklist: unknown[]
  is_active: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export interface WorkOrder {
  id: string
  organization_id: string
  folio: string
  equipment_id: string
  wo_type: WOType
  priority: WOPriority
  failure_description: string | null
  failure_type_id: string | null
  maintenance_plan_id: string | null
  reported_by: string | null
  reported_at: string
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  status: WOStatus
  primary_technician_id: string | null
  helper_technician_ids: string[]
  estimated_hours: number | null
  actual_hours: number | null
  hours_meter_open: number | null
  hours_meter_close: number | null
  downtime_minutes: number | null
  solution_applied: string | null
  notes: string | null
  requires_external_service: boolean
  external_supplier_id: string | null
  external_service_cost_mxn: number | null
  total_cost_mxn: number | null
  photos_before: unknown[]
  photos_after: unknown[]
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export interface WOChecklistItem {
  id: string
  wo_id: string
  task_description: string
  is_completed: boolean
  completed_by: string | null
  completed_at: string | null
  notes: string | null
  display_order: number
}

export interface WOPart {
  id: string
  wo_id: string
  item_id: string
  requested_quantity: number
  delivered_quantity: number
  stock_movement_line_id: string | null
  total_cost_mxn: number | null
  status: 'requested' | 'delivered' | 'partially_delivered' | 'returned'
  created_at: string
}

export interface WOLabor {
  id: string
  wo_id: string
  technician_id: string
  work_date: string
  hours: number
  hourly_rate_mxn: number | null
  total_mxn: number
  notes: string | null
  created_at: string
}

export interface SupplierInvoice {
  id: string
  organization_id: string
  po_id: string
  supplier_id: string
  invoice_folio: string
  cfdi_uuid: string | null
  issue_date: string
  due_date: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  currency: Currency
  pdf_url: string | null
  xml_url: string | null
  status: InvoiceStatus
  reconciled_at: string | null
  reconciled_by: string | null
  discrepancies: unknown | null
  notes: string | null
  created_at: string
}

export type MovementStatus = 'draft' | 'posted' | 'cancelled'

export type Currency = 'MXN' | 'USD'

export type DestinationType = 'crop_lot' | 'equipment' | 'employee' | 'maintenance' | 'waste' | 'other'

// Legacy equipment.type (deprecated; will be dropped end of Sprint 3 — CMMS module).
export type EquipmentType = 'tractor' | 'implement' | 'vehicle' | 'pump' | 'other'

// New CMMS-ready columns added in 015_equipment_cmms_fields.sql.
export type EquipmentStatus = 'operational' | 'in_maintenance' | 'out_of_service' | 'disposed'

export type EquipmentKind =
  | 'vehicle'
  | 'machinery'
  | 'implement'
  | 'installation'
  | 'irrigation_system'
  | 'tool'
  | 'other'

export type UnitType = 'mass' | 'volume' | 'count' | 'length'

export type FxSource = 'DOF_FIX' | 'banxico' | 'manual'

export type AdjustmentReason =
  | 'conteo_fisico'
  | 'merma'
  | 'dano'
  | 'caducidad'
  | 'error_captura'
  | 'otro'

export interface Profile {
  id: string
  organization_id: string
  full_name: string
  role: UserRoleEnum
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export interface Organization {
  id: string
  name: string
  rfc: string | null
  address: string | null
  logo_url: string | null
  base_currency: Currency
  timezone: string
  onboarding_completed: boolean
  created_at: string
}

export interface Season {
  id: string
  organization_id: string
  name: string
  start_date: string
  end_date: string
  status: SeasonStatus
  closed_at: string | null
  closed_by: string | null
  created_at: string
}

export interface Warehouse {
  id: string
  organization_id: string
  name: string
  code: string
  address: string | null
  responsible_user_id: string | null
  is_active: boolean
}

export interface Category {
  id: string
  organization_id: string
  name: string
  parent_id: string | null
  icon: string | null
  color: string | null
  prefix: string | null
}

export interface Unit {
  id: string
  organization_id: string
  code: string
  name: string
  type: UnitType
}

export interface Supplier {
  id: string
  organization_id: string
  name: string
  rfc: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  default_currency: Currency
}

export interface CropLot {
  id: string
  organization_id: string
  season_id: string
  name: string
  code: string
  crop_type: string
  hectares: number
  planting_date: string | null
  expected_harvest_date: string | null
  status: string
  color: string | null
}

export interface Equipment {
  id: string
  organization_id: string
  code: string
  name: string
  type: EquipmentType
  brand: string | null
  model: string | null
  plate: string | null
  year: number | null
  current_hours: number | null
  current_km: number | null
  is_active: boolean
}

export interface Employee {
  id: string
  organization_id: string
  employee_code: string
  full_name: string
  role_field: string | null
  is_active: boolean
}

export interface Item {
  id: string
  organization_id: string
  sku: string
  name: string
  description: string | null
  category_id: string | null
  unit_id: string | null
  native_currency: Currency
  barcode: string | null
  min_stock: number | null
  max_stock: number | null
  reorder_point: number | null
  is_diesel: boolean
  is_active: boolean
  image_url: string | null
  notes: string | null
  // Joined
  category?: Category
  unit?: Unit
}

export interface ItemStock {
  item_id: string
  warehouse_id: string
  season_id: string
  quantity: number
  avg_cost_native: number
  avg_cost_mxn: number
  last_movement_at: string | null
}

export interface StockMovement {
  id: string
  organization_id: string
  season_id: string
  movement_type: MovementType
  warehouse_id: string
  counterpart_warehouse_id: string | null
  document_number: string | null
  folio_fisico: string | null
  reference_external: string | null
  supplier_id: string | null
  fx_rate: number | null
  fx_source: FxSource | null
  fx_date: string | null
  total_mxn: number | null
  total_usd: number | null
  status: MovementStatus
  posted_at: string | null
  posted_by: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  notes: string | null
  attachment_urls: string[] | null
  delivered_by_employee_id: string | null
  received_by_employee_id: string | null
  transport_notes: string | null
  created_at: string
  created_by: string | null
  // Joined
  warehouse?: Warehouse
  counterpart_warehouse?: Warehouse
  supplier?: Supplier
  delivered_by_employee?: Employee
  received_by_employee?: Employee
  lines?: StockMovementLine[]
}

export interface StockMovementLine {
  id: string
  movement_id: string
  item_id: string
  quantity: number
  unit_cost_native: number
  native_currency: Currency
  unit_cost_mxn: number
  line_total_native: number
  line_total_mxn: number
  iva_rate: number
  destination_type: DestinationType | null
  crop_lot_id: string | null
  equipment_id: string | null
  employee_id: string | null
  cost_center_notes: string | null
  diesel_liters: number | null
  equipment_hours_before: number | null
  equipment_hours_after: number | null
  equipment_km_before: number | null
  equipment_km_after: number | null
  operator_employee_id: string | null
  // Joined
  item?: Item
  crop_lot?: CropLot
  equipment?: Equipment
  employee?: Employee
}

export interface FxRate {
  id: string
  organization_id: string
  date: string
  currency_from: Currency
  currency_to: Currency
  rate: number
  source: FxSource
  created_by: string | null
}

export interface AuditLog {
  id: number
  organization_id: string
  occurred_at: string
  user_id: string | null
  user_email: string | null
  ip_address: string | null
  user_agent: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  diff: Record<string, unknown> | null
  context: Record<string, unknown> | null
}

// Supabase generated types placeholder
export interface Database {
  public: {
    Tables: Record<string, unknown>
    Views: Record<string, unknown>
    Functions: Record<string, unknown>
    Enums: Record<string, unknown>
  }
}

// ─── Solicitudes ─────────────────────────────────────────────────────────────

export type SolicitudStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'entregada'
export type SolicitudUrgency = 'baja' | 'normal' | 'alta' | 'urgente'

export interface Solicitud {
  id: string
  organization_id: string
  season_id: string
  requested_by: string
  destination_type: DestinationType | null
  crop_lot_id: string | null
  equipment_id: string | null
  employee_id: string | null
  destination_notes: string | null
  status: SolicitudStatus
  urgency: SolicitudUrgency
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  delivered_at: string | null
  delivered_by: string | null
  created_at: string
  updated_at: string | null
  // Joined
  requester?: { full_name: string }
  crop_lot?: CropLot
  equipment?: Equipment
  employee?: Employee
  lines?: SolicitudLine[]
}

export interface SolicitudLine {
  id: string
  solicitud_id: string
  item_id: string
  quantity_requested: number
  quantity_approved: number | null
  notes: string | null
  created_at: string
  // Joined
  item?: Item
}
