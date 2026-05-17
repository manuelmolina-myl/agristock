/**
 * ServiceRequestDetailPage — vista de detalle de una solicitud de servicio,
 * con acciones de triage para mantenimiento/admin:
 *
 *   • Triagear (revisar sin convertir, opcional notas).
 *   • Convertir a OT (RPC convert_service_request_to_wo, default tipo
 *     'corrective'; navega a la WO recién creada).
 *   • Rechazar / Marcar duplicado (RPC reject_service_request).
 *
 * El reporte es de sólo lectura para cualquier usuario que no tenga
 * `can_write_cmms` (validado en backend + RLS). Aquí ocultamos los botones
 * vía `usePermissions().can('work_order.assign')` que coincide con los roles
 * de mantenimiento/admin.
 */
import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Loader2, MessageSquareWarning, Tractor, MapPin, User as UserIcon,
  CalendarClock, CheckCircle2, XCircle, Copy as CopyIcon, ArrowRight, Image as ImageIcon,
  AlertCircle, ClipboardCheck, Wrench,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { formatSupabaseError } from '@/lib/errors'
import type { WOPriority } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type ServiceRequestStatus = 'open' | 'triaged' | 'converted' | 'duplicate' | 'rejected'

interface ServiceRequestDetail {
  id: string
  folio: string
  organization_id: string
  reported_at: string
  reported_by: string
  triaged_at: string | null
  triaged_by: string | null
  triage_notes: string | null
  converted_wo_id: string | null
  status: ServiceRequestStatus
  urgency: WOPriority
  description: string
  location_hint: string | null
  photos: string[] | null
  equipment_id: string | null
  equipment: { id: string; code: string; name: string } | null
  reporter: { full_name: string } | null
  triager: { full_name: string } | null
  converted_wo: { id: string; folio: string; status: string } | null
}

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  open:       'Abierta',
  triaged:    'Triagada',
  converted:  'Convertida a OT',
  duplicate:  'Duplicada',
  rejected:   'Rechazada',
}
const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  open:       'bg-warning/15 text-warning',
  triaged:    'bg-usd/15 text-usd',
  converted:  'bg-success/15 text-success',
  duplicate:  'bg-muted text-muted-foreground',
  rejected:   'bg-destructive/15 text-destructive',
}
const URGENCY_LABEL: Record<WOPriority, string> = {
  low:      'Baja',
  medium:   'Normal',
  high:     'Alta',
  critical: 'Crítica',
}
const URGENCY_TONE: Record<WOPriority, string> = {
  low:      'bg-muted text-muted-foreground',
  medium:   'bg-usd/15 text-usd',
  high:     'bg-warning/15 text-warning',
  critical: 'bg-destructive/15 text-destructive',
}

const WO_TYPE_OPTIONS = [
  { value: 'corrective',  label: 'Correctivo' },
  { value: 'preventive',  label: 'Preventivo' },
  { value: 'predictive',  label: 'Predictivo' },
  { value: 'improvement', label: 'Mejora' },
  { value: 'inspection',  label: 'Inspección' },
] as const

export default function ServiceRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { organization } = useAuth()
  const { can } = usePermissions()

  const backTo = (location.state as { from?: string } | null)?.from ?? '/mantenimiento/solicitudes'

  const { data: sr, isLoading } = useQuery<ServiceRequestDetail | null>({
    queryKey: ['service-request', id],
    enabled: !!id && !!organization?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('service_requests')
        .select(`
          id, folio, organization_id, reported_at, reported_by, triaged_at, triaged_by,
          triage_notes, converted_wo_id, status, urgency, description, location_hint, photos,
          equipment_id,
          equipment:equipment!service_requests_equipment_id_fkey(id, code, name),
          reporter:profiles!service_requests_reported_by_fkey(full_name),
          triager:profiles!service_requests_triaged_by_fkey(full_name),
          converted_wo:work_orders!service_requests_converted_wo_id_fkey(id, folio, status)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ServiceRequestDetail | null
    },
  })

  const canEdit = can('work_order.assign')

  // ── Mutations ─────────────────────────────────────────────────────────────
  const triageMutation = useMutation({
    mutationFn: async (input: { notes: string | null }) => {
      const { error } = await db.rpc('triage_service_request', {
        p_request_id: id,
        p_notes:      input.notes,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Solicitud triagada')
      qc.invalidateQueries({ queryKey: ['service-request', id] })
      qc.invalidateQueries({ queryKey: ['service-requests'] })
      qc.invalidateQueries({ queryKey: ['mantto-pending-service-requests'] })
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo triagear')
      toast.error(title, { description })
    },
  })

  const convertMutation = useMutation({
    mutationFn: async (input: { wo_type: string; priority: WOPriority | null }) => {
      const { data, error } = await db.rpc('convert_service_request_to_wo', {
        p_request_id: id,
        p_wo_type:    input.wo_type,
        p_priority:   input.priority ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (woId) => {
      toast.success('Convertida a orden de trabajo', { description: 'Abriendo la OT…' })
      qc.invalidateQueries({ queryKey: ['service-request', id] })
      qc.invalidateQueries({ queryKey: ['service-requests'] })
      qc.invalidateQueries({ queryKey: ['mantto-pending-service-requests'] })
      qc.invalidateQueries({ queryKey: ['cmms'] })
      navigate(`/mantenimiento/ordenes/${woId}`, { state: { from: location.pathname } })
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo convertir la solicitud')
      toast.error(title, { description })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async (input: { reason: string; as_duplicate: boolean }) => {
      const { error } = await db.rpc('reject_service_request', {
        p_request_id:   id,
        p_reason:       input.reason,
        p_as_duplicate: input.as_duplicate,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(vars.as_duplicate ? 'Marcada como duplicada' : 'Solicitud rechazada')
      qc.invalidateQueries({ queryKey: ['service-request', id] })
      qc.invalidateQueries({ queryKey: ['service-requests'] })
      qc.invalidateQueries({ queryKey: ['mantto-pending-service-requests'] })
    },
    onError: (e) => {
      const { title, description } = formatSupabaseError(e, 'No se pudo rechazar la solicitud')
      toast.error(title, { description })
    },
  })

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [triageOpen, setTriageOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectAsDuplicate, setRejectAsDuplicate] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!sr) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <MessageSquareWarning className="size-10 text-muted-foreground mb-3" strokeWidth={1.5} />
        <h2 className="font-heading text-lg font-semibold">Solicitud no encontrada</h2>
        <Button onClick={() => navigate(backTo)} variant="outline" className="mt-4">
          Volver al listado
        </Button>
      </div>
    )
  }

  const photos = Array.isArray(sr.photos) ? sr.photos : []
  const triageStatus = sr.status === 'open' || sr.status === 'triaged'

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(backTo)} aria-label="Volver" className="mt-0.5">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-xl font-semibold tracking-[-0.01em] font-mono">{sr.folio}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[sr.status]}`}>
                {STATUS_LABEL[sr.status]}
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${URGENCY_TONE[sr.urgency]}`}>
                {URGENCY_LABEL[sr.urgency]}
              </span>
            </div>
            <span aria-hidden className="block h-[2px] w-10 rounded-full bg-warning/80 mt-1.5" />
            <p className="text-sm text-muted-foreground mt-1.5">
              Reportada {formatDistanceToNow(new Date(sr.reported_at), { addSuffix: true, locale: es })}
              {sr.reporter?.full_name && ` por ${sr.reporter.full_name}`}
            </p>
          </div>
        </div>

        {canEdit && triageStatus && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {sr.status === 'open' && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTriageOpen(true)}>
                <ClipboardCheck className="size-4" /> Triagear
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setConvertOpen(true)}>
              <Wrench className="size-4" /> Convertir a OT
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setRejectAsDuplicate(true); setRejectOpen(true) }}
            >
              <CopyIcon className="size-4" /> Duplicado
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => { setRejectAsDuplicate(false); setRejectOpen(true) }}
            >
              <XCircle className="size-4" /> Rechazar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Columna principal */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">
                Descripción
              </div>
              <p className="whitespace-pre-wrap text-sm">{sr.description}</p>
            </div>
          </section>

          {photos.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
                <ImageIcon className="size-3" /> Fotos ({photos.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {photos.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block rounded-md overflow-hidden border border-border hover:border-foreground/30 transition-colors aspect-square bg-muted/30"
                  >
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {sr.triage_notes && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1 font-medium">
                Notas de triage
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{sr.triage_notes}</p>
              {sr.triager?.full_name && sr.triaged_at && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {sr.triager.full_name} · {format(new Date(sr.triaged_at), "d MMM yyyy, HH:mm", { locale: es })}
                </p>
              )}
            </section>
          )}

          {sr.status === 'converted' && sr.converted_wo && (
            <section className="rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-success shrink-0" />
                <span>Convertida en la OT</span>
                <button
                  type="button"
                  onClick={() => navigate(`/mantenimiento/ordenes/${sr.converted_wo!.id}`, { state: { from: location.pathname } })}
                  className="font-mono font-medium text-success hover:underline inline-flex items-center gap-1"
                >
                  {sr.converted_wo.folio}
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
              Equipo
            </h3>
            {sr.equipment ? (
              <div className="flex items-start gap-2">
                <Tractor className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{sr.equipment.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{sr.equipment.code}</div>
                  <button
                    type="button"
                    onClick={() => navigate(`/mantenimiento/equipos/${sr.equipment!.id}`, { state: { from: location.pathname } })}
                    className="mt-1.5 text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Ver equipo <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sin equipo asignado</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
              Reporte
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <UserIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[11px] text-muted-foreground">Reportado por</dt>
                  <dd className="font-medium">{sr.reporter?.full_name ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CalendarClock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[11px] text-muted-foreground">Fecha</dt>
                  <dd>{format(new Date(sr.reported_at), "d MMM yyyy, HH:mm", { locale: es })}</dd>
                </div>
              </div>
              {sr.location_hint && (
                <div className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Ubicación</dt>
                    <dd>{sr.location_hint}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {sr.triaged_at && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                Triage
              </h3>
              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Por</dt>
                  <dd className="font-medium">{sr.triager?.full_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Fecha</dt>
                  <dd>{format(new Date(sr.triaged_at), "d MMM yyyy, HH:mm", { locale: es })}</dd>
                </div>
              </dl>
            </section>
          )}
        </aside>
      </div>

      {/* Dialogs */}
      <TriageDialog
        open={triageOpen}
        onClose={() => setTriageOpen(false)}
        onSave={(notes) => triageMutation.mutate({ notes }, { onSuccess: () => setTriageOpen(false) })}
        isPending={triageMutation.isPending}
      />

      <ConvertDialog
        open={convertOpen}
        defaultPriority={sr.urgency}
        onClose={() => setConvertOpen(false)}
        onSave={(wo_type, priority) => convertMutation.mutate({ wo_type, priority }, { onSuccess: () => setConvertOpen(false) })}
        isPending={convertMutation.isPending}
      />

      <RejectDialog
        open={rejectOpen}
        asDuplicate={rejectAsDuplicate}
        onClose={() => setRejectOpen(false)}
        onSave={(reason) => rejectMutation.mutate(
          { reason, as_duplicate: rejectAsDuplicate },
          { onSuccess: () => setRejectOpen(false) },
        )}
        isPending={rejectMutation.isPending}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Dialogs
// ──────────────────────────────────────────────────────────────────────────────

function TriageDialog({
  open, onClose, onSave, isPending,
}: {
  open: boolean
  onClose: () => void
  onSave: (notes: string | null) => void
  isPending: boolean
}) {
  const [notes, setNotes] = useState('')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4" /> Triagear solicitud
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Marcar como revisada sin crear una OT. Sirve para registrar que mantenimiento
            ya analizó el reporte (útil cuando la decisión final tarda en llegar).
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="triage-notes">Notas (opcional)</Label>
            <Textarea
              id="triage-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones, hallazgos preliminares…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            onClick={() => onSave(notes.trim() || null)}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Marcar triagada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConvertDialog({
  open, defaultPriority, onClose, onSave, isPending,
}: {
  open: boolean
  defaultPriority: WOPriority
  onClose: () => void
  onSave: (wo_type: string, priority: WOPriority | null) => void
  isPending: boolean
}) {
  const [woType, setWoType] = useState<string>('corrective')
  const [priority, setPriority] = useState<WOPriority>(defaultPriority)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4" /> Convertir a orden de trabajo
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              Se generará una nueva OT con la descripción, equipo y urgencia de esta solicitud.
              Esta acción no se puede revertir.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo de OT</Label>
              <Select value={woType} onValueChange={(v) => setWoType(v ?? 'corrective')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WO_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WOPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            onClick={() => onSave(woType, priority)}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Crear OT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  open, asDuplicate, onClose, onSave, isPending,
}: {
  open: boolean
  asDuplicate: boolean
  onClose: () => void
  onSave: (reason: string) => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {asDuplicate ? <CopyIcon className="size-4" /> : <XCircle className="size-4 text-destructive" />}
            {asDuplicate ? 'Marcar como duplicado' : 'Rechazar solicitud'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {asDuplicate
              ? 'Indica de qué solicitud o folio es duplicado para que quede registro.'
              : 'Explica por qué no procede (no era falla real, ya se atendió, etc.).'}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rej-reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rej-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={asDuplicate ? 'Ej. duplicado de SR-260516-AAA…' : 'Ej. el equipo ya fue reparado por otra OT'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            variant={asDuplicate ? 'default' : 'destructive'}
            onClick={() => onSave(reason.trim())}
            disabled={isPending || reason.trim().length < 3}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {asDuplicate ? 'Marcar duplicado' : 'Rechazar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
