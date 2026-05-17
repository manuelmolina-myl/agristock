/**
 * NuevaSolicitudDialog — formulario para reportar un problema (service request).
 *
 * Visible para CUALQUIER usuario autenticado de la organización. No exige
 * `can_write_cmms`: la idea es que operarios, almacenistas y compras puedan
 * reportar fallos para que mantenimiento los triagee.
 *
 * Persiste en `public.service_requests`. Las fotos se suben al bucket privado
 * `cotizaciones` bajo `<orgId>/service-requests/<requestId>/<timestamp>.<ext>`
 * y se guarda el array de signed URLs (TTL 1 año) en la columna `photos` JSONB
 * — mismo patrón que `RegistrarPagoDialog` / `CreateInvoiceDialog`.
 *
 * Folio: como `next_folio()` (migración 017) usa un fallback `UPPER(p_type)`
 * para tipos no mapeados, generamos un folio cliente-side `SR-YYMMDDHHmmss-rand`
 * para evitar el feo "SERVICE_REQUEST-2026-00001". Si en el futuro se mapea
 * 'service_request' → 'SR' en next_folio podemos cambiar a la RPC central.
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Paperclip, X as XIcon, AlertCircle, Image as ImageIcon } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatSupabaseError } from '@/lib/errors'
import type { WOPriority } from '@/lib/database.types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const URGENCY_OPTIONS: Array<{ value: WOPriority; label: string }> = [
  { value: 'low',      label: 'Baja' },
  { value: 'medium',   label: 'Normal' },
  { value: 'high',     label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
]

const schema = z.object({
  equipment_id:  z.string().uuid({ message: 'Selecciona el equipo' }),
  description:   z.string().trim().min(10, 'Describe el problema (mínimo 10 caracteres)'),
  urgency:       z.enum(['low', 'medium', 'high', 'critical']),
  location_hint: z.string().max(120).optional().nullable(),
})

type FormValues = z.infer<typeof schema>

interface NuevaSolicitudDialogProps {
  open: boolean
  onClose: () => void
}

function makeFolio(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `SR-${stamp}-${rand}`
}

export function NuevaSolicitudDialog({ open, onClose }: NuevaSolicitudDialogProps) {
  const { organization, user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const photoRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      equipment_id:  '',
      description:   '',
      urgency:       'medium',
      location_hint: '',
    },
  })
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form
  const urgency = watch('urgency') as WOPriority
  const equipmentId = watch('equipment_id')

  // Equipos disponibles para el organizational scope (cualquier usuario los puede leer).
  const { data: equipos = [] } = useQuery<Array<{ id: string; code: string; name: string }>>({
    queryKey: ['equipment-for-service-request', organization?.id],
    enabled: open && !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, code, name')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const handleClose = () => {
    if (submitting) return
    reset()
    setPhotos([])
    if (photoRef.current) photoRef.current.value = ''
    onClose()
  }

  async function uploadPhoto(file: File, requestId: string): Promise<string | null> {
    if (!organization) return null
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${organization.id}/service-requests/${requestId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error } = await supabase.storage
      .from('cotizaciones')
      .upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (error) throw error
    const { data: signed, error: signErr } = await supabase.storage
      .from('cotizaciones')
      .createSignedUrl(path, 60 * 60 * 24 * 30 * 12) // 1 año
    if (signErr) throw signErr
    return signed.signedUrl
  }

  const onSubmit = async (values: FormValues) => {
    if (!organization || !user) {
      toast.error('Sesión no inicializada')
      return
    }
    setSubmitting(true)
    try {
      const folio = makeFolio()

      // 1) Insert request (sin fotos todavía)
      const { data: inserted, error: insErr } = await db
        .from('service_requests')
        .insert({
          organization_id: organization.id,
          folio,
          equipment_id:    values.equipment_id,
          reported_by:     user.id,
          description:     values.description.trim(),
          urgency:         values.urgency,
          location_hint:   values.location_hint?.trim() || null,
          photos:          [],
        })
        .select('id, folio')
        .single()
      if (insErr) throw insErr

      const newId = (inserted as { id: string }).id

      // 2) Subir fotos (si las hay) y actualizar el registro con las URLs.
      if (photos.length > 0) {
        const urls: string[] = []
        for (const file of photos) {
          try {
            const url = await uploadPhoto(file, newId)
            if (url) urls.push(url)
          } catch (err) {
            console.error('Foto falló', err)
          }
        }
        if (urls.length > 0) {
          await db
            .from('service_requests')
            .update({ photos: urls })
            .eq('id', newId)
        }
      }

      toast.success('Solicitud enviada', {
        description: `Folio ${(inserted as { folio: string }).folio}. Mantenimiento la revisará pronto.`,
      })

      qc.invalidateQueries({ queryKey: ['service-requests'] })
      qc.invalidateQueries({ queryKey: ['mantto-pending-service-requests'] })

      handleClose()
      navigate('/mantenimiento/solicitudes')
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo enviar la solicitud')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="!max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reportar problema de equipo</DialogTitle>
        </DialogHeader>

        <form id="sr-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Equipo <span className="text-destructive">*</span></Label>
            <Select
              value={equipmentId}
              onValueChange={(v) => setValue('equipment_id', v ?? '', { shouldDirty: true, shouldValidate: true })}
            >
              <SelectTrigger className="h-9" aria-invalid={!!errors.equipment_id}>
                <SelectValue placeholder="Selecciona el equipo afectado" />
              </SelectTrigger>
              <SelectContent>
                {equipos.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    Sin equipos registrados.
                  </div>
                ) : equipos.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="font-mono text-[11px] mr-1.5 text-muted-foreground">{e.code}</span>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.equipment_id && <p className="text-xs text-destructive">{errors.equipment_id.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-desc">Descripción del problema <span className="text-destructive">*</span></Label>
            <Textarea
              id="sr-desc"
              rows={4}
              placeholder="¿Qué está pasando? ¿Cuándo empezó? ¿Síntomas?"
              {...register('description')}
              aria-invalid={!!errors.description}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Urgencia</Label>
              <Select
                value={urgency}
                onValueChange={(v) => setValue('urgency', v as WOPriority, { shouldDirty: true })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sr-loc">Ubicación (opcional)</Label>
              <Input
                id="sr-loc"
                placeholder="Junto a la bodega 2"
                {...register('location_hint')}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Fotos (opcional)</Label>
            <input
              ref={photoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                const sized = files.filter((f) => {
                  if (f.size > 10 * 1024 * 1024) {
                    toast.error(`"${f.name}" supera 10 MB`)
                    return false
                  }
                  return true
                })
                setPhotos((prev) => [...prev, ...sized])
                e.target.value = ''
              }}
            />
            {photos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {photos.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 h-9">
                    <ImageIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate flex-1">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => photoRef.current?.click()}
                  className="h-8 justify-start gap-2 text-muted-foreground text-xs"
                >
                  <Paperclip className="size-3.5" /> Agregar más fotos
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => photoRef.current?.click()}
                className="h-9 justify-start gap-2 text-muted-foreground text-xs"
              >
                <Paperclip className="size-3.5" /> Adjuntar fotos (máx. 10 MB c/u)
              </Button>
            )}
          </div>

          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              Tu reporte llega a mantenimiento como <strong>solicitud abierta</strong>. Ellos
              decidirán si se convierte en una orden de trabajo, se marca como duplicado, o se
              descarta.
            </div>
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
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default NuevaSolicitudDialog
