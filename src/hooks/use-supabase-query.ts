import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './use-auth'
import type {
  Item,
  ItemStock,
  Category,
  Unit,
  Supplier,
  Warehouse,
  Equipment,
  Employee,
  Solicitud,
} from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type TableName =
  | 'categories'
  | 'units'
  | 'suppliers'
  | 'warehouses'
  | 'crops_lots'
  | 'equipment'
  | 'employees'
  | 'items'
  | 'item_stock'
  | 'stock_movements'
  | 'stock_movement_lines'
  | 'fx_rates'
  | 'adjustment_reasons'
  | 'seasons'
  | 'audit_log'
  | 'solicitudes'
  | 'solicitud_lines'

// ─── Generic list hook ───────────────────────────────────────────────────────

interface UseListOptions {
  select?: string
  orderBy?: string
  ascending?: boolean
  filters?: Record<string, unknown>
  enabled?: boolean
}

// Tables that have a deleted_at column for soft delete
const SOFT_DELETE_TABLES: TableName[] = [
  'categories', 'units', 'suppliers', 'warehouses',
  'crops_lots', 'equipment', 'employees', 'items',
]

// Tables that DON'T have organization_id
const NO_ORG_ID_TABLES: TableName[] = ['item_stock']

export function useList<T>(table: TableName, options: UseListOptions = {}) {
  const { organization } = useAuth()
  const orgId = organization?.id

  const {
    select: selectCols = '*',
    orderBy = 'created_at',
    ascending = false,
    filters = {},
    enabled = true,
  } = options

  return useQuery<T[]>({
    queryKey: [table, orgId, filters],
    queryFn: async () => {
      let query = db
        .from(table)
        .select(selectCols)

      // Only filter by org_id on tables that have it
      if (!NO_ORG_ID_TABLES.includes(table)) {
        query = query.eq('organization_id', orgId)
      }

      // Only filter deleted_at on tables that have soft delete
      if (SOFT_DELETE_TABLES.includes(table)) {
        query = query.is('deleted_at', null)
      }

      query = query.order(orderBy, { ascending })

      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          query = query.eq(key, value)
        }
      }

      const { data, error } = await query
      if (error) throw error
      return data as T[]
    },
    enabled: enabled && !!orgId,
  })
}

// ─── Generic single record hook ──────────────────────────────────────────────

export function useRecord<T>(table: TableName, id: string | undefined, select = '*') {
  return useQuery<T>({
    queryKey: [table, id],
    queryFn: async () => {
      const { data, error } = await db
        .from(table)
        .select(select)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as T
    },
    enabled: !!id,
  })
}

// ─── Generic create mutation ─────────────────────────────────────────────────

export function useCreate<T>(table: TableName) {
  const queryClient = useQueryClient()
  const { organization } = useAuth()

  return useMutation<T, Error, Partial<T>>({
    mutationFn: async (values) => {
      const { data, error } = await db
        .from(table)
        .insert({ ...values, organization_id: organization?.id })
        .select()
        .single()
      if (error) throw error
      return data as T
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] })
    },
  })
}

// ─── Generic update mutation ─────────────────────────────────────────────────

export function useUpdate<T>(table: TableName) {
  const queryClient = useQueryClient()

  return useMutation<T, Error, { id: string; values: Partial<T> }>({
    mutationFn: async ({ id, values }) => {
      const { data, error } = await db
        .from(table)
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as T
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] })
    },
  })
}

// ─── Soft delete mutation ────────────────────────────────────────────────────

export function useSoftDelete(table: TableName) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await db
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] })
    },
  })
}

// ─── Specific hooks with joins ───────────────────────────────────────────────

export function useItems(filters?: Record<string, unknown>) {
  return useList<Item>('items', {
    select: '*, category:categories(*), unit:units(*)',
    orderBy: 'sku',
    ascending: true,
    filters,
  })
}

export function useItem(id: string | undefined) {
  return useRecord<Item>('items', id, '*, category:categories(*), unit:units(*)')
}

export function useCategories() {
  return useList<Category>('categories', { orderBy: 'name', ascending: true })
}

export function useUnits() {
  return useList<Unit>('units', { orderBy: 'code', ascending: true })
}

export function useSuppliers() {
  return useList<Supplier>('suppliers', { orderBy: 'name', ascending: true })
}

export function useWarehouses() {
  return useList<Warehouse>('warehouses', { orderBy: 'code', ascending: true })
}

export function useCropLots(seasonId?: string) {
  const { activeSeason } = useAuth()
  const sid = seasonId ?? activeSeason?.id
  return useList('crops_lots', {
    orderBy: 'code',
    ascending: true,
    filters: sid ? { season_id: sid } : {},
  })
}

export function useEquipment() {
  return useList<Equipment>('equipment', { orderBy: 'code', ascending: true })
}

export function useEmployees() {
  return useList<Employee>('employees', { orderBy: 'employee_code', ascending: true })
}

export function useItemStock(filters?: Record<string, unknown>) {
  const { activeSeason } = useAuth()
  return useList<ItemStock & { item?: Item & { category?: Category; unit?: Unit }; warehouse?: { name: string; code: string } }>('item_stock', {
    select: '*, item:items(*, category:categories(*), unit:units(*)), warehouse:warehouses(*)',
    orderBy: 'quantity',
    ascending: false,
    filters: { season_id: activeSeason?.id, ...filters },
    enabled: !!activeSeason?.id,
  })
}

export function useFxRates() {
  return useList('fx_rates', { orderBy: 'date', ascending: false })
}

export function useAdjustmentReasons() {
  return useList('adjustment_reasons', { orderBy: 'label', ascending: true })
}

export function useSolicitudes(filters?: Record<string, unknown>) {
  return useList<Solicitud>('solicitudes', {
    select:
      '*, requester:profiles!solicitudes_requested_by_fkey(full_name), crop_lot:crops_lots(name, code), equipment:equipment(name, code), employee:employees(full_name)',
    orderBy: 'created_at',
    ascending: false,
    filters,
  })
}
