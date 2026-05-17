/**
 * Supplier detail — información del proveedor + lista de OCs asociadas.
 *
 * Click desde /compras/proveedores → /compras/proveedores/:id
 * Sigue el mismo patrón de layout que po-detail-page y facturas-detail-page:
 * header con back arrow + nombre, columna principal con OCs, sidebar con
 * metadata.
 */
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, ShoppingCart, ChevronRight,
  Calendar, CreditCard,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { POStatus, Currency } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/custom/empty-state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SupplierDetail {
  id: string
  name: string
  rfc: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  default_currency: Currency
  currencies: Currency[] | null
  payment_terms_default: string | null
  notes: string | null
  is_active: boolean
}

interface SupplierPo {
  id: string
  folio: string
  status: POStatus
  issue_date: string
  expected_delivery_date: string | null
  total_mxn: number | null
  total_usd: number | null
}

const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Borrador',
  pending_signature: 'Pendiente firma',
  sent: 'Firmada',
  confirmed: 'Confirmada',
  partially_received: 'Recepción parcial',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
}

const PO_STATUS_TONE: Record<POStatus, string> = {
  draft:              'bg-muted text-muted-foreground',
  pending_signature:  'bg-warning/15 text-warning',
  sent:               'bg-usd/15 text-usd',
  confirmed:          'bg-usd/15 text-usd',
  partially_received: 'bg-warning/15 text-warning',
  received:           'bg-success/15 text-success',
  closed:             'bg-success/10 text-success/80',
  cancelled:          'bg-destructive/15 text-destructive',
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { organization } = useAuth()

  const { data: supplier, isLoading: loadingSupplier } = useQuery<SupplierDetail | null>({
    queryKey: ['supplier-detail', { id, orgId: organization?.id }],
    enabled: !!id && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data as SupplierDetail | null
    },
  })

  const { data: pos = [], isLoading: loadingPos } = useQuery<SupplierPo[]>({
    queryKey: ['supplier-pos', { id, orgId: organization?.id }],
    enabled: !!id && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('id, folio, status, issue_date, expected_delivery_date, total_mxn, total_usd')
        .eq('supplier_id', id)
        .eq('organization_id', organization!.id)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as SupplierPo[]
    },
  })

  const stats = useMemo(() => {
    const active = pos.filter((p) => !['cancelled', 'closed'].includes(p.status))
    const totalMxn = pos.reduce((s, p) => s + (p.total_mxn ?? 0), 0)
    return {
      total: pos.length,
      active: active.length,
      totalMxn,
    }
  }, [pos])

  if (loadingSupplier) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="font-heading text-lg font-semibold">Proveedor no encontrado</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          No existe o fue eliminado.
        </p>
        <Button onClick={() => navigate('/compras/proveedores')} variant="outline">
          Volver a Proveedores
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate('/compras/proveedores')}
          aria-label="Volver"
          className="mt-0.5"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="size-5 text-muted-foreground" />
            <h1 className="font-heading text-xl font-semibold tracking-[-0.01em]">{supplier.name}</h1>
            {!supplier.is_active && (
              <Badge variant="outline" className="text-[10px]">Inactivo</Badge>
            )}
            <div className="flex items-center gap-1">
              {(supplier.currencies ?? [supplier.default_currency]).map((c) => (
                <Badge
                  key={c}
                  variant={c === supplier.default_currency ? 'default' : 'outline'}
                  className="text-[10px] px-1.5"
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          {supplier.rfc && (
            <p className="text-sm font-mono text-muted-foreground mt-0.5">{supplier.rfc}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Main column — POs asociadas */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
                Órdenes de compra ({pos.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                {stats.active} activas · ${stats.totalMxn.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN acumulado
              </span>
            </header>

            {loadingPos ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
              </div>
            ) : pos.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="size-8 text-muted-foreground" strokeWidth={1.5} />}
                title="Sin OCs emitidas"
                description="Cuando generes una OC con este proveedor, aparecerá aquí."
              />
            ) : (
              <ul className="divide-y divide-border">
                {pos.map((po) => (
                  <li key={po.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/compras/ordenes/${po.id}`)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{po.folio}</span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PO_STATUS_TONE[po.status]}`}>
                            {PO_STATUS_LABEL[po.status]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Emitida {format(new Date(po.issue_date), 'd MMM yyyy', { locale: es })}
                          {po.expected_delivery_date && ` · entrega ${format(new Date(po.expected_delivery_date), 'd MMM', { locale: es })}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <div className="text-sm font-semibold font-mono tabular-nums">
                            ${(po.total_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">MXN</div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar — info del proveedor */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
              Contacto
            </h3>
            <dl className="space-y-2.5 text-sm">
              {supplier.contact_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Persona</dt>
                    <dd className="truncate">{supplier.contact_name}</dd>
                  </div>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Teléfono</dt>
                    <dd className="truncate">
                      <a href={`tel:${supplier.phone}`} className="hover:underline">{supplier.phone}</a>
                    </dd>
                  </div>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-start gap-2">
                  <Mail className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Email</dt>
                    <dd className="truncate">
                      <a href={`mailto:${supplier.email}`} className="hover:underline">{supplier.email}</a>
                    </dd>
                  </div>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Dirección</dt>
                    <dd className="text-xs">{supplier.address}</dd>
                  </div>
                </div>
              )}
              {!supplier.contact_name && !supplier.phone && !supplier.email && !supplier.address && (
                <p className="text-xs text-muted-foreground italic">Sin información de contacto.</p>
              )}
            </dl>
          </section>

          {supplier.payment_terms_default && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2 flex items-center gap-1.5">
                <CreditCard className="size-3" />
                Condiciones de pago
              </h3>
              <p className="text-sm whitespace-pre-wrap">{supplier.payment_terms_default}</p>
            </section>
          )}

          {supplier.notes && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Notas
              </h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{supplier.notes}</p>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3 flex items-center gap-1.5">
              <Calendar className="size-3" />
              Estadísticas
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-xs">OCs totales</dt>
                <dd className="font-mono tabular-nums">{stats.total}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-xs">OCs activas</dt>
                <dd className="font-mono tabular-nums">{stats.active}</dd>
              </div>
              <div className="border-t pt-2 mt-1 flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-[11px]">Monto acumulado</dt>
                <dd className="font-mono tabular-nums text-xs">
                  ${stats.totalMxn.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}
