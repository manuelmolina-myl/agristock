/**
 * TanquesPage — listado de tanques de combustible (diésel).
 *
 * KPIs: capacidad total, inventario actual, tanques en bajo nivel,
 * consumo 30 días. Tarjetas con barra de progreso por tanque. Filtros por
 * código/nombre y tipo (estacionario / móvil).
 */
import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Fuel,
  Truck,
  Droplet,
  TrendingDown,
  AlertOctagon,
  Search,
  Plus,
  Loader2,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatQuantity, cn } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'

import { PageHeader } from '@/components/custom/page-header'
import { KpiCard } from '@/components/custom/kpi-card'
import { EmptyState } from '@/components/custom/empty-state'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Types ───────────────────────────────────────────────────────────────────

interface TankBalance {
  id: string
  organization_id: string
  code: string
  name: string
  type: 'stationary' | 'mobile'
  capacity_liters: number
  current_level_liters: number
  alert_threshold_pct: number
  location: string | null
  supplier_id: string | null
  supplier_name: string | null
  last_load_at: string | null
  is_active: boolean
  fill_pct: number
  level_status: 'low' | 'medium' | 'ok'
  dispensed_30d: number
  loaded_30d: number
}

type FilterType = 'all' | 'stationary' | 'mobile'

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchTanks(orgId: string): Promise<TankBalance[]> {
  const { data, error } = await db
    .from('diesel_tank_balance')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('code', { ascending: true })
  if (error) throw error
  return (data ?? []) as TankBalance[]
}

// ─── New Tank Dialog ─────────────────────────────────────────────────────────

const newTankSchema = z.object({
  code: z.string().min(1, 'Código requerido').max(40),
  name: z.string().min(1, 'Nombre requerido').max(120),
  type: z.enum(['stationary', 'mobile']),
  capacity_liters: z.coerce.number().positive('Debe ser mayor a 0'),
  alert_threshold_pct: z.coerce.number().min(0).max(100),
  location: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
})

type NewTankForm = z.infer<typeof newTankSchema>

interface NewTankDialogProps {
  open: boolean
  onClose: () => void
}

function NewTankDialog({ open, onClose }: NewTankDialogProps) {
  const { organization } = useAuth()
  const qc = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<NewTankForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(newTankSchema) as any,
    defaultValues: {
      code: '',
      name: '',
      type: 'stationary',
      capacity_liters: undefined as unknown as number,
      alert_threshold_pct: 20,
      location: '',
      notes: '',
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = form

  const typeVal = watch('type')

  const handleClose = () => {
    reset({
      code: '',
      name: '',
      type: 'stationary',
      capacity_liters: undefined as unknown as number,
      alert_threshold_pct: 20,
      location: '',
      notes: '',
    })
    onClose()
  }

  const onSubmit = async (values: NewTankForm) => {
    if (!organization) {
      toast.error('Sin organización activa')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await db.from('diesel_tanks').insert({
        organization_id: organization.id,
        code: values.code.trim(),
        name: values.name.trim(),
        type: values.type,
        capacity_liters: values.capacity_liters,
        current_level_liters: 0,
        alert_threshold_pct: values.alert_threshold_pct,
        location: values.location?.trim() || null,
        notes: values.notes?.trim() || null,
        is_active: true,
      })
      if (error) throw error

      toast.success('Tanque creado', {
        description: `${values.name} (${values.code})`,
      })
      qc.invalidateQueries({ queryKey: ['diesel-tanks'] })
      handleClose()
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo crear el tanque')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo tanque</DialogTitle>
          <DialogDescription>
            Registra un tanque estacionario o móvil de combustible.
          </DialogDescription>
        </DialogHeader>

        <form
          id="new-tank-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input
                id="code"
                {...register('code')}
                placeholder="Ej. TQ-01"
                className="h-9 font-mono"
                aria-invalid={!!errors.code}
              />
              {errors.code && (
                <p className="text-xs text-destructive">{errors.code.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                Tipo <span className="text-destructive">*</span>
              </Label>
              <Select
                value={typeVal}
                onValueChange={(v) =>
                  setValue('type', v as 'stationary' | 'mobile', { shouldDirty: true })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stationary">Estacionario</SelectItem>
                  <SelectItem value="mobile">Móvil</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Ej. Tanque principal · Patio"
              className="h-9"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="capacity_liters">
                Capacidad (L) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="capacity_liters"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="Ej. 5000"
                {...register('capacity_liters')}
                className="h-9 font-mono"
                aria-invalid={!!errors.capacity_liters}
              />
              {errors.capacity_liters && (
                <p className="text-xs text-destructive">{errors.capacity_liters.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert_threshold_pct">
                Umbral de alerta (%)
              </Label>
              <Input
                id="alert_threshold_pct"
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                max="100"
                {...register('alert_threshold_pct')}
                className="h-9 font-mono"
                aria-invalid={!!errors.alert_threshold_pct}
              />
              {errors.alert_threshold_pct && (
                <p className="text-xs text-destructive">
                  {errors.alert_threshold_pct.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">
              Ubicación
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="location"
              {...register('location')}
              placeholder="Ej. Patio sur · Bodega 2"
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              rows={2}
              placeholder="Observaciones del tanque…"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Creando…' : 'Crear tanque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tank Card ───────────────────────────────────────────────────────────────

interface TankCardProps {
  tank: TankBalance
  onClick: () => void
}

function TankCard({ tank, onClick }: TankCardProps) {
  const Icon = tank.type === 'mobile' ? Truck : Fuel
  const fillPct = Math.max(0, Math.min(100, tank.fill_pct ?? 0))

  const barColor =
    tank.level_status === 'low'
      ? 'bg-destructive'
      : tank.level_status === 'medium'
      ? 'bg-warning'
      : 'bg-success'

  const railTone =
    tank.level_status === 'low'
      ? 'bg-destructive'
      : tank.level_status === 'medium'
      ? 'bg-warning'
      : 'bg-success'

  const lastLoadLabel = tank.last_load_at
    ? formatDistanceToNow(new Date(tank.last_load_at), { addSuffix: true, locale: es })
    : 'sin recargas'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card',
        'flex flex-col text-left transition-all duration-150',
        'hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-1', railTone)} />

      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {tank.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{tank.code}</p>
        </div>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
          {tank.type === 'mobile' ? 'Móvil' : 'Estacionario'}
        </Badge>
      </div>

      {/* Big number */}
      <div className="px-4 pb-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums font-mono text-foreground">
          {formatQuantity(tank.current_level_liters, 0)}
        </span>
        <span className="text-base text-muted-foreground font-mono">L</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          / {formatQuantity(tank.capacity_liters, 0)} L
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {fillPct.toFixed(1)}%
          </span>
          {tank.level_status === 'low' && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 border-destructive/40 text-destructive gap-0.5"
            >
              <AlertOctagon className="size-2.5" />
              Bajo nivel
            </Badge>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-muted/20 px-4 py-2 flex flex-col gap-0.5">
        <p className="text-[11px] text-muted-foreground">
          Cargado 30d:{' '}
          <span className="font-mono font-medium text-foreground">
            {formatQuantity(tank.loaded_30d ?? 0, 0)} L
          </span>
          {' · '}
          Consumido:{' '}
          <span className="font-mono font-medium text-foreground">
            {formatQuantity(tank.dispensed_30d ?? 0, 0)} L
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground truncate">Último: {lastLoadLabel}</p>
      </div>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TanquesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const { hasRole } = usePermissions()
  const orgId = organization?.id ?? ''

  const isAdmin = hasRole('admin')

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [newTankOpen, setNewTankOpen] = useState(false)

  const {
    data: tanks = [],
    isLoading,
    error,
  } = useQuery<TankBalance[]>({
    queryKey: ['diesel-tanks', orgId],
    queryFn: () => fetchTanks(orgId),
    enabled: !!orgId,
  })

  if (error) {
    const { title, description } = formatSupabaseError(error, 'Error al cargar los tanques')
    toast.error(title, { description })
  }

  // KPIs
  const kpis = useMemo(() => {
    const totalCapacity = tanks.reduce((s, t) => s + (t.capacity_liters ?? 0), 0)
    const totalLevel = tanks.reduce((s, t) => s + (t.current_level_liters ?? 0), 0)
    const lowCount = tanks.filter((t) => t.level_status === 'low').length
    const consumed30d = tanks.reduce((s, t) => s + (t.dispensed_30d ?? 0), 0)
    const utilPct = totalCapacity > 0 ? (totalLevel / totalCapacity) * 100 : 0
    const avgPerDay = consumed30d / 30
    return { totalCapacity, totalLevel, lowCount, consumed30d, utilPct, avgPerDay }
  }, [tanks])

  // Filtering
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tanks.filter((t) => {
      if (filterType !== 'all' && t.type !== filterType) return false
      if (!q) return true
      return (
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.location ?? '').toLowerCase().includes(q)
      )
    })
  }, [tanks, search, filterType])

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Tanques de combustible"
        description="Niveles actuales, recargas y consumo"
        actions={
          isAdmin && (
            <Button size="sm" onClick={() => setNewTankOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" /> Nuevo tanque
            </Button>
          )
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Droplet}
          label="Capacidad total"
          value={`${formatQuantity(kpis.totalCapacity, 0)} L`}
          hint={tanks.length === 1 ? '1 tanque' : `${tanks.length} tanques`}
          loading={isLoading}
        />
        <KpiCard
          icon={Fuel}
          label="Inventario actual"
          value={`${formatQuantity(kpis.totalLevel, 0)} L`}
          hint={
            kpis.totalCapacity > 0
              ? `${kpis.utilPct.toFixed(1)}% utilizado`
              : undefined
          }
          loading={isLoading}
        />
        <KpiCard
          icon={AlertOctagon}
          label="Tanques en bajo nivel"
          value={String(kpis.lowCount)}
          hint={kpis.lowCount > 0 ? 'Requieren recarga' : 'Todo en orden'}
          tone={kpis.lowCount > 0 ? 'critical' : 'success'}
          loading={isLoading}
        />
        <KpiCard
          icon={TrendingDown}
          label="Consumo 30 días"
          value={`${formatQuantity(kpis.consumed30d, 0)} L`}
          hint={
            kpis.avgPerDay > 0
              ? `≈ ${formatQuantity(kpis.avgPerDay, 1)} L/día`
              : undefined
          }
          loading={isLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Código, nombre o ubicación…"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:w-48">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select
            value={filterType}
            onValueChange={(v) => setFilterType(v as FilterType)}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="stationary">Estacionario</SelectItem>
              <SelectItem value="mobile">Móvil</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={<Fuel className="size-5" />}
            title={tanks.length === 0 ? 'Sin tanques registrados' : 'Sin resultados'}
            description={
              tanks.length === 0
                ? 'Registra el primer tanque de diésel para comenzar a controlar el inventario de combustible.'
                : 'Prueba ajustando la búsqueda o el filtro de tipo.'
            }
            action={
              tanks.length === 0 && isAdmin
                ? { label: '+ Nuevo tanque', onClick: () => setNewTankOpen(true) }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TankCard
              key={t.id}
              tank={t}
              onClick={() =>
                navigate(`/almacen/tanques/${t.id}`, {
                  state: { from: location.pathname },
                })
              }
            />
          ))}
        </div>
      )}

      <NewTankDialog open={newTankOpen} onClose={() => setNewTankOpen(false)} />
    </div>
  )
}
