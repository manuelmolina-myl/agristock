export type UserRole = 'super_admin' | 'gerente' | 'almacenista' | 'supervisor'

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

export type MovementStatus = 'draft' | 'posted' | 'cancelled'

export type Currency = 'MXN' | 'USD'

export type DestinationType = 'crop_lot' | 'equipment' | 'employee' | 'maintenance' | 'waste' | 'other'

export type EquipmentType = 'tractor' | 'implement' | 'vehicle' | 'pump' | 'other'

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
  role: UserRole
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
