import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { WorkOrder, WOStatus, WOPriority, WOType } from '@/lib/database.types'
import type { CreateCorrectiveWOInput, AssignWOInput, ConsumePartInput, CloseWOInput } from './schemas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export const cmmsKeys = {
  all: ['cmms'] as const,
  workOrders: (orgId?: string) => ['cmms', 'work-orders', orgId] as const,
  workOrder: (id: string) => ['cmms', 'work-orders', 'detail', id] as const,
  woParts: (woId: string) => ['cmms', 'wo-parts', woId] as const,
  woLabor: (woId: string) => ['cmms', 'wo-labor', woId] as const,
  woChecklist: (woId: string) => ['cmms', 'wo-checklist', woId] as const,
  plans: (orgId?: string) => ['cmms', 'maintenance-plans', orgId] as const,
  history: (orgId?: string) => ['cmms', 'mv-history', orgId] as const,
}

export interface WOFilters {
  status?: WOStatus | 'all'
  priority?: WOPriority | 'all'
  type?: WOType | 'all'
  search?: string
  equipment_id?: string
  technician_id?: string
}

interface WORow extends WorkOrder {
  equipment?: { code: string; name: string } | null
  failure_type?: { code: string; label: string; severity: string } | null
  primary_technician?: { full_name: string } | null
  reporter?: { full_name: string } | null
}

export function useWorkOrders(filters: WOFilters = {}) {
  const { organization } = useAuth()
  return useQuery<WORow[]>({
    queryKey: [...cmmsKeys.workOrders(organization?.id), filters],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = db
        .from('work_orders')
        .select(`
          *,
          equipment:equipment!work_orders_equipment_id_fkey(code, name),
          failure_type:failure_types(code, label, severity),
          primary_technician:employees!work_orders_primary_technician_id_fkey(full_name),
          reporter:profiles!work_orders_reported_by_fkey(full_name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(300)

      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority)
      if (filters.type && filters.type !== 'all') q = q.eq('wo_type', filters.type)
      if (filters.equipment_id) q = q.eq('equipment_id', filters.equipment_id)
      if (filters.technician_id) q = q.eq('primary_technician_id', filters.technician_id)
      if (filters.search) q = q.ilike('folio', `%${filters.search}%`)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WORow[]
    },
  })
}

export function useWorkOrder(id: string | undefined) {
  return useQuery<WORow | null>({
    queryKey: cmmsKeys.workOrder(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('work_orders')
        .select(`
          *,
          equipment:equipment!work_orders_equipment_id_fkey(code, name, kind, status, current_hours),
          failure_type:failure_types(code, label, severity),
          primary_technician:employees!work_orders_primary_technician_id_fkey(full_name),
          reporter:profiles!work_orders_reported_by_fkey(full_name)
        `)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as WORow | null
    },
  })
}

export function useCreateCorrectiveWO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCorrectiveWOInput) => {
      const { data, error } = await db.rpc('create_corrective_wo', {
        p_equipment_id:    input.equipment_id,
        p_failure_type_id: input.failure_type_id ?? null,
        p_description:     input.description,
        p_priority:        input.priority,
        p_photos:          input.photos ?? [],
        p_scheduled_date:  input.scheduled_date ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cmmsKeys.all }),
  })
}

export function useAssignWO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AssignWOInput) => {
      const { error } = await db.rpc('assign_wo', {
        p_wo_id:           input.wo_id,
        p_technician_id:   input.technician_id,
        p_helpers:         input.helpers,
        p_scheduled_date:  input.scheduled_date ?? null,
        p_estimated_hours: input.estimated_hours ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cmmsKeys.all }),
  })
}

export function useConsumePartInWO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ConsumePartInput) => {
      const { data, error } = await db.rpc('consume_part_in_wo', {
        p_wo_id:        input.wo_id,
        p_item_id:      input.item_id,
        p_warehouse_id: input.warehouse_id,
        p_quantity:     input.quantity,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cmmsKeys.all })
      qc.invalidateQueries({ queryKey: ['item-stock'] })
    },
  })
}

export function useCloseWO() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CloseWOInput) => {
      const { error } = await db.rpc('close_wo', {
        p_wo_id:             input.wo_id,
        p_solution:          input.solution,
        p_photos_after:      input.photos_after ?? [],
        p_hours_meter_close: input.hours_meter_close ?? null,
        p_external_cost:     input.external_cost ?? null,
        p_force:             input.force ?? false,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cmmsKeys.all }),
  })
}
