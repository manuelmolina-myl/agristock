import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useUnits, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import { DataTable, createColumnHelper } from '@/components/shared/data-table'
import type { ColumnDef } from '@tanstack/react-table'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Unit {
  id: string
  code: string
  name: string
  type: 'mass' | 'volume' | 'count' | 'length'
}

const UNIT_TYPES = [
  { value: 'mass', label: 'Masa' },
  { value: 'volume', label: 'Volumen' },
  { value: 'count', label: 'Conteo' },
  { value: 'length', label: 'Longitud' },
] as const

const TYPE_LABELS: Record<string, string> = {
  mass: 'Masa',
  volume: 'Volumen',
  count: 'Conteo',
  length: 'Longitud',
}

const schema = z.object({
  code: z.string().min(1, 'El código es requerido').max(10),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  type: z.enum(['mass', 'volume', 'count', 'length']),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Unit>()

export function UnitsTab() {
  const { data = [], isLoading } = useUnits()
  const create = useCreate<Unit>('units')
  const update = useUpdate<Unit>('units')
  const softDelete = useSoftDelete('units')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [deleting, setDeleting] = useState<Unit | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', type: 'count' },
  })

  const openCreate = () => {
    form.reset({ code: '', name: '', type: 'count' })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Unit) => {
    form.reset({ code: row.code, name: row.name, type: row.type })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Unit) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Unidad actualizada')
      } else {
        await create.mutateAsync(values)
        toast.success('Unidad creada')
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
      toast.success('Unidad eliminada')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar la unidad.')
    }
  }

  const columns = [
    helper.accessor('code', { header: 'Código', enableSorting: true }),
    helper.accessor('name', { header: 'Nombre', enableSorting: true }),
    helper.accessor('type', {
      header: 'Tipo',
      cell: (info) => (
        <Badge variant="secondary" className="text-xs font-normal">
          {TYPE_LABELS[info.getValue()] ?? info.getValue()}
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
          Nueva unidad
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Unit>[]}
        data={data as Unit[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar unidades..."
        emptyMessage="No hay unidades registradas."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar unidad' : 'Nueva unidad'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-28">
              <Label htmlFor="code">Código *</Label>
              <Input id="code" {...form.register('code')} placeholder="Ej. KG" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" {...form.register('name')} placeholder="Ej. Kilogramo" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipo *</Label>
            <Select
              value={form.watch('type')}
              onValueChange={(v) => form.setValue('type', v as FormValues['type'])}
            >
              <SelectTrigger id="type" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.type && (
              <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
            )}
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar unidad "${deleting?.name}"?`}
        description="Se eliminará esta unidad. Los artículos que la usen podrían verse afectados."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
