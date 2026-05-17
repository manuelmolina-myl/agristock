import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, Building2, Phone, Mail, FileText, Pencil, Trash2, Loader2, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const supplierSchema = z.object({
  name:             z.string().min(2, 'Nombre demasiado corto').max(120),
  rfc:              z.string().max(13).optional().nullable(),
  contact_name:     z.string().max(120).optional().nullable(),
  phone:            z.string().max(40).optional().nullable(),
  email:            z.string().email('Email inválido').optional().or(z.literal('')).nullable(),
  /** Currencies the supplier accepts. At least one. */
  currencies:       z.array(z.enum(['MXN', 'USD'])).min(1, 'Selecciona al menos una moneda'),
  /** Preferred / default currency — must be member of `currencies`. */
  default_currency: z.enum(['MXN', 'USD']),
})
type SupplierForm = z.infer<typeof supplierSchema>

interface Supplier {
  id: string
  name: string
  rfc: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  currencies: Array<'MXN' | 'USD'>
  default_currency: 'MXN' | 'USD'
  organization_id: string
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

interface SupplierWithStats extends Supplier {
  po_count: number
  total_mxn: number
  last_po_date: string | null
}

export default function SuppliersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers-full', organization?.id],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as Supplier[]
    },
  })

  // Aggregate PO stats per supplier from purchase_orders (current year).
  const { data: poStats = [] } = useQuery<Array<{ supplier_id: string; total_mxn: number; issue_date: string }>>({
    queryKey: ['suppliers-po-stats', organization?.id],
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_orders')
        .select('supplier_id, total_mxn, issue_date')
        .is('deleted_at', null)
        .not('total_mxn', 'is', null)
      if (error) throw error
      return data ?? []
    },
  })

  const rows = useMemo<SupplierWithStats[]>(() => {
    const statsMap = new Map<string, { po_count: number; total_mxn: number; last_po_date: string | null }>()
    for (const p of poStats) {
      const entry = statsMap.get(p.supplier_id) ?? { po_count: 0, total_mxn: 0, last_po_date: null }
      entry.po_count += 1
      entry.total_mxn += p.total_mxn ?? 0
      if (!entry.last_po_date || p.issue_date > entry.last_po_date) entry.last_po_date = p.issue_date
      statsMap.set(p.supplier_id, entry)
    }

    const enriched = suppliers.map((s) => ({
      ...s,
      ...(statsMap.get(s.id) ?? { po_count: 0, total_mxn: 0, last_po_date: null }),
    }))

    if (!search.trim()) return enriched
    const q = search.toLowerCase()
    return enriched.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.rfc ?? '').toLowerCase().includes(q) ||
      (s.contact_name ?? '').toLowerCase().includes(q),
    )
  }, [suppliers, poStats, search])

  const upsert = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: SupplierForm }) => {
      const payload = {
        ...values,
        organization_id: organization?.id,
        email: values.email || null,
      }
      if (id) {
        const { error } = await db.from('suppliers').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await db.from('suppliers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers-full'] })
      qc.invalidateQueries({ queryKey: ['suppliers-light'] })
      qc.invalidateQueries({ queryKey: ['compras-top-suppliers'] })
      toast.success('Proveedor guardado')
      setEditTarget(null)
      setCreateOpen(false)
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar el proveedor')
      toast.error(title, { description })
    },
  })

  const softDelete = useMutation({
    mutationFn: async (s: Supplier) => {
      const { error } = await db.from('suppliers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', s.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers-full'] })
      toast.success('Proveedor eliminado')
      setDeleteTarget(null)
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo eliminar el proveedor')
      toast.error(title, { description })
    },
  })

  const canWrite = can('purchase.create')

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Proveedores"
        description="Catálogo de proveedores con histórico de compras y desempeño."
        actions={
          canWrite && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Nuevo proveedor
            </Button>
          )
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, RFC o contacto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'Sin proveedores'}
          description={search ? 'Ajusta tu búsqueda.' : 'Agrega tu primer proveedor para empezar a generar OCs.'}
          icon={<Building2 className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/compras/proveedores/${s.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/compras/proveedores/${s.id}`)
                }
              }}
              className="rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/20 hover:bg-muted/20 transition-colors group cursor-pointer text-left"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-medium truncate">{s.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {(s.currencies ?? [s.default_currency]).map((c) => (
                          <Badge
                            key={c}
                            variant={c === s.default_currency ? 'default' : 'outline'}
                            className="text-[10px] px-1.5"
                            title={c === s.default_currency ? `${c} (predeterminada)` : c}
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {s.rfc && (
                      <div className="font-mono text-[11px] text-muted-foreground">{s.rfc}</div>
                    )}
                  </div>

                  {canWrite && (
                    <div
                      className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost" size="icon-sm"
                        onClick={() => setEditTarget(s)}
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                        title="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {(s.contact_name || s.phone || s.email) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {s.contact_name && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3" strokeWidth={1.75} />
                        {s.contact_name}
                      </span>
                    )}
                    {s.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" strokeWidth={1.75} />
                        {s.phone}
                      </span>
                    )}
                    {s.email && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                        <Mail className="size-3" strokeWidth={1.75} />
                        {s.email}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats footer */}
              {s.po_count > 0 && (
                <div className="border-t bg-muted/20 px-4 py-2 flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <FileText className="size-3" strokeWidth={1.75} />
                    {s.po_count} {s.po_count === 1 ? 'OC emitida' : 'OCs emitidas'}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    ${s.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN acum.
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <SupplierFormDialog
        open={createOpen || !!editTarget}
        target={editTarget}
        onSave={(values) => upsert.mutate({ id: editTarget?.id ?? null, values })}
        onClose={() => { setCreateOpen(false); setEditTarget(null) }}
        isPending={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> se ocultará del catálogo.
              Las OCs históricas se conservarán por trazabilidad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && softDelete.mutate(deleteTarget)}
              disabled={softDelete.isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface FormProps {
  open: boolean
  target: Supplier | null
  onSave: (values: SupplierForm) => void
  onClose: () => void
  isPending: boolean
}

function SupplierFormDialog({ open, target, onSave, onClose, isPending }: FormProps) {
  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    values: target
      ? {
          name: target.name,
          rfc: target.rfc,
          contact_name: target.contact_name,
          phone: target.phone,
          email: target.email,
          currencies: (target.currencies && target.currencies.length > 0)
            ? target.currencies
            : [target.default_currency],
          default_currency: target.default_currency,
        }
      : {
          name: '', rfc: null, contact_name: null, phone: null, email: null,
          currencies: ['MXN'], default_currency: 'MXN',
        },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form
  const currencies = watch('currencies') ?? []
  const defaultCurrency = watch('default_currency')

  const toggleCurrency = (c: 'MXN' | 'USD') => {
    const has = currencies.includes(c)
    const next = has ? currencies.filter((x) => x !== c) : [...currencies, c]
    setValue('currencies', next as Array<'MXN' | 'USD'>, { shouldDirty: true, shouldValidate: true })
    // Default must stay inside the set.
    if (next.length === 0) {
      // Re-add what was removed — at least one currency is required.
      setValue('currencies', [c], { shouldDirty: true })
      return
    }
    if (!next.includes(defaultCurrency)) {
      setValue('default_currency', next[0], { shouldDirty: true })
    }
  }

  const handleClose = () => { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>
        <form
          id="supplier-form"
          onSubmit={handleSubmit((v) => onSave(v))}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Razón social <span className="text-destructive">*</span></Label>
            <Input id="name" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfc">RFC</Label>
              <Input
                id="rfc"
                {...register('rfc', { setValueAs: (v) => (v?.trim() ? v.trim().toUpperCase() : null) })}
                className="h-9 font-mono uppercase"
                placeholder="XXX000000XXX"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact_name">Persona de contacto</Label>
              <Input id="contact_name" {...register('contact_name', { setValueAs: (v) => v || null })} className="h-9" />
            </div>
          </div>

          {/* Currencies — multi-select with tile-style checkboxes */}
          <div className="flex flex-col gap-1.5">
            <Label>Monedas en las que factura <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {(['MXN', 'USD'] as const).map((c) => {
                const selected = currencies.includes(c)
                const isDefault = defaultCurrency === c && selected
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCurrency(c)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      'flex items-start gap-2.5 cursor-pointer',
                      selected
                        ? 'border-primary bg-primary/[0.04]'
                        : 'border-border bg-card hover:bg-accent/40',
                    )}
                  >
                    <span
                      className={cn(
                        'size-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5',
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-sm">{c}</span>
                        {isDefault && (
                          <span className="text-[9px] uppercase tracking-[0.06em] text-primary/80 font-medium">
                            Predeterminada
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {c === 'MXN' ? 'Peso mexicano' : 'Dólar estadounidense'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
            {errors.currencies && (
              <p className="text-xs text-destructive">{errors.currencies.message}</p>
            )}

            {/* Default currency selector — only shows when 2 currencies are picked */}
            {currencies.length > 1 && (
              <div className="flex items-center gap-2 mt-1.5">
                <Label className="text-xs text-muted-foreground shrink-0 m-0">
                  Predeterminada:
                </Label>
                <div className="flex gap-1">
                  {currencies.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setValue('default_currency', c, { shouldDirty: true })}
                      className={cn(
                        'text-xs font-mono px-2.5 py-1 rounded-md border transition-colors',
                        defaultCurrency === c
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:bg-accent/40',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  (se pre-selecciona en OCs/cotizaciones)
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone', { setValueAs: (v) => v || null })} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email"
                {...register('email', { setValueAs: (v) => v || null })}
                className="h-9"
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleSubmit((v) => onSave(v))}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {target ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
