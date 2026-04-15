import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBasePath, useCanSeePrices } from '@/hooks/use-base-path'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Layers, MapPin, Leaf, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { useCropLots, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import type { CropLot } from '@/lib/database.types'
import { formatMoney } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { CrudDialog } from '@/components/shared/crud-dialog'
import { DeleteDialog } from '@/components/shared/delete-dialog'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

// ─── Schema ───────────────────────────────────────────────────────────────────

const lotSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  code: z.string().min(1, 'Código requerido').max(30),
  crop_type: z.string().min(1, 'Tipo de cultivo requerido'),
  hectares: z.preprocess((v) => (v === '' || v === null ? 0 : Number(v)), z.number().min(0)),
  planting_date: z.string().optional().nullable(),
  expected_harvest_date: z.string().optional().nullable(),
  status: z.string().default('active'),
  color: z.string().optional().nullable(),
})

type LotForm = z.infer<typeof lotSchema>

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  planning: 'Planeación',
  harvested: 'Cosechado',
  closed: 'Cerrado',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  planning: 'secondary',
  harvested: 'outline',
  closed: 'secondary',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={STATUS_VARIANT[status] ?? 'secondary'}
      className="text-[10px] h-4 px-1.5"
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="h-1.5 w-full" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-20 rounded-full" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center justify-between pt-1 border-t">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({
  lot,
  onClick,
  onEdit,
  onDelete,
  canSeePrices,
}: {
  lot: CropLot
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  canSeePrices: boolean
}) {
  const stripeColor = lot.color ?? '#94a3b8'

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md group relative"
      onClick={onClick}
    >
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ backgroundColor: stripeColor }} />

      {/* Actions menu */}
      <div
        className="absolute top-3 right-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="p-4 flex flex-col gap-3">
        {/* Code + Name */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            {lot.code}
          </span>
          <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {lot.name}
          </span>
        </div>

        {/* Crop type badge */}
        <Badge variant="outline" className="w-fit text-[10px] h-4 px-1.5 gap-1">
          <Leaf className="size-2.5" />
          {lot.crop_type}
        </Badge>

        {/* Hectares */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span>{lot.hectares} ha</span>
        </div>

        {/* Total cost + status */}
        <div className="flex items-center justify-between pt-2 border-t">
          {canSeePrices ? (
            <div className="flex flex-col gap-0">
              <span className="text-[10px] text-muted-foreground">Total consumido</span>
              <span className="text-xs font-mono font-medium tabular-nums">
                {formatMoney(0, 'MXN')}
              </span>
            </div>
          ) : (
            <span />
          )}
          <StatusBadge status={lot.status} />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LotesPage() {
  const navigate = useNavigate()
  const basePath = useBasePath()
  const canSeePrices = useCanSeePrices()
  const { activeSeason } = useAuth()
  const { data: _lots = [], isLoading } = useCropLots()
  const lots = _lots as CropLot[]

  const create = useCreate<CropLot>('crops_lots')
  const update = useUpdate<CropLot>('crops_lots')
  const remove = useSoftDelete('crops_lots')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<CropLot | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const form = useForm<LotForm>({
    resolver: zodResolver(lotSchema) as any,
    defaultValues: {
      name: '',
      code: '',
      crop_type: '',
      hectares: 0,
      planting_date: null,
      expected_harvest_date: null,
      status: 'active',
      color: null,
    },
  })

  const openCreate = () => {
    form.reset({
      name: '',
      code: '',
      crop_type: '',
      hectares: 0,
      planting_date: null,
      expected_harvest_date: null,
      status: 'active',
      color: null,
    })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (lot: CropLot) => {
    form.reset({
      name: lot.name,
      code: lot.code,
      crop_type: lot.crop_type,
      hectares: lot.hectares,
      planting_date: lot.planting_date ?? null,
      expected_harvest_date: lot.expected_harvest_date ?? null,
      status: lot.status,
      color: lot.color ?? null,
    })
    setEditing(lot)
    setDialogOpen(true)
  }

  const openDelete = (id: string) => {
    setDeleting(id)
    setDeleteOpen(true)
  }

  const handleSubmit = async (values: LotForm) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Lote actualizado')
      } else {
        await create.mutateAsync({ ...values, season_id: activeSeason?.id } as any)
        toast.success('Lote creado')
      }
      setDialogOpen(false)
    } catch {
      toast.error('Ocurrió un error. Intenta de nuevo.')
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting)
      toast.success('Lote eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el lote.')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Lotes de Cultivo"
        description="Centros de costo por lote"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            Nuevo lote
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : lots.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="Sin lotes registrados"
          description="Los lotes de cultivo aparecerán aquí cuando los configures en el catálogo."
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              onClick={() => navigate(`${basePath}/lotes/${lot.id}`)}
              onEdit={() => openEdit(lot)}
              onDelete={() => openDelete(lot.id)}
              canSeePrices={canSeePrices}
            />
          ))}
        </div>
      )}

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar lote' : 'Nuevo lote'}
        onSubmit={form.handleSubmit(handleSubmit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...form.register('name')} placeholder="Lote 1 — Tomate Saladette" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="code">Código</Label>
              <Input id="code" {...form.register('code')} placeholder="L-01" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="crop_type">Cultivo</Label>
              <Input id="crop_type" {...form.register('crop_type')} placeholder="Tomate" />
              {form.formState.errors.crop_type && (
                <p className="text-xs text-destructive">{form.formState.errors.crop_type.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="hectares">Hectáreas</Label>
              <Input id="hectares" type="number" step="0.1" {...form.register('hectares')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => v && form.setValue('status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planeación</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="harvested">Cosechado</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="planting_date">Fecha de siembra</Label>
              <Input id="planting_date" type="date" {...form.register('planting_date')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                type="color"
                {...form.register('color')}
                className="h-9 p-1"
              />
            </div>
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        isDeleting={remove.isPending}
        title="Eliminar lote"
        description="¿Estás seguro de eliminar este lote? Esta acción no se puede deshacer."
      />
    </div>
  )
}

export default LotesPage
