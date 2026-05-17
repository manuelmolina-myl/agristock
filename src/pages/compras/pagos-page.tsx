/**
 * Pagos — reporte de cuentas por pagar (AP aging).
 *
 * Consume la vista `ap_aging` (migración 051) que devuelve facturas con su
 * bucket de antigüedad. Permite filtrar por bucket, proveedor y folio, y
 * abrir el dialog de "Registrar pago" directamente desde la fila.
 *
 * Buckets: paid | sin_vencimiento | al_corriente | d_0_30 | d_31_60 | d_61_90 | d_90_plus.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, AlertOctagon, CreditCard, ChevronRight, Building2,
  CalendarClock, Receipt, Wallet, CheckCircle2, Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import type { Currency } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { RegistrarPagoDialog } from './registrar-pago-dialog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type AgingBucket =
  | 'paid'
  | 'sin_vencimiento'
  | 'al_corriente'
  | 'd_0_30'
  | 'd_31_60'
  | 'd_61_90'
  | 'd_90_plus'

const BUCKET_LABEL: Record<AgingBucket, string> = {
  paid:            'Pagada',
  sin_vencimiento: 'Sin vencimiento',
  al_corriente:    'Al corriente',
  d_0_30:          '0–30 días',
  d_31_60:         '31–60 días',
  d_61_90:         '61–90 días',
  d_90_plus:       '+90 días',
}

const BUCKET_TONE: Record<AgingBucket, string> = {
  paid:            'bg-success/15 text-success',
  sin_vencimiento: 'bg-muted text-muted-foreground',
  al_corriente:    'bg-usd/15 text-usd',
  d_0_30:          'bg-warning/15 text-warning',
  d_31_60:         'bg-warning/25 text-warning',
  d_61_90:         'bg-destructive/15 text-destructive',
  d_90_plus:       'bg-destructive/25 text-destructive',
}

const OVERDUE_BUCKETS = new Set<AgingBucket>(['d_0_30', 'd_31_60', 'd_61_90', 'd_90_plus'])

interface AgingRow {
  id: string
  organization_id: string
  po_id: string | null
  supplier_id: string | null
  supplier_name: string | null
  invoice_folio: string
  issue_date: string
  due_date: string | null
  total: number | null
  currency: Currency
  status: string
  paid_at: string | null
  bucket: AgingBucket
  days_overdue: number | null
}

type BucketFilter = 'all' | AgingBucket

export default function PagosPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const canWrite = can('purchase.create')

  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [payTarget, setPayTarget] = useState<{
    id: string; folio: string; total: number; currency: Currency
  } | null>(null)

  // ── Aging rows (no pagadas) ──────────────────────────────────────────
  const { data: rows = [], isLoading } = useQuery<AgingRow[]>({
    queryKey: ['ap-aging', { orgId: organization?.id }],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('ap_aging')
        .select('*')
        .neq('status', 'paid')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as AgingRow[]
    },
  })

  // ── Pagado este mes (KPI) ────────────────────────────────────────────
  const monthStartIso = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
  }, [])

  const { data: paidThisMonth = [], isLoading: paidLoading } = useQuery<
    Array<{ total: number | null; currency: Currency }>
  >({
    queryKey: ['ap-aging', 'paid-this-month', { orgId: organization?.id, monthStartIso }],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('ap_aging')
        .select('total, currency, paid_at')
        .eq('status', 'paid')
        .gte('paid_at', monthStartIso)
      if (error) throw error
      return (data ?? []) as Array<{ total: number | null; currency: Currency }>
    },
  })

  // ── Lista de proveedores presentes en aging para el filtro ───────────
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.supplier_id && r.supplier_name) map.set(r.supplier_id, r.supplier_name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [rows])

  // ── Filtros aplicados ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (bucketFilter !== 'all' && r.bucket !== bucketFilter) return false
      if (supplierFilter !== 'all' && r.supplier_id !== supplierFilter) return false
      if (q) {
        const hay = `${r.invoice_folio} ${r.supplier_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, bucketFilter, supplierFilter, search])

  // ── KPIs ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30 = new Date(today)
    in30.setDate(in30.getDate() + 30)

    let totalVencido = 0
    let porVencer30 = 0
    let saldoTotal = 0
    for (const r of rows) {
      const t = r.total ?? 0
      saldoTotal += t
      if (OVERDUE_BUCKETS.has(r.bucket)) totalVencido += t
      if (r.due_date) {
        const due = new Date(r.due_date)
        if (due >= today && due <= in30) porVencer30 += t
      }
    }
    const pagadoMes = paidThisMonth.reduce((s, r) => s + (r.total ?? 0), 0)

    return { totalVencido, porVencer30, saldoTotal, pagadoMes }
  }, [rows, paidThisMonth])

  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Cuentas por pagar"
        description="Facturas pendientes de pago agrupadas por antigüedad."
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={AlertOctagon}
          label="Total vencido"
          value={fmt(kpis.totalVencido)}
          hint="Facturas con días en mora"
          tone="critical"
          isLoading={isLoading}
        />
        <KpiCard
          icon={Clock}
          label="Por vencer (≤30d)"
          value={fmt(kpis.porVencer30)}
          hint="Vencen en los próximos 30 días"
          tone="warning"
          isLoading={isLoading}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Pagado este mes"
          value={fmt(kpis.pagadoMes)}
          hint={format(new Date(monthStartIso), "LLLL yyyy", { locale: es })}
          tone="success"
          isLoading={paidLoading}
        />
        <KpiCard
          icon={Wallet}
          label="Saldo total pendiente"
          value={fmt(kpis.saldoTotal)}
          hint={`${rows.length} factura${rows.length === 1 ? '' : 's'} por pagar`}
          tone="default"
          isLoading={isLoading}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio de factura o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={bucketFilter} onValueChange={(v) => setBucketFilter((v ?? 'all') as BucketFilter)}>
          <SelectTrigger className="h-9 sm:w-56"><SelectValue placeholder="Antigüedad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las antigüedades</SelectItem>
            <SelectItem value="al_corriente">Al corriente</SelectItem>
            <SelectItem value="d_0_30">Vencidas 0–30 días</SelectItem>
            <SelectItem value="d_31_60">Vencidas 31–60 días</SelectItem>
            <SelectItem value="d_61_90">Vencidas 61–90 días</SelectItem>
            <SelectItem value="d_90_plus">Vencidas +90 días</SelectItem>
            <SelectItem value="sin_vencimiento">Sin vencimiento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={(v) => setSupplierFilter(v ?? 'all')}>
          <SelectTrigger className="h-9 sm:w-64"><SelectValue placeholder="Proveedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {supplierOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-8 text-muted-foreground" strokeWidth={1.5} />}
          title={search || bucketFilter !== 'all' || supplierFilter !== 'all' ? 'Sin resultados' : 'Sin facturas por pagar'}
          description={
            search || bucketFilter !== 'all' || supplierFilter !== 'all'
              ? 'Ajusta los filtros para ver más facturas.'
              : 'Todas las facturas conciliadas se han pagado. Cuando se concilie una nueva factura, aparecerá aquí.'
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-3 py-2">Folio</th>
                  <th className="text-left font-medium px-3 py-2">Proveedor</th>
                  <th className="text-left font-medium px-3 py-2">Vencimiento</th>
                  <th className="text-right font-medium px-3 py-2">Monto</th>
                  <th className="text-left font-medium px-3 py-2">Estado</th>
                  <th className="text-right font-medium px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const overdue = (r.days_overdue ?? 0) > 0
                  return (
                    <tr
                      key={r.id}
                      onClick={() => r.po_id && navigate(`/compras/facturas/${r.po_id}`, { state: { from: '/compras/pagos' } })}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="size-3 text-muted-foreground" />
                          <span className="font-mono text-xs font-medium">{r.invoice_folio}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="size-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{r.supplier_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CalendarClock className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-xs">
                            {r.due_date
                              ? format(new Date(r.due_date), 'd MMM yyyy', { locale: es })
                              : <span className="text-muted-foreground italic">sin fecha</span>}
                          </span>
                          {overdue && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive">
                              Vencida {r.days_overdue} d
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="font-mono tabular-nums text-sm font-medium">
                          {r.currency === 'USD' ? 'US$' : '$'}
                          {(r.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{r.currency}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${BUCKET_TONE[r.bucket]}`}>
                          {BUCKET_LABEL[r.bucket]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {canWrite && r.status !== 'paid' && (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => setPayTarget({
                                id: r.id,
                                folio: r.invoice_folio,
                                total: r.total ?? 0,
                                currency: r.currency,
                              })}
                            >
                              <CreditCard className="size-3" /> Registrar pago
                            </Button>
                          )}
                          {r.po_id && (
                            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payTarget && (
        <RegistrarPagoDialog
          open={!!payTarget}
          invoiceId={payTarget.id}
          invoiceFolio={payTarget.folio}
          invoiceTotal={payTarget.total}
          currency={payTarget.currency}
          onClose={() => setPayTarget(null)}
        />
      )}
    </div>
  )
}
