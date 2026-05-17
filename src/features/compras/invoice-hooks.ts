/**
 * Hooks for supplier-invoice CRUD + reconciliation logic.
 * Reconciliation compares the invoice total against the linked PO total in
 * its own currency and flags a discrepancy when the relative diff exceeds
 * `organization.settings.invoice_reconciliation_tolerance_pct` (default 2%).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { SupplierInvoice, InvoiceStatus, Currency } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface InvoiceListRow extends SupplierInvoice {
  supplier?: { name: string } | null
  po?: { folio: string; total_mxn: number | null; total_usd: number | null } | null
}

export function useSupplierInvoicesList(filters: { status?: InvoiceStatus | 'all' } = {}) {
  const { organization } = useAuth()
  return useQuery<InvoiceListRow[]>({
    queryKey: ['supplier-invoices-list', { orgId: organization?.id, ...filters }],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = db
        .from('supplier_invoices')
        .select(`
          *,
          supplier:suppliers(name),
          po:purchase_orders(folio, total_mxn, total_usd)
        `)
        .order('issue_date', { ascending: false })
        .limit(200)
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as InvoiceListRow[]
    },
  })
}

export interface CreateInvoiceInput {
  po_id: string
  supplier_id: string
  invoice_folio: string
  cfdi_uuid: string | null
  issue_date: string
  due_date: string | null
  subtotal: number | null
  tax: number | null
  total: number
  currency: Currency
  pdf_url: string | null
  xml_url: string | null
  notes: string | null
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  const { organization } = useAuth()
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      if (!organization?.id) throw new Error('No org')

      // Fetch PO totals + org tolerance for reconciliation check.
      const [poRes, orgRes] = await Promise.all([
        db.from('purchase_orders').select('total_mxn, total_usd, fx_rate').eq('id', input.po_id).maybeSingle(),
        db.from('organizations').select('settings').eq('id', organization.id).maybeSingle(),
      ])
      if (poRes.error) throw poRes.error
      const poTotal = input.currency === 'USD' ? poRes.data?.total_usd : poRes.data?.total_mxn

      const tolerancePct = (orgRes.data?.settings?.invoice_reconciliation_tolerance_pct ?? 2.0) as number
      const discrepancies: Record<string, unknown> = {}
      let status: InvoiceStatus = 'pending'

      if (poTotal != null && input.total > 0) {
        const diff      = input.total - poTotal
        const diffPct   = Math.abs(diff) / poTotal * 100
        discrepancies.po_total      = poTotal
        discrepancies.invoice_total = input.total
        discrepancies.diff          = diff
        discrepancies.diff_pct      = Number(diffPct.toFixed(2))
        discrepancies.tolerance_pct = tolerancePct
        if (diffPct > tolerancePct) status = 'discrepancy'
      }

      const { data, error } = await db.from('supplier_invoices').insert({
        organization_id: organization.id,
        po_id:           input.po_id,
        supplier_id:     input.supplier_id,
        invoice_folio:   input.invoice_folio,
        cfdi_uuid:       input.cfdi_uuid,
        issue_date:      input.issue_date,
        due_date:        input.due_date,
        subtotal:        input.subtotal,
        tax:             input.tax,
        total:           input.total,
        currency:        input.currency,
        pdf_url:         input.pdf_url,
        xml_url:         input.xml_url,
        notes:           input.notes,
        status,
        discrepancies:   Object.keys(discrepancies).length > 0 ? discrepancies : null,
      }).select().single()
      if (error) throw error
      return data as SupplierInvoice
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices-list'] })
      qc.invalidateQueries({ queryKey: ['compras-kpis'] })
    },
  })
}

export function useReconcileInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await db.from('supplier_invoices').update({
        status: 'reconciled',
        reconciled_at: new Date().toISOString(),
        notes: note ?? undefined,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices-list'] }),
  })
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('supplier_invoices').update({ status: 'paid' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices-list'] }),
  })
}
