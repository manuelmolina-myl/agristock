import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useCropLots, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { DataTable, createColumnHelper } from '@/components/shared/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { CrudDialog } from '@/components/shared/crud-dialog'
import { DeleteDialog } from '@/components/shared/delete-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CropLot } from '@/lib/database.types'

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

// ─── Column helper ────────────────────────────────────────────────────────────

const helper = createColumnHelper<CropLot>()

// ─── Component ────────────────────────────────────────────────────────────────

export function LotsTab() {
  const { activeSeason } = useAuth()
  const { data = [], isLoading } = useCropLots()
  const create = useCreate<CropLot>('crops_lots')
  const update = useUpdate<CropLot>('crops_lots')
  const softDelete = useSoftDelete('crops_lots')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<CropLot | null>(null)
  const [deleting, setDeleting] = useState<CropLot | null>(null)

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

  const openEdit = (row: CropLot) => {
    form.reset({
      name: row.name,
      code: row.code,
      crop_type: row.crop_type,
      hectares: row.hectares,
      planting_date: row.planting_date ?? null,
      expected_harvest_date: row.expected_harvest_date ?? null,
      status: row.status,
      color: row.color ?? null,
    })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: CropLot) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
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
  })

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await softDelete.mutateAsync(deleting.id)
      toast.success('Lote eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el lote.')
    }
  }

  const columns = [
    helper.accessor('code', { header: 'Código', enableSorting: true }),
    helper.accessor('name', { header: 'Nombre', enableSorting: true }),
    helper.accessor('crop_type', { header: 'Cultivo', enableSorting: true }),
    helper.accessor('hectares', {
      header: 'Hectáreas',
      cell: (info) => <span className="tabular-nums">{info.getValue()} ha</span>,
      enableSorting: true,
    }),
    helper.accessor('status', {
      header: 'Estado',
      cell: (info) => (
        <Badge
          variant={STATUS_VARIANT[info.getValue()] ?? 'secondary'}
          className="text-xs font-normal"
        >
          {STATUS_LABEL[info.getValue()] ?? info.getValue()}
        </Badge>
      ),
      enableSorting: true,
    }),
    helper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row.original)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => openDelete(row.original)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    }),
  ]

  const isSubmitting = create.isPending || update.isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo lote
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<CropLot>[]}
        data={data as CropLot[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar lotes..."
        emptyMessage="No hay lotes registrados."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar lote' : 'Nuevo lote'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lot-name">Nombre *</Label>
            <Input id="lot-name" {...form.register('name')} placeholder="Lote 1 — Tomate Saladette" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="lot-code">Código *</Label>
              <Input id="lot-code" {...form.register('code')} placeholder="L-01" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lot-crop_type">Cultivo *</Label>
              <Input id="lot-crop_type" {...form.register('crop_type')} placeholder="Tomate" />
              {form.formState.errors.crop_type && (
                <p className="text-xs text-destructive">{form.formState.errors.crop_type.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="lot-hectares">Hectáreas</Label>
              <Input id="lot-hectares" type="number" step="0.1" {...form.register('hectares')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lot-status">Estado</Label>
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
              <Label htmlFor="lot-planting_date">Fecha de siembra</Label>
              <Input id="lot-planting_date" type="date" {...form.register('planting_date')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lot-color">Color</Label>
              <Input
                id="lot-color"
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
        title={`¿Eliminar lote "${deleting?.name}"?`}
        description="Se eliminará este lote. Los registros asociados podrían verse afectados."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
