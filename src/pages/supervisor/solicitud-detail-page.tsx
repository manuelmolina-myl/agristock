import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, User, MapPin, Package } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
import { supabase } from '@/lib/supabase'
import { formatFecha, formatFechaCorta, formatQuantity, cn } from '@/lib/utils'
import {
  SOLICITUD_STATUS_LABELS,
  SOLICITUD_URGENCY_LABELS,
  DESTINATION_TYPE_LABELS,
} from '@/lib/constants'
import type { Solicitud, SolicitudStatus, SolicitudUrgency } from '@/lib/database.types'

import { PageHeader } from '@/components/custom/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<SolicitudStatus, string> = {
  pendiente: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
  aprobada:  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
  rechazada: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
  entregada: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
}

const URGENCY_CLASSES: Record<SolicitudUrgency, string> = {
  baja:    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  normal:  'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
  alta:    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400',
  urgente: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SupervisorSolicitudDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

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

  const handleCancel = async () => {
    try {
      const { error } = await db
        .from('solicitudes')
        .update({ status: 'rechazada', review_notes: 'Cancelada por el solicitante', reviewed_at: new Date().toISOString(), reviewed_by: profile?.id })
        .eq('id', id)
      if (error) throw error
      toast.success('Solicitud cancelada')
      queryClient.invalidateQueries({ queryKey: ['solicitud', id] })
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
    } catch {
      toast.error('Error al cancelar la solicitud')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">Solicitud no encontrada.</p>
        <Button variant="ghost" onClick={() => navigate(`${basePath}/solicitudes`)}>
          <ArrowLeft className="mr-1.5 size-4" />
          Volver
        </Button>
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={`Solicitud · ${destLabel}`}
        description={`Creada el ${formatFecha(solicitud.created_at)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/solicitudes`)}>
            <ArrowLeft className="mr-1.5 size-4" />
            Volver
          </Button>
        }
      />

      {/* Status + Urgency */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={cn('text-sm', STATUS_CLASSES[solicitud.status])}>
          {SOLICITUD_STATUS_LABELS[solicitud.status]}
        </Badge>
        <Badge variant="outline" className={cn('text-sm', URGENCY_CLASSES[solicitud.urgency])}>
          Urgencia: {SOLICITUD_URGENCY_LABELS[solicitud.urgency]}
        </Badge>
      </div>

      {/* Destination info */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="size-4 text-muted-foreground" />
            Destino
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="font-medium">{destLabel}</dd>
            {destDetail && (
              <>
                <dt className="text-muted-foreground">Detalle</dt>
                <dd className="font-medium">{destDetail}</dd>
              </>
            )}
            {solicitud.destination_notes && (
              <>
                <dt className="text-muted-foreground">Notas</dt>
                <dd>{solicitud.destination_notes}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Lines table */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Package className="size-4 text-muted-foreground" />
            Artículos solicitados
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
              {(solicitud.lines ?? []).map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{line.item?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{line.item?.sku}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(line.quantity_requested)}{' '}
                    <span className="text-xs text-muted-foreground">
                      {(line.item as (typeof line.item & { unit?: { code: string } }))?.unit?.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {line.quantity_approved != null ? formatQuantity(line.quantity_approved) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review info */}
      {(solicitud.status === 'aprobada' || solicitud.status === 'rechazada') && (
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <User className="size-4 text-muted-foreground" />
              Revisión
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {solicitud.reviewed_at && (
                <>
                  <dt className="text-muted-foreground">Fecha de revisión</dt>
                  <dd>{formatFechaCorta(solicitud.reviewed_at)}</dd>
                </>
              )}
              {solicitud.review_notes && (
                <>
                  <dt className="text-muted-foreground">Notas del revisor</dt>
                  <dd>{solicitud.review_notes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Delivery info */}
      {solicitud.status === 'entregada' && solicitud.delivered_at && (
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-medium">Entrega</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Entregado el</dt>
              <dd>{formatFecha(solicitud.delivered_at)}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Cancel action */}
      {solicitud.status === 'pendiente' && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  <AlertTriangle className="mr-1.5 size-4" />
                  Cancelar solicitud
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cancelar esta solicitud?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. La solicitud pasará a estado "Rechazada".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Volver</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Sí, cancelar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

export default SupervisorSolicitudDetailPage
