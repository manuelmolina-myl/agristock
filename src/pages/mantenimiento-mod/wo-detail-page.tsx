import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  Tractor, User as UserIcon, Calendar, Package, Plus, Trash2, CheckCheck,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { useWorkOrder, useAssignWO, useConsumePartInWO, useCloseWO } from '@/features/mantenimiento/hooks'
import { usePermissions } from '@/hooks/use-permissions'
import type { WOStatus, WOPriority, WOType } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STATUS_LABEL: Record<WOStatus, string> = {
  reported: 'Reportada', scheduled: 'Programada', assigned: 'Asignada',
  in_progress: 'En proceso', waiting_parts: 'Esperando refacción',
  completed: 'Completada', closed: 'Cerrada', cancelled: 'Cancelada',
}
const STATUS_TONE: Record<WOStatus, string> = {
  reported:      'bg-warning/15 text-warning',
  scheduled:     'bg-usd/15 text-usd',
  assigned:      'bg-usd/15 text-usd',
  in_progress:   'bg-warning/15 text-warning',
  waiting_parts: 'bg-warning/15 text-warning',
  completed:     'bg-success/15 text-success',
  closed:        'bg-success/10 text-success/80',
  cancelled:     'bg-destructive/15 text-destructive',
}
const PRIORITY_TONE: Record<WOPriority, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-usd/15 text-usd',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/15 text-destructive',
}
const TYPE_LABEL: Record<WOType, string> = {
  corrective: 'Correctivo', preventive: 'Preventivo', predictive: 'Predictivo',
  improvement: 'Mejora', inspection: 'Inspección',
}

export default function WoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = usePermissions()

  const { data: wo, isLoading } = useWorkOrder(id)
  const assignMutation = useAssignWO()
  const consumeMutation = useConsumePartInWO()
  const closeMutation = useCloseWO()

  // Children data: checklist, parts, labor
  const { data: checklist = [] } = useQuery({
    queryKey: ['wo-checklist', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from('wo_checklist').select('*').eq('wo_id', id).order('display_order')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: parts = [] } = useQuery({
    queryKey: ['wo-parts', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('wo_parts')
        .select('*, item:items(name, sku)')
        .eq('wo_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const { data: labor = [] } = useQuery({
    queryKey: ['wo-labor', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from('wo_labor')
        .select('*, technician:employees(full_name)')
        .eq('wo_id', id)
        .order('work_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const [assignOpen, setAssignOpen] = useState(false)
  const [partOpen, setPartOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!wo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <h2 className="font-heading text-lg font-semibold">OT no encontrada</h2>
        <Button onClick={() => navigate('/mantenimiento/ordenes')} variant="outline" className="mt-4">
          Volver al tablero
        </Button>
      </div>
    )
  }

  const canEdit = can('work_order.assign')

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/mantenimiento/ordenes')} aria-label="Volver" className="mt-0.5">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-xl font-semibold tracking-[-0.01em] font-mono">{wo.folio}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[wo.status]}`}>
                {STATUS_LABEL[wo.status]}
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_TONE[wo.priority]}`}>
                {wo.priority === 'critical' ? 'Crítica' : wo.priority === 'high' ? 'Alta' : wo.priority === 'low' ? 'Baja' : 'Normal'}
              </span>
              <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[wo.wo_type]}</Badge>
            </div>
            <span aria-hidden className="block h-[2px] w-10 rounded-full bg-warning/80 mt-1.5" />
            <p className="text-sm text-muted-foreground mt-1.5">
              Reportada {formatDistanceToNow(new Date(wo.reported_at), { addSuffix: true, locale: es })}
              {wo.reporter?.full_name && ` por ${wo.reporter.full_name}`}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {(wo.status === 'reported' || wo.status === 'scheduled') && (
              <Button size="sm" className="gap-1.5" onClick={() => setAssignOpen(true)}>
                <UserIcon className="size-4" /> Asignar técnico
              </Button>
            )}
            {(wo.status === 'assigned' || wo.status === 'in_progress' || wo.status === 'waiting_parts') && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPartOpen(true)}>
                  <Package className="size-4" /> Consumir refacción
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setCloseOpen(true)}>
                  <CheckCheck className="size-4" /> Cerrar OT
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Layout: tabs on left, meta panel on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="checklist">Checklist ({checklist.length})</TabsTrigger>
              <TabsTrigger value="parts">Refacciones ({parts.length})</TabsTrigger>
              <TabsTrigger value="labor">Mano de obra ({labor.length})</TabsTrigger>
              <TabsTrigger value="evidence">Evidencia</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="m-0 mt-4">
              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">Descripción de la falla</div>
                  <p className="whitespace-pre-wrap">{wo.failure_description ?? '—'}</p>
                </div>
                {wo.failure_type?.label && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">Tipo de falla</div>
                    <p>{wo.failure_type.label} <span className="text-[10px] text-muted-foreground">· severidad {wo.failure_type.severity}</span></p>
                  </div>
                )}
                {wo.solution_applied && (
                  <div className="border-t pt-3">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">Solución aplicada</div>
                    <p className="whitespace-pre-wrap">{wo.solution_applied}</p>
                  </div>
                )}
                {wo.notes && (
                  <div className="border-t pt-3">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">Notas</div>
                    <p className="whitespace-pre-wrap">{wo.notes}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="m-0 mt-4">
              <ChecklistTab woId={wo.id} items={checklist} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="parts" className="m-0 mt-4">
              <PartsTab items={parts} />
            </TabsContent>

            <TabsContent value="labor" className="m-0 mt-4">
              <LaborTab woId={wo.id} items={labor} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="evidence" className="m-0 mt-4">
              <EvidenceTab photosBefore={wo.photos_before as string[] ?? []} photosAfter={wo.photos_after as string[] ?? []} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Meta */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Equipo</h3>
            <div className="flex items-start gap-2">
              <Tractor className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{wo.equipment?.name ?? '—'}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{wo.equipment?.code ?? ''}</div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(wo.equipment as any)?.current_hours != null && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {Number((wo.equipment as any).current_hours).toLocaleString('es-MX')} hrs
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">Asignación</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <UserIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[11px] text-muted-foreground">Técnico</dt>
                  <dd className="font-medium">{wo.primary_technician?.full_name ?? 'Sin asignar'}</dd>
                </div>
              </div>
              {wo.scheduled_date && (
                <div className="flex items-start gap-2">
                  <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Programada</dt>
                    <dd>{format(new Date(wo.scheduled_date), 'd MMM yyyy', { locale: es })}</dd>
                  </div>
                </div>
              )}
              {wo.completed_at && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-success mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Completada</dt>
                    <dd>{format(new Date(wo.completed_at), 'd MMM yyyy, HH:mm', { locale: es })}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {wo.total_cost_mxn != null && wo.total_cost_mxn > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">Costo total</h3>
              <div className="text-xl font-semibold font-mono tabular-nums">
                ${wo.total_cost_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">MXN — refacciones + labor + externo</div>
            </section>
          )}
        </aside>
      </div>

      <AssignDialog
        open={assignOpen}
        woId={wo.id}
        currentTechnicianId={wo.primary_technician_id}
        onClose={() => setAssignOpen(false)}
        onSave={(input) => assignMutation.mutate(input, {
          onSuccess: () => {
            toast.success('OT asignada')
            qc.invalidateQueries({ queryKey: ['cmms'] })
            setAssignOpen(false)
          },
          onError: (e) => {
            const { title, description } = formatSupabaseError(e, 'No se pudo asignar la OT')
            toast.error(title, { description })
          },
        })}
        isPending={assignMutation.isPending}
      />

      <ConsumePartDialog
        open={partOpen}
        woId={wo.id}
        onClose={() => setPartOpen(false)}
        onSave={(input) => consumeMutation.mutate(input, {
          onSuccess: () => {
            toast.success('Refacción consumida', {
              description: 'Stock decrementado y costo añadido a la OT.',
            })
            qc.invalidateQueries({ queryKey: ['cmms'] })
            qc.invalidateQueries({ queryKey: ['wo-parts'] })
            setPartOpen(false)
          },
          onError: (e) => {
            const { title, description } = formatSupabaseError(e, 'No se pudo consumir la refacción')
            toast.error(title, { description })
          },
        })}
        isPending={consumeMutation.isPending}
      />

      <CloseWODialog
        open={closeOpen}
        woId={wo.id}
        checklistTotal={checklist.length}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checklistDone={(checklist as any[]).filter((c) => c.is_completed).length}
        onClose={() => setCloseOpen(false)}
        onSave={(input) => closeMutation.mutate(input, {
          onSuccess: () => {
            toast.success('OT cerrada')
            qc.invalidateQueries({ queryKey: ['cmms'] })
            setCloseOpen(false)
          },
          onError: (e) => {
            const { title, description } = formatSupabaseError(e, 'No se pudo cerrar la OT')
            toast.error(title, { description })
          },
        })}
        isPending={closeMutation.isPending}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

interface ChecklistItem { id: string; task_description: string; is_completed: boolean; notes: string | null }

function ChecklistTab({ woId, items, canEdit }: { woId: string; items: ChecklistItem[]; canEdit: boolean }) {
  const qc = useQueryClient()
  const [newTask, setNewTask] = useState('')

  const addTask = useMutation({
    mutationFn: async () => {
      if (!newTask.trim()) return
      const { error } = await db.from('wo_checklist').insert({
        wo_id: woId, task_description: newTask.trim(), display_order: items.length,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wo-checklist'] }); setNewTask('') },
  })

  const toggleTask = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await db.from('wo_checklist')
        .update({ is_completed: done, completed_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wo-checklist'] }),
  })

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('wo_checklist').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wo-checklist'] }),
  })

  return (
    <div className="rounded-xl border border-border bg-card">
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Sin tareas. Agrega los pasos del trabajo para llevar el control.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => canEdit && toggleTask.mutate({ id: it.id, done: !it.is_completed })}
                className={`size-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                  it.is_completed ? 'bg-success border-success text-success-foreground' : 'border-border hover:border-foreground'
                }`}
                aria-label={it.is_completed ? 'Desmarcar' : 'Marcar completada'}
                disabled={!canEdit}
              >
                {it.is_completed && <CheckCircle2 className="size-3.5" strokeWidth={2.5} />}
              </button>
              <span className={`flex-1 text-sm ${it.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                {it.task_description}
              </span>
              {canEdit && (
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeTask.mutate(it.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="border-t bg-muted/20 px-4 py-2 flex gap-2">
          <Input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask.mutate() } }}
            placeholder="Agregar tarea…"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => addTask.mutate()} disabled={!newTask.trim() || addTask.isPending} className="gap-1 h-8">
            <Plus className="size-3" /> Agregar
          </Button>
        </div>
      )}
    </div>
  )
}

interface PartRow {
  id: string
  requested_quantity: number
  delivered_quantity: number
  total_cost_mxn: number | null
  status: string
  item?: { name: string; sku: string } | null
  created_at: string
}

function PartsTab({ items }: { items: PartRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Sin refacciones consumidas. Usa el botón "Consumir refacción" para descontar del almacén.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Refacción</th>
            <th className="px-3 py-2 text-right font-medium">Cant.</th>
            <th className="px-3 py-2 text-right font-medium">Costo MXN</th>
            <th className="px-3 py-2 text-left font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-muted/20">
              <td className="px-4 py-2">
                <div className="font-medium">{p.item?.name ?? '—'}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{p.item?.sku}</div>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{p.delivered_quantity}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                ${(p.total_cost_mxn ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {format(new Date(p.created_at), 'd MMM HH:mm', { locale: es })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface LaborRow {
  id: string
  work_date: string
  hours: number
  hourly_rate_mxn: number | null
  total_mxn: number
  notes: string | null
  technician?: { full_name: string } | null
}

function LaborTab({ woId, items, canEdit }: { woId: string; items: LaborRow[]; canEdit: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [technicianId, setTechnicianId] = useState('')
  const [hours, setHours] = useState('1')
  const [rate, setRate] = useState('100')
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: technicians = [] } = useQuery<Array<{ id: string; full_name: string }>>({
    queryKey: ['employees-techs'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from('employees').select('id, full_name').order('full_name')
      if (error) throw error
      return data
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      if (!technicianId) throw new Error('Selecciona técnico')
      const { error } = await db.from('wo_labor').insert({
        wo_id: woId, technician_id: technicianId, work_date: workDate,
        hours: Number(hours), hourly_rate_mxn: Number(rate) || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wo-labor'] })
      qc.invalidateQueries({ queryKey: ['cmms'] })
      setOpen(false)
      setTechnicianId(''); setHours('1'); setRate('100')
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo registrar la mano de obra')
      toast.error(title, { description })
    },
  })

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Sin registros de mano de obra.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Técnico</th>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Hrs</th>
              <th className="px-3 py-2 text-right font-medium">Tarifa</th>
              <th className="px-3 py-2 text-right font-medium">Total MXN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((l) => (
              <tr key={l.id} className="hover:bg-muted/20">
                <td className="px-4 py-2">{l.technician?.full_name ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {format(new Date(l.work_date), 'd MMM yyyy', { locale: es })}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{l.hours}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground text-xs">
                  ${(l.hourly_rate_mxn ?? 0).toLocaleString('es-MX')}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
                  ${l.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <div className="border-t bg-muted/20 px-4 py-2 flex justify-end">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
            <Plus className="size-3" /> Agregar mano de obra
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar mano de obra</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Técnico</Label>
              <Select value={technicianId} onValueChange={(v) => setTechnicianId(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Horas</Label>
                <Input type="number" min="0.1" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tarifa/hr</Label>
                <Input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending} className="gap-1.5">
              {add.isPending && <Loader2 className="size-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EvidenceTab({ photosBefore, photosAfter }: { photosBefore: string[]; photosAfter: string[] }) {
  if (photosBefore.length + photosAfter.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Sin evidencia fotográfica.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <section>
        <h3 className="text-xs uppercase tracking-[0.06em] text-muted-foreground mb-2">Antes ({photosBefore.length})</h3>
        <div className="grid grid-cols-2 gap-2">
          {photosBefore.map((url, i) => <img key={i} src={url} alt="" className="rounded-md w-full aspect-square object-cover" />)}
        </div>
      </section>
      <section>
        <h3 className="text-xs uppercase tracking-[0.06em] text-muted-foreground mb-2">Después ({photosAfter.length})</h3>
        <div className="grid grid-cols-2 gap-2">
          {photosAfter.map((url, i) => <img key={i} src={url} alt="" className="rounded-md w-full aspect-square object-cover" />)}
        </div>
      </section>
    </div>
  )
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

interface AssignDialogProps {
  open: boolean
  woId: string
  currentTechnicianId: string | null
  onClose: () => void
  onSave: (input: { wo_id: string; technician_id: string; helpers: string[]; scheduled_date: string | null; estimated_hours: number | null }) => void
  isPending: boolean
}

function AssignDialog({ open, woId, currentTechnicianId, onClose, onSave, isPending }: AssignDialogProps) {
  const [technicianId, setTechnicianId] = useState(currentTechnicianId ?? '')
  const [scheduledDate, setScheduledDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')

  const { data: technicians = [] } = useQuery<Array<{ id: string; full_name: string }>>({
    queryKey: ['employees-techs'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from('employees').select('id, full_name').order('full_name')
      if (error) throw error
      return data
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Asignar técnico</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Técnico principal <span className="text-destructive">*</span></Label>
            <Select value={technicianId} onValueChange={(v) => setTechnicianId(v ?? '')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad">Fecha programada</Label>
              <Input id="ad" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ah">Horas estimadas</Label>
              <Input id="ah" type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className="h-9" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={isPending || !technicianId}
            onClick={() => onSave({
              wo_id: woId,
              technician_id: technicianId,
              helpers: [],
              scheduled_date: scheduledDate || null,
              estimated_hours: estimatedHours ? Number(estimatedHours) : null,
            })}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConsumePartDialog({
  open, woId, onClose, onSave, isPending,
}: {
  open: boolean
  woId: string
  onClose: () => void
  onSave: (input: { wo_id: string; item_id: string; warehouse_id: string; quantity: number }) => void
  isPending: boolean
}) {
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [quantity, setQuantity] = useState('1')

  const { data: items = [] } = useQuery<Array<{ id: string; name: string; sku: string }>>({
    queryKey: ['items-for-parts'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from('items').select('id, name, sku').is('deleted_at', null).order('name').limit(500)
      if (error) throw error
      return data
    },
  })

  const { data: warehouses = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['warehouses-for-parts'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from('warehouses').select('id, name').is('deleted_at', null).order('name')
      if (error) throw error
      return data
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4" /> Consumir refacción
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Refacción</Label>
            <Select value={itemId} onValueChange={(v) => setItemId(v ?? '')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona ítem" /></SelectTrigger>
              <SelectContent>
                {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Almacén</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cantidad</Label>
              <Input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9 text-right font-mono tabular-nums" />
            </div>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              Esto descuenta del stock <strong>inmediatamente</strong> y registra el costo al avg actual.
              No reversible — usa ajustes si te equivocas.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={isPending || !itemId || !warehouseId || Number(quantity) <= 0}
            onClick={() => onSave({ wo_id: woId, item_id: itemId, warehouse_id: warehouseId, quantity: Number(quantity) })}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Consumir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseWODialog({
  open, woId, checklistTotal, checklistDone, onClose, onSave, isPending,
}: {
  open: boolean
  woId: string
  checklistTotal: number
  checklistDone: number
  onClose: () => void
  onSave: (input: { wo_id: string; solution: string; photos_after: string[]; hours_meter_close: number | null; external_cost: number | null; force: boolean }) => void
  isPending: boolean
}) {
  const [solution, setSolution] = useState('')
  const [hoursMeter, setHoursMeter] = useState('')
  const [externalCost, setExternalCost] = useState('')
  const [force, setForce] = useState(false)

  const incomplete = checklistTotal > 0 && checklistDone < checklistTotal

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="size-4 text-success" /> Cerrar orden de trabajo
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {incomplete && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs flex items-start gap-2">
              <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
              <div>
                Checklist incompleto: <strong>{checklistDone}/{checklistTotal}</strong> tareas.
                Marca "forzar cierre" para cerrar de todos modos.
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sol">Solución aplicada <span className="text-destructive">*</span></Label>
            <Textarea id="sol" value={solution} onChange={(e) => setSolution(e.target.value)} rows={3} placeholder="¿Qué se hizo? ¿Qué se reemplazó?" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Horómetro cierre</Label>
              <Input type="number" min="0" value={hoursMeter} onChange={(e) => setHoursMeter(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Costo externo MXN</Label>
              <Input type="number" min="0" value={externalCost} onChange={(e) => setExternalCost(e.target.value)} className="h-9" placeholder="0" />
            </div>
          </div>
          {incomplete && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Forzar cierre aunque el checklist esté incompleto
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={isPending || solution.length < 5 || (incomplete && !force)}
            onClick={() => onSave({
              wo_id: woId, solution, photos_after: [],
              hours_meter_close: hoursMeter ? Number(hoursMeter) : null,
              external_cost: externalCost ? Number(externalCost) : null,
              force,
            })}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            <CheckCheck className="size-4" /> Cerrar OT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

