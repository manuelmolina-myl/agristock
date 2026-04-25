import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useWarehouses, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import { DataTable } from '@/components/shared/data-table'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { CrudDialog } from '@/components/shared/crud-dialog'
import { DeleteDialog } from '@/components/shared/delete-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Warehouse {
  id: string
  code: string
  name: string
  address?: string | null
  is_active: boolean
}

const schema = z.object({
  code: z.string().min(1, 'El código es requerido').max(20),
  name: z.string().min(1, 'El nombre es requerido').max(200),
  address: z.string().max(500).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Warehouse>()

export function WarehousesTab() {
  const { data = [], isLoading } = useWarehouses()
  const create = useCreate<Warehouse>('warehouses')
  const update = useUpdate<Warehouse>('warehouses')
  const softDelete = useSoftDelete('warehouses')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [deleting, setDeleting] = useState<Warehouse | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', address: null },
  })

  const openCreate = () => {
    form.reset({ code: '', name: '', address: null })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Warehouse) => {
    form.reset({ code: row.code, name: row.name, address: row.address ?? null })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Warehouse) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Almacén actualizado')
      } else {
        await create.mutateAsync(values)
        toast.success('Almacén creado')
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
      toast.success('Almacén eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el almacén.')
    }
  }

  const columns = [
    helper.accessor('code', { header: 'Código', enableSorting: true }),
    helper.accessor('name', { header: 'Nombre', enableSorting: true, meta: { truncate: true } }),
    helper.accessor('address', {
      header: 'Dirección',
      cell: (info) => (
        <span className="truncate max-w-xs block">{info.getValue() ?? '—'}</span>
      ),
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor('is_active', {
      header: 'Estado',
      cell: (info) => (
        <Badge
          variant={info.getValue() ? 'default' : 'secondary'}
          className="text-xs font-normal"
        >
          {info.getValue() ? 'Activo' : 'Inactivo'}
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
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
            >
              <MoreHorizontal className="h-4 w-4" />
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
          Nuevo almacén
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Warehouse>[]}
        data={data as Warehouse[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar almacenes..."
        tableFixed
        emptyMessage="No hay almacenes registrados."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar almacén' : 'Nuevo almacén'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-32">
              <Label htmlFor="wh-code">Código *</Label>
              <Input id="wh-code" {...form.register('code')} placeholder="Ej. ALM-01" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="wh-name">Nombre *</Label>
              <Input id="wh-name" {...form.register('name')} placeholder="Ej. Bodega principal" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wh-address">Dirección</Label>
            <Input id="wh-address" {...form.register('address')} placeholder="Ej. Km 12 carretera Tecate" />
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar almacén "${deleting?.name}"?`}
        description="Se eliminará este almacén. El inventario asociado podría verse afectado."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
