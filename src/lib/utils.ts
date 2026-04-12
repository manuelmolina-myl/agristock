import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { TIMEZONE } from './constants'
import type { Currency } from './database.types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFecha(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const zoned = toZonedTime(d, TIMEZONE)
  return format(zoned, "d 'de' MMMM yyyy", { locale: es })
}

export function formatFechaCorta(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const zoned = toZonedTime(d, TIMEZONE)
  return format(zoned, 'dd/MM/yyyy', { locale: es })
}

export function formatHora(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const zoned = toZonedTime(d, TIMEZONE)
  return format(zoned, 'HH:mm', { locale: es })
}

export function formatRelativo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: es })
}

export function formatMoney(amount: number, currency: Currency = 'MXN'): string {
  const symbol = currency === 'USD' ? 'US$' : '$'
  const formatted = new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${symbol}${formatted}`
}

export function formatQuantity(qty: number, decimals = 2): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(qty)
}

export function isEntryMovement(type: string): boolean {
  return type.startsWith('entry_')
}

export function isExitMovement(type: string): boolean {
  return type.startsWith('exit_')
}
