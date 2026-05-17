/**
 * Aggregated KPIs for the Compras module dashboard.
 * Each hook is small and independently cached so we don't refetch the whole
 * dashboard when a single mutation invalidates one slice.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

// ─── Date helpers (local time → ISO date) ─────────────────────────────────
function startOfMonthIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

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

/**
 * Top suppliers by spend in the CURRENT MONTH only.
 * Used by the "Top proveedores este mes" panel on the compras dashboard.
 */
export function useTopSuppliersThisMonth(limit = 5) {
  const { organization } = useAuth()
  return useQuery<SupplierSpend[]>({
    queryKey: ['compras-top-suppliers-month', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const monthStart = startOfMonthIso()
      const { data, error } = await db
        .from('purchase_orders')
        .select('supplier_id, total_mxn, status, supplier:suppliers(name)')
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .gte('issue_date', monthStart)
        .not('total_mxn', 'is', null)
      if (error) throw error

      const rows = (data ?? []) as Array<{
        supplier_id: string
        total_mxn: number
        status: string
        supplier: { name: string } | null
      }>

      const map = new Map<string, SupplierSpend>()
      for (const r of rows) {
        if (r.status === 'cancelled') continue
        const entry = map.get(r.supplier_id) ?? {
          supplier_id: r.supplier_id,
          supplier_name: r.supplier?.name ?? '—',
          total_mxn: 0,
          po_count: 0,
        }
        entry.total_mxn += r.total_mxn
        entry.po_count += 1
        map.set(r.supplier_id, entry)
      }

      return Array.from(map.values())
        .sort((a, b) => b.total_mxn - a.total_mxn)
        .slice(0, limit)
    },
  })
}

// ─── Payment / AP-aging KPIs (mig 051) ────────────────────────────────────

export interface PaymentsKpis {
  /** Sum of `total` for invoices whose aging bucket is d_0_30/31_60/61_90/90_plus. */
  overdue_total: number
  overdue_count: number
  /** Invoices unpaid with due_date within next 7 days (inclusive). */
  due_soon_total: number
  due_soon_count: number
  /** Invoices paid in the current month. */
  paid_this_month_total: number
  paid_this_month_count: number
}

export function usePaymentsKpis() {
  const { organization } = useAuth()
  return useQuery<PaymentsKpis>({
    queryKey: ['compras-payments-kpis', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = todayIso()
      const in7 = plusDaysIso(7)
      const monthStart = startOfMonthIso()

      // 1) ap_aging view — overdue buckets
      const { data: agingRaw, error: agingErr } = await db
        .from('ap_aging')
        .select('total, bucket')
        .eq('organization_id', organization!.id)
      if (agingErr) throw agingErr
      const aging = (agingRaw ?? []) as Array<{ total: number | null; bucket: string }>
      const overdue = aging.filter((r) => r.bucket?.startsWith('d_'))
      const overdue_total = overdue.reduce((s, r) => s + (r.total ?? 0), 0)
      const overdue_count = overdue.length

      // 2) Due soon (≤ 7d) — unpaid invoices
      const { data: dueRaw, error: dueErr } = await db
        .from('supplier_invoices')
        .select('total, due_date, status')
        .eq('organization_id', organization!.id)
        .gte('due_date', today)
        .lte('due_date', in7)
        .not('status', 'in', '(paid,cancelled)')
      if (dueErr) throw dueErr
      const due = (dueRaw ?? []) as Array<{ total: number | null }>
      const due_soon_total = due.reduce((s, r) => s + (r.total ?? 0), 0)
      const due_soon_count = due.length

      // 3) Paid this month
      const { data: paidRaw, error: paidErr } = await db
        .from('supplier_invoices')
        .select('total, paid_at, status')
        .eq('organization_id', organization!.id)
        .eq('status', 'paid')
        .gte('paid_at', `${monthStart}T00:00:00Z`)
      if (paidErr) throw paidErr
      const paid = (paidRaw ?? []) as Array<{ total: number | null }>
      const paid_this_month_total = paid.reduce((s, r) => s + (r.total ?? 0), 0)
      const paid_this_month_count = paid.length

      return {
        overdue_total,
        overdue_count,
        due_soon_total,
        due_soon_count,
        paid_this_month_total,
        paid_this_month_count,
      } satisfies PaymentsKpis
    },
  })
}

// ─── Pending receptions ────────────────────────────────────────────────────

export interface PendingReceptionPO {
  id: string
  folio: string
  status: string
  supplier_name: string
  expected_delivery_date: string | null
  total_mxn: number | null
}

/**
 * POs in `sent` / `confirmed` / `partially_received` status — the user
 * still owes a reception against them.  Limited to the most recent 50;
 * sorted by issue_date desc.
 */
export function usePendingReceptions(limit = 5) {
  const { organization } = useAuth()
  return useQuery<PendingReceptionPO[]>({
    queryKey: ['compras-pending-receptions', organization?.id, limit],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('id, folio, status, expected_delivery_date, total_mxn, supplier:suppliers(name)')
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .in('status', ['sent', 'confirmed', 'partially_received'])
        .order('issue_date', { ascending: false })
        .limit(50)
      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        folio: string
        status: string
        expected_delivery_date: string | null
        total_mxn: number | null
        supplier: { name: string } | null
      }>
      return rows.slice(0, limit).map((r) => ({
        id: r.id,
        folio: r.folio,
        status: r.status,
        supplier_name: r.supplier?.name ?? '—',
        expected_delivery_date: r.expected_delivery_date,
        total_mxn: r.total_mxn,
      }))
    },
  })
}

// ─── Approval inbox (admin) ───────────────────────────────────────────────

export interface PendingSignaturePO {
  id: string
  folio: string
  supplier_name: string
  total_mxn: number | null
  issue_date: string
  updated_at: string
}

export function usePendingSignaturePOs(enabled: boolean, limit = 5) {
  const { organization } = useAuth()
  return useQuery<PendingSignaturePO[]>({
    queryKey: ['compras-pending-signature', organization?.id, limit],
    enabled: enabled && !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('id, folio, total_mxn, issue_date, updated_at, supplier:suppliers(name)')
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .eq('status', 'pending_signature')
        .order('updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        folio: string
        total_mxn: number | null
        issue_date: string
        updated_at: string
        supplier: { name: string } | null
      }>
      return rows.map((r) => ({
        id: r.id,
        folio: r.folio,
        supplier_name: r.supplier?.name ?? '—',
        total_mxn: r.total_mxn,
        issue_date: r.issue_date,
        updated_at: r.updated_at,
      }))
    },
  })
}
