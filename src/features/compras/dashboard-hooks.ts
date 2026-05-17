/**
 * Aggregated KPIs for the Compras module dashboard.
 * Each hook is small and independently cached so we don't refetch the whole
 * dashboard when a single mutation invalidates one slice.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface ComprasKpis {
  requisitions: {
    submitted: number
    in_quotation: number
    approved_pending_po: number
  }
  orders: {
    awaiting_reception: number
    partially_received: number
    overdue: number       // OCs past expected_delivery_date and not received
  }
  invoices: {
    pending: number
    with_discrepancy: number
  }
  spend_month_mxn: number
  open_value_mxn: number  // sum of total_mxn for open POs
}

export function useComprasKpis() {
  const { organization } = useAuth()
  return useQuery<ComprasKpis>({
    queryKey: ['compras-kpis', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const monthStart = new Date()
      monthStart.setDate(1)
      const monthStartIso = monthStart.toISOString().slice(0, 10)

      // 1) Requisitions by status — filter explicitly by organization_id so
      // the KPI matches the list view in `RequisicionesTab` (which also
      // applies the implicit RLS org scope).  Without the explicit `eq`,
      // stale React Query caches from a previous org could leak across
      // tenants when the same tab is reused after switching organizations,
      // and the resulting count would diverge from the list.
      const { data: reqsRaw, error: reqsErr } = await db
        .from('purchase_requisitions')
        .select('status')
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
      if (reqsErr) throw reqsErr
      const reqs = (reqsRaw ?? []) as Array<{ status: string }>

      // 2) POs by status + overdue check
      const { data: posRaw, error: posErr } = await db
        .from('purchase_orders')
        .select('status, expected_delivery_date, total_mxn, issue_date')
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
      if (posErr) throw posErr
      const pos = (posRaw ?? []) as Array<{
        status: string
        expected_delivery_date: string | null
        total_mxn: number | null
        issue_date: string
      }>

      const awaitingReception = pos.filter((p) => ['sent', 'confirmed'].includes(p.status)).length
      const partiallyReceived = pos.filter((p) => p.status === 'partially_received').length
      const overdue = pos.filter((p) =>
        ['sent', 'confirmed', 'partially_received'].includes(p.status)
        && p.expected_delivery_date
        && p.expected_delivery_date < today,
      ).length
      const openValue = pos
        .filter((p) => !['received', 'closed', 'cancelled'].includes(p.status))
        .reduce((acc, p) => acc + (p.total_mxn ?? 0), 0)
      const spendMonth = pos
        .filter((p) => p.issue_date >= monthStartIso)
        .reduce((acc, p) => acc + (p.total_mxn ?? 0), 0)

      // 3) Invoices
      const { data: invsRaw, error: invsErr } = await db
        .from('supplier_invoices')
        .select('status')
      if (invsErr) throw invsErr
      const invs = (invsRaw ?? []) as Array<{ status: string }>

      return {
        requisitions: {
          submitted:           reqs.filter((r) => r.status === 'submitted').length,
          in_quotation:        reqs.filter((r) => r.status === 'in_quotation').length,
          approved_pending_po: reqs.filter((r) => r.status === 'approved').length,
        },
        orders: {
          awaiting_reception: awaitingReception,
          partially_received: partiallyReceived,
          overdue,
        },
        invoices: {
          pending:          invs.filter((i) => i.status === 'pending').length,
          with_discrepancy: invs.filter((i) => i.status === 'discrepancy').length,
        },
        spend_month_mxn: spendMonth,
        open_value_mxn:  openValue,
      } satisfies ComprasKpis
    },
  })
}

export interface SupplierSpend {
  supplier_id: string
  supplier_name: string
  total_mxn: number
  po_count: number
}

export function useTopSuppliersThisYear(limit = 5) {
  const { organization } = useAuth()
  return useQuery<SupplierSpend[]>({
    queryKey: ['compras-top-suppliers', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`
      const { data, error } = await db
        .from('purchase_orders')
        .select('supplier_id, total_mxn, supplier:suppliers(name)')
        .is('deleted_at', null)
        .gte('issue_date', yearStart)
        .not('total_mxn', 'is', null)
      if (error) throw error

      const rows = (data ?? []) as Array<{
        supplier_id: string
        total_mxn: number
        supplier: { name: string } | null
      }>

      const map = new Map<string, SupplierSpend>()
      for (const r of rows) {
        const key = r.supplier_id
        const entry = map.get(key) ?? {
          supplier_id: key,
          supplier_name: r.supplier?.name ?? '—',
          total_mxn: 0,
          po_count: 0,
        }
        entry.total_mxn += r.total_mxn
        entry.po_count += 1
        map.set(key, entry)
      }

      return Array.from(map.values())
        .sort((a, b) => b.total_mxn - a.total_mxn)
        .slice(0, limit)
    },
  })
}
