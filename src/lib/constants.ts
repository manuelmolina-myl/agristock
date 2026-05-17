import type { UserRole, UserRoleEnum } from './database.types'

// Legacy labels keyed by profiles.role. Kept for back-compat while components
// migrate to ROLE_LABELS_NEW. Removed once 020 drops profiles.role.
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  gerente: 'Gerente',
  almacenista: 'Almacenista',
  supervisor: 'Supervisor de Campo',
}

export const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: '/admin',
  admin: '/admin',
  gerente: '/gerente',
  almacenista: '/almacenista',
  supervisor: '/supervisor',
}

// Labels keyed by UserRoleEnum (4-role model, migrations 024-026).
export const ROLE_LABELS_NEW: Record<UserRoleEnum, string> = {
  admin:         'Administrador',
  compras:       'Compras',
  mantenimiento: 'Mantenimiento',
  almacenista:   'Almacenista',
}

// Short labels used inside compact UIs (sidebar collapsed, mobile chips).
export const ROLE_LABELS_SHORT: Record<UserRoleEnum, string> = {
  admin:         'Admin',
  compras:       'Compras',
  mantenimiento: 'Mantto.',
  almacenista:   'Almacén',
}

// Routes by primary role — login drops the user in their main module.
export const ROLE_ROUTES_NEW: Record<UserRoleEnum, string> = {
  admin:         '/almacen',
  compras:       '/compras',
  mantenimiento: '/mantenimiento',
  almacenista:   '/almacen',
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  entry_purchase: 'Compra',
  entry_return: 'Devolución',
  entry_transfer: 'Traspaso entrada',
  entry_adjustment: 'Ajuste entrada',
  entry_initial: 'Saldo inicial',
  exit_consumption: 'Consumo',
  exit_transfer: 'Traspaso salida',
  exit_adjustment: 'Ajuste salida',
  exit_waste: 'Merma',
  exit_sale: 'Venta',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  MXN: '$',
  USD: 'US$',
}

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  conteo_fisico: 'Conteo físico',
  merma: 'Merma',
  dano: 'Daño',
  caducidad: 'Caducidad',
  error_captura: 'Error de captura',
  otro: 'Otro',
}

export const CATEGORY_ICONS: Record<string, string> = {
  agroquimicos: 'Beaker',
  fertilizantes: 'Leaf',
  semillas: 'Sprout',
  refacciones: 'Wrench',
  herramientas: 'Hammer',
  combustible: 'Fuel',
  consumibles: 'Package',
  epp: 'HardHat',
}

export const TIMEZONE = 'America/Mazatlan'

export const SOLICITUD_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  entregada: 'Entregada',
}

export const SOLICITUD_URGENCY_LABELS: Record<string, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const DESTINATION_TYPE_LABELS: Record<string, string> = {
  crop_lot: 'Lote de cultivo',
  equipment: 'Equipo',
  employee: 'Empleado',
  maintenance: 'Mantenimiento',
  other: 'Otro',
}
