import type { UserRole } from './database.types'

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  gerente: 'Gerente / Controller',
  almacenista: 'Almacenista',
  supervisor: 'Supervisor de Campo',
}

export const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: '/admin',
  gerente: '/gerente',
  almacenista: '/almacenista',
  supervisor: '/supervisor',
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
