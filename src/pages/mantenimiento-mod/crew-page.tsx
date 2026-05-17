import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search, UserCog, Wrench, CheckCircle2, Timer, DollarSign,
  Plus, X, Loader2,
} from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatSupabaseError } from '@/lib/errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface TechnicianRow {
  employee_id: string
  organization_id: string
  full_name: string
  employee_code: string | null
  skills: string[] | null
  is_technician: boolean | null
  hourly_rate_mxn: number | null
  active_wo_count: number | null
  completed_30d: number | null
  avg_mttr_hours: number | null
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}

function fmtMxn(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/h`
}

export default function CrewPage() {
  const { organization } = useAuth()
  const { hasAnyRole } = usePermissions()
  const canEdit = hasAnyRole(['admin', 'mantenimiento'])

  const [search, setSearch] = useState('')
  const [onlyTechs, setOnlyTechs] = useState(true)
  const [editing, setEditing] = useState<TechnicianRow | null>(null)

  const { data: rows = [], isLoading } = useQuery<TechnicianRow[]>({
    queryKey: ['technician-workload', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('technician_workload')
        .select('employee_id, organization_id, full_name, employee_code, skills, is_technician, hourly_rate_mxn, active_wo_count, completed_30d, avg_mttr_hours')
        .order('active_wo_count', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as TechnicianRow[]
    },
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyTechs && !r.is_technician) return false
      if (!term) return true
      const hay = `${r.full_name ?? ''} ${r.employee_code ?? ''}`.toLowerCase()
      return hay.includes(term)
    })
  }, [rows, search, onlyTechs])

  if (!organization?.id) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      <PageHeader
        title="Equipo de mantenimiento"
        description="Técnicos y carga de trabajo"
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="h-9 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm select-none cursor-pointer shrink-0">
          <Checkbox
            checked={onlyTechs}
            onCheckedChange={(v) => setOnlyTechs(!!v)}
          />
          <span>Sólo técnicos activos</span>
        </label>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-14 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? 'Aún no hay empleados registrados.'
              : 'Sin resultados con los filtros actuales.'}
          </div>
        ) : (
          filtered.map((r) => {
            const initials = initialsFor(r.full_name ?? '')
            const skills = r.skills ?? []
            const active = r.active_wo_count ?? 0
            const completed = r.completed_30d ?? 0
            const mttr = r.avg_mttr_hours == null ? null : Number(r.avg_mttr_hours)
            return (
              <div
                key={r.employee_id}
                className="rounded-xl border border-border bg-card p-4 flex items-start gap-4"
              >
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{r.full_name}</span>
                        {r.is_technician ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                            Técnico
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            No técnico
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {r.employee_code ?? '—'}
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8"
                        onClick={() => setEditing(r)}
                      >
                        <UserCog className="size-3.5" />
                        Editar habilidades
                      </Button>
                    )}
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5">
                    {skills.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">Sin habilidades</span>
                    ) : (
                      skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                    <Stat icon={Wrench} label="OTs activas" value={active.toString()} tone={active > 0 ? 'warning' : 'default'} />
                    <Stat icon={CheckCircle2} label="Completadas (30d)" value={completed.toString()} />
                    <Stat icon={Timer} label="MTTR prom." value={mttr == null ? '—' : `${mttr.toFixed(1)} h`} />
                    <Stat icon={DollarSign} label="Tarifa" value={fmtMxn(r.hourly_rate_mxn)} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {editing && (
        <EditSkillsDialog
          open={!!editing}
          row={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Stat({
  icon: Icon, label, value, tone = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  const toneCls = tone === 'warning' ? 'text-warning' : 'text-foreground'
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Icon className="size-3" strokeWidth={1.75} />
        {label}
      </div>
      <div className={`text-sm font-semibold font-mono tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}

// ─── Edit dialog ────────────────────────────────────────────────────────────

interface EditSkillsDialogProps {
  open: boolean
  row: TechnicianRow
  onClose: () => void
}

function EditSkillsDialog({ open, row, onClose }: EditSkillsDialogProps) {
  const qc = useQueryClient()
  const { organization } = useAuth()
  const [skills, setSkills] = useState<string[]>(row.skills ?? [])
  const [skillInput, setSkillInput] = useState('')
  const [isTechnician, setIsTechnician] = useState<boolean>(row.is_technician ?? false)
  const [rate, setRate] = useState<string>(
    row.hourly_rate_mxn == null ? '' : String(row.hourly_rate_mxn),
  )

  const addSkill = () => {
    const term = skillInput.trim()
    if (!term) return
    if (skills.includes(term)) {
      setSkillInput('')
      return
    }
    setSkills([...skills, term])
    setSkillInput('')
  }

  const removeSkill = (s: string) => {
    setSkills(skills.filter((x) => x !== s))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        skills,
        is_technician: isTechnician,
        hourly_rate_mxn: rate.trim() === '' ? null : Number(rate),
      }
      const { error } = await db
        .from('employees')
        .update(payload)
        .eq('id', row.employee_id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Habilidades actualizadas')
      qc.invalidateQueries({ queryKey: ['technician-workload', organization?.id] })
      qc.invalidateQueries({ queryKey: ['employees-techs'] })
      onClose()
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo guardar')
      toast.error(title, { description })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar habilidades — {row.full_name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Es técnico */}
          <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
            <Checkbox
              checked={isTechnician}
              onCheckedChange={(v) => setIsTechnician(!!v)}
            />
            <span>Es técnico de mantenimiento</span>
          </label>

          {/* Skills chips */}
          <div className="flex flex-col gap-1.5">
            <Label>Habilidades</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border border-input bg-background p-1.5">
              {skills.length === 0 && (
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 italic">
                  Sin habilidades — agrega abajo
                </span>
              )}
              {skills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Quitar ${s}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addSkill()
                  }
                }}
                placeholder="Ej: hidráulica, soldadura, eléctrico…"
                className="h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSkill}
                disabled={!skillInput.trim()}
                className="gap-1.5 h-9"
              >
                <Plus className="size-3.5" />
                Agregar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Presiona Enter o coma para agregar. Estas etiquetas ayudan a asignar OTs por especialidad.
            </p>
          </div>

          {/* Tarifa */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate">Tarifa por hora (MXN)</Label>
            <Input
              id="rate"
              type="number"
              min="0"
              step="1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Ej: 120"
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Se usa para calcular el costo de mano de obra en OTs cerradas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5"
          >
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
