import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, CalendarClock, Tractor, AlertOctagon, CheckCircle2,
  Pencil, Trash2, Loader2, Power, PowerOff,
} from 'lucide-react'

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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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

const PLAN_TRIGGERS = ['hours', 'kilometers', 'calendar', 'usage_hours'] as const

const TRIGGER_LABEL: Record<typeof PLAN_TRIGGERS[number], string> = {
  hours: 'Por horas de operación',
  kilometers: 'Por kilómetros',
  calendar: 'Por fecha de calendario',
  usage_hours: 'Por horas de uso (uso específico)',
}

const planSchema = z.object({
  equipment_id:        z.string().uuid('Selecciona un equipo'),
  name:                z.string().min(3, 'Mínimo 3 caracteres').max(120),
  trigger_type:        z.enum(PLAN_TRIGGERS),
  interval_value:      z.number().positive('Debe ser mayor a 0'),
  interval_unit:       z.string().min(1),
  last_execution_value: z.number().nonnegative().nullable(),
  next_execution_value: z.number().nonnegative(),
  advance_warning:     z.number().nonnegative().nullable(),
  is_active:           z.boolean(),
})
type PlanForm = z.infer<typeof planSchema>

interface MaintPlan {
  id: string
  equipment_id: string
  name: string
  trigger_type: typeof PLAN_TRIGGERS[number]
  interval_value: number
  interval_unit: string
  last_execution_value: number | null
  next_execution_value: number
  advance_warning: number | null
  is_active: boolean
  equipment?: {
    code: string
    name: string
    current_hours: number | null
    current_km: number | null
  } | null
}

export default function PreventivePlansPage() {
  const qc = useQueryClient()
  const { organization } = useAuth()
  const { can } = usePermissions()
  const canWrite = can('work_order.assign')

  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<MaintPlan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MaintPlan | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: plans = [], isLoading } = useQuery<MaintPlan[]>({
    queryKey: ['maintenance-plans', organization?.id],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('maintenance_plans')
        .select(`
          *,
          equipment:equipment!maintenance_plans_equipment_id_fkey(code, name, current_hours, current_km)
        `)
        .is('deleted_at', null)
        .order('next_execution_value', { ascending: true })
      if (error) throw error
      return (data ?? []) as MaintPlan[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return plans
    return plans.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.equipment?.name.toLowerCase().includes(q) ||
      p.equipment?.code.toLowerCase().includes(q),
    )
  }, [plans, search])

  // Group: vencidos / por vencer / al día
  const groups = useMemo(() => {
    const overdue: MaintPlan[] = []
    const warning: MaintPlan[] = []
    const ok: MaintPlan[] = []
    const inactive: MaintPlan[] = []
    for (const p of filtered) {
      if (!p.is_active) { inactive.push(p); continue }
      const status = planStatus(p)
      if (status === 'overdue')      overdue.push(p)
      else if (status === 'warning') warning.push(p)
      else                            ok.push(p)
    }
    return { overdue, warning, ok, inactive }
  }, [filtered])

  const upsert = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: PlanForm }) => {
      const payload = { ...values, organization_id: organization?.id }
      if (id) {
        const { error } = await db.from('maintenance_plans').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await db.from('maintenance_plans').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
      toast.success('Plan guardado')
      setEditTarget(null); setCreateOpen(false)
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar el plan')
      toast.error(title, { description })
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (p: MaintPlan) => {
      const { error } = await db.from('maintenance_plans')
        .update({ is_active: !p.is_active })
        .eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-plans'] }),
  })

  const softDelete = useMutation({
    mutationFn: async (p: MaintPlan) => {
      const { error } = await db.from('maintenance_plans')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] })
      toast.success('Plan eliminado')
      setDeleteTarget(null)
    },
  })

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Planes preventivos"
        description={`${plans.filter((p) => p.is_active).length} planes activos · El sistema genera OTs automáticamente cuando se acerca la fecha o el horómetro del equipo.`}
        actions={
          canWrite && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Nuevo plan
            </Button>
          )
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por equipo o nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'Sin planes preventivos'}
          description={search ? 'Ajusta tu búsqueda.' : 'Crea el primer plan preventivo para empezar a generar OTs automáticamente.'}
          icon={<CalendarClock className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.overdue.length > 0 && (
            <PlanGroup
              title="Vencidos"
              tone="critical"
              plans={groups.overdue}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggle={(p) => toggleActive.mutate(p)}
              onDelete={setDeleteTarget}
            />
          )}
          {groups.warning.length > 0 && (
            <PlanGroup
              title="Por vencer"
              tone="warning"
              plans={groups.warning}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggle={(p) => toggleActive.mutate(p)}
              onDelete={setDeleteTarget}
            />
          )}
          {groups.ok.length > 0 && (
            <PlanGroup
              title="Al día"
              tone="success"
              plans={groups.ok}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggle={(p) => toggleActive.mutate(p)}
              onDelete={setDeleteTarget}
            />
          )}
          {groups.inactive.length > 0 && (
            <PlanGroup
              title="Inactivos"
              tone="muted"
              plans={groups.inactive}
              canWrite={canWrite}
              onEdit={setEditTarget}
              onToggle={(p) => toggleActive.mutate(p)}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      )}

      <PlanFormDialog
        open={createOpen || !!editTarget}
        target={editTarget}
        onSave={(values) => upsert.mutate({ id: editTarget?.id ?? null, values })}
        onClose={() => { setCreateOpen(false); setEditTarget(null) }}
        isPending={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plan preventivo?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> no volverá a generar OTs.
              Las OTs históricas se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && softDelete.mutate(deleteTarget)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Plan status helper ─────────────────────────────────────────────────────

type PlanStatus = 'overdue' | 'warning' | 'ok'

function planStatus(p: MaintPlan): PlanStatus {
  const current = currentMeterFor(p)
  if (current === null) return 'ok'
  const diff = p.next_execution_value - current
  if (diff <= 0) return 'overdue'
  if (p.advance_warning != null && diff <= p.advance_warning) return 'warning'
  return 'ok'
}

function currentMeterFor(p: MaintPlan): number | null {
  if (!p.equipment) return null
  if (p.trigger_type === 'hours' || p.trigger_type === 'usage_hours') {
    return p.equipment.current_hours ?? null
  }
  if (p.trigger_type === 'kilometers') return p.equipment.current_km ?? null
  return null
}

function formatProgress(p: MaintPlan): { remaining: string; total: string } {
  const current = currentMeterFor(p)
  if (current === null) {
    return { remaining: '—', total: `cada ${p.interval_value.toLocaleString('es-MX')} ${p.interval_unit}` }
  }
  const diff = p.next_execution_value - current
  const unit = p.interval_unit
  if (diff <= 0) {
    return {
      remaining: `Vencido por ${Math.abs(diff).toLocaleString('es-MX')} ${unit}`,
      total: `cada ${p.interval_value.toLocaleString('es-MX')} ${unit}`,
    }
  }
  return {
    remaining: `Faltan ${diff.toLocaleString('es-MX')} ${unit}`,
    total: `cada ${p.interval_value.toLocaleString('es-MX')} ${unit}`,
  }
}

// ─── Plan group section ─────────────────────────────────────────────────────

interface GroupProps {
  title: string
  tone: 'critical' | 'warning' | 'success' | 'muted'
  plans: MaintPlan[]
  canWrite: boolean
  onEdit: (p: MaintPlan) => void
  onToggle: (p: MaintPlan) => void
  onDelete: (p: MaintPlan) => void
}

function PlanGroup({ title, tone, plans, canWrite, onEdit, onToggle, onDelete }: GroupProps) {
  const toneClass = {
    critical: 'text-destructive',
    warning:  'text-warning',
    success:  'text-success',
    muted:    'text-muted-foreground',
  }[tone]
  const ToneIcon = {
    critical: AlertOctagon, warning: AlertOctagon,
    success: CheckCircle2, muted: PowerOff,
  }[tone]

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <ToneIcon className={`size-4 ${toneClass}`} strokeWidth={1.75} />
        <h2 className={`font-heading text-sm font-semibold tracking-[-0.01em] ${toneClass}`}>
          {title}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">({plans.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {plans.map((p) => {
          const status = planStatus(p)
          const progress = formatProgress(p)
          const rail = {
            overdue: 'bg-destructive',
            warning: 'bg-warning',
            ok:      'bg-success',
          }[status]

          return (
            <div
              key={p.id}
              className={`rounded-xl border border-border bg-card overflow-hidden flex group ${!p.is_active ? 'opacity-60' : ''}`}
            >
              <span aria-hidden className={`w-1 shrink-0 ${p.is_active ? rail : 'bg-border'}`} />
              <div className="flex-1 min-w-0 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium truncate">{p.name}</h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Tractor className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {p.equipment?.code} — {p.equipment?.name}
                      </span>
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon-sm"
                        onClick={() => onToggle(p)}
                        title={p.is_active ? 'Pausar' : 'Activar'}
                      >
                        {p.is_active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(p)} title="Editar">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(p)}
                        title="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px]">{TRIGGER_LABEL[p.trigger_type].split(' ')[1] ?? p.trigger_type}</Badge>
                    {!p.is_active && <Badge variant="outline" className="text-[9px] text-muted-foreground">Pausado</Badge>}
                  </div>
                  <span className="text-muted-foreground text-[11px]">{progress.total}</span>
                </div>

                <div className={`mt-2 text-sm font-medium tabular-nums ${status === 'overdue' ? 'text-destructive' : status === 'warning' ? 'text-warning' : ''}`}>
                  {progress.remaining}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Plan form dialog ───────────────────────────────────────────────────────

interface FormProps {
  open: boolean
  target: MaintPlan | null
  onSave: (values: PlanForm) => void
  onClose: () => void
  isPending: boolean
}

function PlanFormDialog({ open, target, onSave, onClose, isPending }: FormProps) {
  const { data: equipments = [] } = useQuery<Array<{ id: string; code: string; name: string; current_hours: number | null; current_km: number | null }>>({
    queryKey: ['equipment-for-plans'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name, current_hours, current_km')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data
    },
  })

  const form = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    values: target
      ? {
          equipment_id: target.equipment_id,
          name: target.name,
          trigger_type: target.trigger_type,
          interval_value: target.interval_value,
          interval_unit: target.interval_unit,
          last_execution_value: target.last_execution_value,
          next_execution_value: target.next_execution_value,
          advance_warning: target.advance_warning,
          is_active: target.is_active,
        }
      : {
          equipment_id: '',
          name: '',
          trigger_type: 'hours',
          interval_value: 250,
          interval_unit: 'horas',
          last_execution_value: null,
          next_execution_value: 250,
          advance_warning: 25,
          is_active: true,
        },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form

  const triggerType = watch('trigger_type')
  const equipmentId = watch('equipment_id')
  const selectedEquip = equipments.find((e) => e.id === equipmentId)

  // Auto-suggest unit when trigger type changes
  const suggestedUnit = triggerType === 'hours' || triggerType === 'usage_hours'
    ? 'horas'
    : triggerType === 'kilometers'
    ? 'km'
    : 'días'

  const handleClose = () => { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target ? 'Editar plan preventivo' : 'Nuevo plan preventivo'}</DialogTitle>
        </DialogHeader>

        <form
          id="plan-form"
          onSubmit={handleSubmit((v) => onSave(v))}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Equipo <span className="text-destructive">*</span></Label>
              <Select value={equipmentId} onValueChange={(v) => setValue('equipment_id', v ?? '', { shouldDirty: true })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona un equipo" /></SelectTrigger>
                <SelectContent>
                  {equipments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.code} — {e.name}
                      {e.current_hours != null && (
                        <span className="ml-2 text-muted-foreground text-xs">· {Number(e.current_hours).toLocaleString('es-MX')} hrs</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.equipment_id && <p className="text-xs text-destructive">{errors.equipment_id.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="pname">Nombre del plan <span className="text-destructive">*</span></Label>
              <Input
                id="pname"
                {...register('name')}
                placeholder="Ej: Cambio de aceite cada 250 hrs"
                className="h-9"
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Disparador <span className="text-destructive">*</span></Label>
              <Select value={triggerType} onValueChange={(v) => {
                setValue('trigger_type', v as PlanForm['trigger_type'], { shouldDirty: true })
                setValue('interval_unit', v === 'hours' || v === 'usage_hours' ? 'horas' : v === 'kilometers' ? 'km' : 'días')
              }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TRIGGERS.map((t) => (
                    <SelectItem key={t} value={t}>{TRIGGER_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="piu">Unidad</Label>
              <Input
                id="piu"
                {...register('interval_unit')}
                placeholder={suggestedUnit}
                className="h-9"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="piv">Intervalo <span className="text-destructive">*</span></Label>
              <Input
                id="piv"
                type="number" min="0.1" step="0.1"
                {...register('interval_value', { valueAsNumber: true })}
                className="h-9 text-right font-mono tabular-nums"
                aria-invalid={!!errors.interval_value}
              />
              {errors.interval_value && <p className="text-xs text-destructive">{errors.interval_value.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paw">Aviso anticipado</Label>
              <Input
                id="paw"
                type="number" min="0"
                {...register('advance_warning', { setValueAs: (v) => v === '' || v == null ? null : Number(v) })}
                className="h-9 text-right font-mono tabular-nums"
                placeholder="Ej: 25"
              />
              <p className="text-[10px] text-muted-foreground">
                Genera OT cuando faltan ≤ este valor.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ple">Última ejecución</Label>
              <Input
                id="ple"
                type="number" min="0"
                {...register('last_execution_value', { setValueAs: (v) => v === '' || v == null ? null : Number(v) })}
                className="h-9 text-right font-mono tabular-nums"
                placeholder={selectedEquip?.current_hours != null ? String(selectedEquip.current_hours) : 'Horómetro actual'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pne">Próxima ejecución <span className="text-destructive">*</span></Label>
              <Input
                id="pne"
                type="number" min="0"
                {...register('next_execution_value', { valueAsNumber: true })}
                className="h-9 text-right font-mono tabular-nums"
                aria-invalid={!!errors.next_execution_value}
              />
              {errors.next_execution_value && <p className="text-xs text-destructive">{errors.next_execution_value.message}</p>}
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
            {target ? 'Guardar cambios' : 'Crear plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
