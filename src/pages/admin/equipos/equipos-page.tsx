import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Truck, Wrench, Car, Droplets, Settings2, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { useEquipment, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import type { Equipment, EquipmentType } from '@/lib/database.types'
import { formatQuantity } from '@/lib/utils'

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

const equipmentSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  code: z.string().min(1, 'Código requerido').max(30),
  type: z.string().default('tractor'),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  year: z.preprocess(
    (v) => (v === '' || v === null ? null : Number(v)),
    z.number().nullable().optional()
  ),
  plate: z.string().optional().nullable(),
  current_hours: z.preprocess(
    (v) => (v === '' || v === null ? null : Number(v)),
    z.number().nullable().optional()
  ),
  current_km: z.preprocess(
    (v) => (v === '' || v === null ? null : Number(v)),
    z.number().nullable().optional()
  ),
})

type EquipmentForm = z.infer<typeof equipmentSchema>

// ─── Equipment type config ────────────────────────────────────────────────────

const EQUIPMENT_TYPES = [
  { value: 'tractor', label: 'Tractor' },
  { value: 'implement', label: 'Implemento' },
  { value: 'vehicle', label: 'Vehículo' },
  { value: 'pump', label: 'Bomba' },
  { value: 'other', label: 'Otro' },
]

const EQUIP_TYPE_LABEL: Record<EquipmentType | 'other', string> = {
  tractor: 'Tractor',
  implement: 'Implemento',
  vehicle: 'Vehículo',
  pump: 'Bomba',
  other: 'Otro',
}

const EQUIP_TYPE_ICON: Record<EquipmentType | 'other', React.ReactNode> = {
  tractor: <Truck className="size-3.5" />,
  implement: <Wrench className="size-3.5" />,
  vehicle: <Car className="size-3.5" />,
  pump: <Droplets className="size-3.5" />,
  other: <Settings2 className="size-3.5" />,
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-4 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-28" />
      <div className="flex items-center gap-4 pt-1 border-t">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  )
}

// ─── Equipment card ───────────────────────────────────────────────────────────

function EquipoCard({
  equipo,
  onClick,
  onEdit,
  onDelete,
}: {
  equipo: Equipment
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const type = (equipo.type ?? 'other') as EquipmentType
  const icon = EQUIP_TYPE_ICON[type] ?? EQUIP_TYPE_ICON.other
  const label = EQUIP_TYPE_LABEL[type] ?? equipo.type

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md group relative"
      onClick={onClick}
    >
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
        {/* Code + Name + type badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              {equipo.code}
            </span>
            <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {equipo.name}
            </span>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] h-4 px-1.5 gap-1">
            {icon}
            {label}
          </Badge>
        </div>

        {/* Brand + model */}
        <div className="text-xs text-muted-foreground">
          {[equipo.brand, equipo.model].filter(Boolean).join(' · ') || '—'}
          {equipo.year ? ` (${equipo.year})` : ''}
        </div>

        {/* Hours / km */}
        <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          {equipo.current_hours != null && (
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {formatQuantity(equipo.current_hours, 0)}
              </span>{' '}
              h
            </span>
          )}
          {equipo.current_km != null && (
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {formatQuantity(equipo.current_km, 0)}
              </span>{' '}
              km
            </span>
          )}
          {equipo.current_hours == null && equipo.current_km == null && (
            <span>Sin horómetro</span>
          )}
        </div>

        {/* Diesel this month (placeholder) */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Droplets className="size-3 shrink-0" />
          <span>Diésel este mes: </span>
          <span className="font-mono font-medium text-foreground">— L</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EquiposPage() {
  const navigate = useNavigate()
  const { data: equipos = [], isLoading } = useEquipment()

  const create = useCreate<Equipment>('equipment')
  const update = useUpdate<Equipment>('equipment')
  const remove = useSoftDelete('equipment')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const form = useForm<EquipmentForm>({
    resolver: zodResolver(equipmentSchema) as any,
    defaultValues: {
      name: '',
      code: '',
      type: 'tractor',
      brand: null,
      model: null,
      year: null,
      plate: null,
      current_hours: null,
      current_km: null,
    },
  })

  const openCreate = () => {
    form.reset({
      name: '',
      code: '',
      type: 'tractor',
      brand: null,
      model: null,
      year: null,
      plate: null,
      current_hours: null,
      current_km: null,
    })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (equipo: Equipment) => {
    form.reset({
      name: equipo.name,
      code: equipo.code,
      type: equipo.type ?? 'tractor',
      brand: equipo.brand ?? null,
      model: equipo.model ?? null,
      year: equipo.year ?? null,
      plate: equipo.plate ?? null,
      current_hours: equipo.current_hours ?? null,
      current_km: equipo.current_km ?? null,
    })
    setEditing(equipo)
    setDialogOpen(true)
  }

  const openDelete = (id: string) => {
    setDeleting(id)
    setDeleteOpen(true)
  }

  const handleSubmit = async (values: EquipmentForm) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values: values as any })
        toast.success('Equipo actualizado')
      } else {
        await create.mutateAsync(values as any)
        toast.success('Equipo creado')
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
      toast.success('Equipo eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el equipo.')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Equipos y Tractores"
        description="Maquinaria agrícola y vehículos"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            Nuevo equipo
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : equipos.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-5" />}
          title="Sin equipos registrados"
          description="Los equipos y tractores aparecerán aquí cuando los configures en el catálogo."
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {equipos.map((eq) => (
            <EquipoCard
              key={eq.id}
              equipo={eq as Equipment}
              onClick={() => navigate(`/admin/equipos/${eq.id}`)}
              onEdit={() => openEdit(eq as Equipment)}
              onDelete={() => openDelete(eq.id)}
            />
          ))}
        </div>
      )}

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar equipo' : 'Nuevo equipo'}
        onSubmit={form.handleSubmit(handleSubmit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="eq-name">Nombre</Label>
            <Input id="eq-name" {...form.register('name')} placeholder="Tractor New Holland T4" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-code">Código</Label>
              <Input id="eq-code" {...form.register('code')} placeholder="EQ-01" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-type">Tipo</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(v) => v && form.setValue('type', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-brand">Marca</Label>
              <Input id="eq-brand" {...form.register('brand')} placeholder="New Holland" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-model">Modelo</Label>
              <Input id="eq-model" {...form.register('model')} placeholder="T4.75" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-year">Año</Label>
              <Input id="eq-year" type="number" {...form.register('year')} placeholder="2022" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-plate">Placa</Label>
              <Input id="eq-plate" {...form.register('plate')} placeholder="ABC-1234" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-hours">Horómetro actual</Label>
              <Input
                id="eq-hours"
                type="number"
                step="0.1"
                {...form.register('current_hours')}
                placeholder="0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-km">Km actuales</Label>
              <Input
                id="eq-km"
                type="number"
                {...form.register('current_km')}
                placeholder="0"
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
        title="Eliminar equipo"
        description="¿Estás seguro de eliminar este equipo? Esta acción no se puede deshacer."
      />
    </div>
  )
}

export default EquiposPage
