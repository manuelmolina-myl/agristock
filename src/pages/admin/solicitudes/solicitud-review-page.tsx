import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, XCircle, PackageCheck, User, MapPin, Package } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
import { supabase } from '@/lib/supabase'
import { formatFecha, formatQuantity, cn } from '@/lib/utils'
import {
  SOLICITUD_STATUS_LABELS,
  SOLICITUD_URGENCY_LABELS,
  DESTINATION_TYPE_LABELS,
} from '@/lib/constants'
import {
  solicitudStatusColors,
  solicitudUrgencyColors,
} from '@/lib/status-colors'
import type { Solicitud, SolicitudLine } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Component ────────────────────────────────────────────────────────────────

export function SolicitudReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [approvedQtys, setApprovedQtys] = useState<Record<string, string>>({})
  const [rejectNotes, setRejectNotes] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const { data: solicitud, isLoading } = useQuery<Solicitud>({
    queryKey: ['solicitud', id],
    queryFn: async () => {
      const { data, error } = await db
        .from('solicitudes')
        .select(
          '*, requester:profiles!solicitudes_requested_by_fkey(full_name), crop_lot:crops_lots(name, code), equipment:equipment(name, code), employee:employees(full_name), lines:solicitud_lines(*, item:items(name, sku, unit:units(code)))',
        )
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Solicitud
    },
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitud', id] })
    queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
  }

  // ── Approve ─────────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!solicitud) return
    setIsWorking(true)
    try {
      // Update each line qty_approved
      for (const line of solicitud.lines ?? []) {
        const rawQty = approvedQtys[line.id]
        const qty = rawQty != null && rawQty !== '' ? Number(rawQty) : line.quantity_requested
        const { error: lineErr } = await db
          .from('solicitud_lines')
          .update({ quantity_approved: qty })
          .eq('id', line.id)
        if (lineErr) throw lineErr
      }

      const { error } = await db
        .from('solicitudes')
        .update({
          status: 'aprobada',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error
      toast.success('Solicitud aprobada')
      invalidate()
    } catch {
      toast.error('Error al aprobar la solicitud')
    } finally {
      setIsWorking(false)
    }
  }

  // ── Reject ───────────────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!rejectNotes.trim()) {
      toast.error('Ingresa el motivo de rechazo')
      return
    }
    setIsWorking(true)
    try {
      const { error } = await db
        .from('solicitudes')
        .update({
          status: 'rechazada',
          reviewed_by: profile?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: rejectNotes.trim(),
        })
        .eq('id', id)
      if (error) throw error
      toast.success('Solicitud rechazada')
      invalidate()
    } catch {
      toast.error('Error al rechazar la solicitud')
    } finally {
      setIsWorking(false)
    }
  }

  // ── Mark delivered ───────────────────────────────────────────────────────────

  const handleDeliver = async () => {
    setIsWorking(true)
    try {
      const { error } = await db
        .from('solicitudes')
        .update({
          status: 'entregada',
          delivered_at: new Date().toISOString(),
          delivered_by: profile?.id,
        })
        .eq('id', id)
      if (error) throw error
      toast.success('Solicitud marcada como entregada')
      invalidate()
    } catch {
      toast.error('Error al marcar como entregada')
    } finally {
      setIsWorking(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">Solicitud no encontrada.</p>
      </div>
    )
  }

  const destLabel = solicitud.destination_type
    ? DESTINATION_TYPE_LABELS[solicitud.destination_type] ?? solicitud.destination_type
    : 'Sin destino'

  let destDetail = ''
  if (solicitud.crop_lot) destDetail = `${solicitud.crop_lot.name} (${solicitud.crop_lot.code})`
  else if (solicitud.equipment) destDetail = `${solicitud.equipment.name} (${solicitud.equipment.code})`
  else if (solicitud.employee) destDetail = solicitud.employee.full_name

  const canApproveReject = solicitud.status === 'pendiente'
  const canDeliver = solicitud.status === 'aprobada'

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={`Solicitud · ${destLabel}`}
        description={`Solicitante: ${solicitud.requester?.full_name ?? '—'} · ${formatFecha(solicitud.created_at)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/solicitudes`)}>
            <ArrowLeft className="mr-1.5 size-4" />
            Volver
          </Button>
        }
      />

      {/* Status + Urgency */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={cn('text-sm', solicitudStatusColors[solicitud.status])}>
          {SOLICITUD_STATUS_LABELS[solicitud.status]}
        </Badge>
        <Badge variant="outline" className={cn('text-sm', solicitudUrgencyColors[solicitud.urgency])}>
          {SOLICITUD_URGENCY_LABELS[solicitud.urgency]}
        </Badge>
      </div>

      {/* Requester + Destination */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <User className="size-4 text-muted-foreground" />
              Solicitante
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{solicitud.requester?.full_name ?? '—'}</p>
            {solicitud.notes && (
              <p className="mt-1 text-xs text-muted-foreground">{solicitud.notes}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-muted-foreground" />
              Destino
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{destLabel}</p>
            {destDetail && <p className="text-xs text-muted-foreground">{destDetail}</p>}
            {solicitud.destination_notes && (
              <p className="mt-1 text-xs text-muted-foreground">{solicitud.destination_notes}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lines table with editable approved qty */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Package className="size-4 text-muted-foreground" />
            Artículos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead className="text-right">Cant. solicitada</TableHead>
                <TableHead className="text-right">Cant. aprobada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(solicitud.lines ?? []).map((line: SolicitudLine & { item?: { name: string; sku: string; unit?: { code: string } } }) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{line.item?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{line.item?.sku}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(line.quantity_requested)}{' '}
                    <span className="text-xs text-muted-foreground">{line.item?.unit?.code}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canApproveReject ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={String(line.quantity_requested)}
                        value={approvedQtys[line.id] ?? ''}
                        onChange={(e) =>
                          setApprovedQtys((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                        className="ml-auto h-8 w-24 text-right"
                      />
                    ) : line.quantity_approved != null ? (
                      formatQuantity(line.quantity_approved)
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review notes for reject */}
      {canApproveReject && (
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-medium">Notas de revisión</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Requerido al rechazar
              </Label>
              <Textarea
                placeholder="Motivo de rechazo o comentarios…"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {canApproveReject && (
          <>
            <Button
              onClick={handleApprove}
              disabled={isWorking}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <CheckCircle className="mr-1.5 size-4" />
              Aprobar
            </Button>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" disabled={isWorking}>
                    <XCircle className="mr-1.5 size-4" />
                    Rechazar
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Rechazar esta solicitud?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {rejectNotes.trim()
                      ? `Motivo: "${rejectNotes}"`
                      : 'Ingresa un motivo de rechazo antes de continuar.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  {rejectNotes.trim() && (
                    <AlertDialogAction
                      onClick={handleReject}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sí, rechazar
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {canDeliver && (
          <Button onClick={handleDeliver} disabled={isWorking}>
            <PackageCheck className="mr-1.5 size-4" />
            Marcar como entregada
          </Button>
        )}
      </div>

      {/* Previous review info */}
      {(solicitud.status === 'aprobada' || solicitud.status === 'rechazada' || solicitud.status === 'entregada') &&
        solicitud.reviewed_at && (
          <>
            <Separator />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Revisado el</dt>
              <dd>{formatFecha(solicitud.reviewed_at)}</dd>
              {solicitud.review_notes && (
                <>
                  <dt className="text-muted-foreground">Notas</dt>
                  <dd>{solicitud.review_notes}</dd>
                </>
              )}
              {solicitud.delivered_at && (
                <>
                  <dt className="text-muted-foreground">Entregado el</dt>
                  <dd>{formatFecha(solicitud.delivered_at)}</dd>
                </>
              )}
            </dl>
          </>
        )}
    </div>
  )
}

export default SolicitudReviewPage
