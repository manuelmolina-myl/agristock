import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, ArrowRight, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { QuotationStatus } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<QuotationStatus, string> = {
  requested: 'Solicitada',
  received: 'Recibida',
  selected: 'Seleccionada',
  discarded: 'Descartada',
}

const STATUS_VARIANT: Record<QuotationStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  requested: 'outline',
  received: 'secondary',
  selected: 'default',
  discarded: 'destructive',
}

interface QuotRow {
  id: string
  folio: string
  requisition_id: string
  supplier_id: string
  quotation_date: string
  status: QuotationStatus
  delivery_days: number | null
  validity_days: number | null
  supplier?: { name: string } | null
  requisition?: { folio: string } | null
}

export default function QuotationsPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading } = useQuery<QuotRow[]>({
    queryKey: ['quotations-list', organization?.id, search],
    enabled: !!organization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = db
        .from('quotations')
        .select(`
          id, folio, requisition_id, supplier_id, quotation_date, status, delivery_days, validity_days,
          supplier:suppliers(name),
          requisition:purchase_requisitions(folio)
        `)
        .order('quotation_date', { ascending: false })
        .limit(200)
      if (search) q = q.ilike('folio', `%${search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as QuotRow[]
    },
  })

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Cotizaciones"
        description="Cotizaciones recibidas por requisición. Compara opciones y selecciona la ganadora para generar la OC."
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por folio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin cotizaciones aún"
          description="Las cotizaciones se piden por requisición. Abre una solicitud aprobada para empezar a recibir precios."
          icon={<FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col divide-y rounded-lg border border-border overflow-hidden">
          {rows.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => navigate(`/compras/cotizaciones/comparar?req=${q.requisition_id}`)}
              className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{q.folio}</span>
                  <Badge variant={STATUS_VARIANT[q.status]} className="text-[10px]">
                    {STATUS_LABEL[q.status]}
                  </Badge>
                  {q.requisition?.folio && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      → {q.requisition.folio}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground truncate">
                  {q.supplier?.name ?? '—'} · {format(new Date(q.quotation_date), 'd MMM yyyy', { locale: es })}
                  {q.delivery_days != null && ` · entrega ${q.delivery_days}d`}
                  {q.validity_days != null && ` · vigencia ${q.validity_days}d`}
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
