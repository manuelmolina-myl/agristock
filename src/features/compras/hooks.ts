/**
 * TanStack Query hooks for the compras (procurement) module.
 *
 * Query keys are hierarchical and scoped by organization to keep cache
 * invalidation explicit and prevent cross-tenant leaks when the same tab
 * is reused across logins.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  PurchaseRequisition, RequisitionLine, RequisitionStatus,
  PurchaseOrder, POLine, POStatus,
  Reception, Quotation,
  SupplierInvoice,
  PurchaseRequestQuote,
} from '@/lib/database.types'
import type { RequisitionCreateInput, ReceptionCreateInput } from './schemas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Query keys ────────────────────────────────────────────────────────────

export const comprasKeys = {
  all: ['compras'] as const,
  requisitions: (orgId?: string) => ['compras', 'requisitions', orgId] as const,
  requisition: (id: string) => ['compras', 'requisitions', 'detail', id] as const,
  quotations: (orgId?: string) => ['compras', 'quotations', orgId] as const,
  quotationsByReq: (reqId: string) => ['compras', 'quotations', 'by-req', reqId] as const,
  quoteRequests: (reqId: string) => ['compras', 'quote-requests', reqId] as const,
  pos: (orgId?: string) => ['compras', 'purchase-orders', orgId] as const,
  po: (id: string) => ['compras', 'purchase-orders', 'detail', id] as const,
  poLines: (poId: string) => ['compras', 'po-lines', poId] as const,
  receptions: (orgId?: string) => ['compras', 'receptions', orgId] as const,
  invoices: (orgId?: string) => ['compras', 'invoices', orgId] as const,
}

// ─── Filters ───────────────────────────────────────────────────────────────

export interface RequisitionFilters {
  status?: RequisitionStatus | 'all'
  search?: string
}

export interface POFilters {
  status?: POStatus | 'all'
  supplier_id?: string
  search?: string
}

// ─── Requisitions ──────────────────────────────────────────────────────────

interface RequisitionRow extends PurchaseRequisition {
  requester?: { full_name: string } | null
  crop_lot?: { name: string } | null
  equipment?: { name: string } | null
  lines?: Array<RequisitionLine & { item?: { name: string; sku: string } | null }>
}

export function useRequisitions(filters: RequisitionFilters = {}) {
  const { organization } = useAuth()
  return useQuery<RequisitionRow[]>({
    queryKey: [...comprasKeys.requisitions(organization?.id), filters],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // Explicit `organization_id` filter mirrors the dashboard KPI query —
      // this keeps the list view and the "Solicitudes nuevas" count in lock
      // step even if RLS or the cached session momentarily disagree.
      let q = db
        .from('purchase_requisitions')
        .select(`
          *,
          requester:profiles!purchase_requisitions_requester_id_fkey(full_name),
          crop_lot:crops_lots(name),
          equipment:equipment(name)
        `)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.search) q = q.ilike('folio', `%${filters.search}%`)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as RequisitionRow[]
    },
  })
}

export function useRequisition(id: string | undefined) {
  return useQuery<RequisitionRow | null>({
    queryKey: comprasKeys.requisition(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_requisitions')
        .select(`
          *,
          requester:profiles!purchase_requisitions_requester_id_fkey(full_name),
          crop_lot:crops_lots(name),
          equipment:equipment(name),
          lines:requisition_lines(*, item:items(name, sku))
        `)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as RequisitionRow | null
    },
  })
}

export function useCreateRequisition() {
  const qc = useQueryClient()
  const { organization, user } = useAuth()
  return useMutation({
    mutationFn: async (input: RequisitionCreateInput) => {
      if (!organization?.id || !user?.id) throw new Error('No session')

      // Atomic insert via RPC (migración 039).  Two separate REST calls
      // (parent + lines) used to leave the parent orphaned if the line
      // insert failed, breaking the comparator afterwards.  The RPC wraps
      // both inserts in a transaction so any failure rolls back the parent.
      const { data, error } = await db.rpc('create_requisition', {
        p_input: {
          priority: input.priority,
          justification: input.justification,
          crop_lot_id: input.crop_lot_id ?? null,
          equipment_id: input.equipment_id ?? null,
          notes: input.notes ?? null,
          lines: input.lines.map((l) => ({
            item_id: l.item_id,
            free_description: l.item_id ? null : l.free_description,
            quantity: l.quantity,
            unit_id: l.unit_id,
            estimated_unit_cost: l.estimated_unit_cost,
            currency: l.currency,
            notes: l.notes ?? null,
          })),
        },
      })
      if (error) throw error
      return data as PurchaseRequisition
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: comprasKeys.all })
    },
  })
}

export function useApproveRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await db.rpc('approve_requisition', {
        p_requisition_id: id,
        p_note: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: comprasKeys.all }),
  })
}

export function useRejectRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await db.rpc('reject_requisition', {
        p_requisition_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: comprasKeys.all }),
  })
}

// ─── Quotations ─────────────────────────────────────────────────────────────

export function useQuotationsByRequisition(reqId: string | undefined) {
  return useQuery<Quotation[]>({
    queryKey: comprasKeys.quotationsByReq(reqId ?? ''),
    enabled: !!reqId,
    queryFn: async () => {
      const { data, error } = await db
        .from('quotations')
        .select('*, supplier:suppliers(name, rfc)')
        .eq('requisition_id', reqId)
        .order('quotation_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Quotation[]
    },
  })
}

// ─── Quote requests (outreach to suppliers) ────────────────────────────────

export interface QuoteRequestRow extends PurchaseRequestQuote {
  supplier?: { id: string; name: string; rfc: string | null; currencies: Array<'MXN' | 'USD'> } | null
  requester?: { full_name: string } | null
}

/**
 * All outreach (quote-request) rows for a given requisition, joined with
 * minimal supplier + requester metadata.
 */
export function useQuoteRequests(reqId: string | undefined) {
  return useQuery<QuoteRequestRow[]>({
    queryKey: comprasKeys.quoteRequests(reqId ?? ''),
    enabled: !!reqId,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_request_quotes')
        .select(`
          *,
          supplier:suppliers(id, name, rfc, currencies),
          requester:profiles!purchase_request_quotes_requested_by_fkey(full_name)
        `)
        .eq('purchase_request_id', reqId)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as QuoteRequestRow[]
    },
  })
}

/**
 * Bulk create outreach rows for a requisition. Idempotent on the server side:
 * suppliers already asked are silently skipped.
 */
export function useCreateQuoteRequests() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      requisitionId, supplierIds, notes,
    }: { requisitionId: string; supplierIds: string[]; notes?: string }) => {
      const { data, error } = await db.rpc('create_quote_requests', {
        p_request_id: requisitionId,
        p_supplier_ids: supplierIds,
        p_notes: notes ?? null,
      })
      if (error) throw error
      return (data ?? []) as PurchaseRequestQuote[]
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: comprasKeys.quoteRequests(vars.requisitionId) })
      qc.invalidateQueries({ queryKey: comprasKeys.requisition(vars.requisitionId) })
      qc.invalidateQueries({ queryKey: comprasKeys.all })
    },
  })
}

// ─── Purchase Orders ────────────────────────────────────────────────────────

interface POWithRelations extends PurchaseOrder {
  supplier?: { name: string; rfc: string | null } | null
  warehouse?: { name: string; code: string | null } | null
}

export function usePurchaseOrders(filters: POFilters = {}) {
  const { organization } = useAuth()
  return useQuery<POWithRelations[]>({
    queryKey: [...comprasKeys.pos(organization?.id), filters],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = db
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name, rfc),
          warehouse:warehouses!purchase_orders_destination_warehouse_id_fkey(name, code)
        `)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
        .limit(200)

      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.supplier_id) q = q.eq('supplier_id', filters.supplier_id)
      if (filters.search) q = q.ilike('folio', `%${filters.search}%`)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as POWithRelations[]
    },
  })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery<(POWithRelations & { lines: POLine[] }) | null>({
    queryKey: comprasKeys.po(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name, rfc),
          warehouse:warehouses!purchase_orders_destination_warehouse_id_fkey(name, code),
          lines:po_lines(*, item:items(name, sku))
        `)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as (POWithRelations & { lines: POLine[] }) | null
    },
  })
}

export function useGeneratePOFromRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      requisitionId: string
      supplierId: string
      quotationId?: string
      warehouseId?: string
      expectedDate?: string
      paymentTerms?: string
    }) => {
      const { data, error } = await db.rpc('generate_po_from_requisition', {
        p_requisition_id: input.requisitionId,
        p_supplier_id:    input.supplierId,
        p_quotation_id:   input.quotationId ?? null,
        p_warehouse_id:   input.warehouseId ?? null,
        p_expected_date:  input.expectedDate ?? null,
        p_payment_terms:  input.paymentTerms ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: comprasKeys.all }),
  })
}

// ─── Receptions ─────────────────────────────────────────────────────────────

export function useReceptions() {
  const { organization } = useAuth()
  return useQuery<Reception[]>({
    queryKey: comprasKeys.receptions(organization?.id),
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('receptions')
        .select('*, po:purchase_orders(folio, supplier:suppliers(name)), warehouse:warehouses(name)')
        .order('reception_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Reception[]
    },
  })
}

export function useProcessReception() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReceptionCreateInput) => {
      const { data, error } = await db.rpc('process_reception', {
        p_po_id:         input.po_id,
        p_warehouse_id:  input.warehouse_id,
        p_lines:         input.lines,
        p_supplier_note: input.supplier_note ?? null,
        p_quality_notes: input.quality_notes ?? null,
        p_photos:        input.photos ?? [],
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: comprasKeys.all })
      qc.invalidateQueries({ queryKey: ['item-stock'] }) // legacy hook
    },
  })
}

// ─── Supplier invoices ──────────────────────────────────────────────────────

export function useSupplierInvoices() {
  const { organization } = useAuth()
  return useQuery<SupplierInvoice[]>({
    queryKey: comprasKeys.invoices(organization?.id),
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('supplier_invoices')
        .select('*, supplier:suppliers(name)')
        .order('issue_date', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as SupplierInvoice[]
    },
  })
}
