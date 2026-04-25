import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useCategories, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
import { DataTable } from '@/components/shared/data-table'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { CrudDialog } from '@/components/shared/crud-dialog'
import { DeleteDialog } from '@/components/shared/delete-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface Category {
  id: string
  name: string
  parent_id?: string | null
  icon?: string | null
  color?: string | null
  prefix?: string | null
  parent?: { name: string } | null
}

const schema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  prefix: z.string().max(10).nullable().optional().transform((v) => v?.toUpperCase() || null),
  parent_id: z.string().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Category>()

export function CategoriesTab() {
  const { data = [], isLoading } = useCategories()
  const create = useCreate<Category>('categories')
  const update = useUpdate<Category>('categories')
  const softDelete = useSoftDelete('categories')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { name: '', prefix: null, parent_id: null, icon: null, color: null },
  })

  const openCreate = () => {
    form.reset({ name: '', prefix: null, parent_id: null, icon: null, color: null })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Category) => {
    form.reset({
      name: row.name,
      prefix: row.prefix ?? null,
      parent_id: row.parent_id ?? null,
      icon: row.icon ?? null,
      color: row.color ?? null,
    })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Category) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Categoría actualizada')
      } else {
        await create.mutateAsync(values)
        toast.success('Categoría creada')
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
      toast.success('Categoría eliminada')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar la categoría.')
    }
  }

  const columns = [
    helper.accessor('name', { header: 'Nombre', enableSorting: true, meta: { truncate: true } }),
    helper.accessor('prefix', {
      header: 'Prefijo',
      cell: (info) => info.getValue() ? (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>
      ) : '—',
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor((row) => row.parent?.name ?? '—', {
      id: 'parent',
      header: 'Categoría padre',
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor('icon', {
      header: 'Ícono',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor('color', {
      header: 'Color',
      cell: (info) => {
        const color = info.getValue()
        if (!color) return '—'
        return (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border border-border"
              style={{ backgroundColor: color }}
            />
            {color}
          </div>
        )
      },
      enableSorting: false,
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
  const parentOptions = (data as Category[]).filter((c) => !editing || c.id !== editing.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nueva categoría
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Category>[]}
        data={data as Category[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar categorías..."
        emptyMessage="No hay categorías registradas."
        tableFixed
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" {...form.register('name')} placeholder="Ej. Fertilizantes" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <Label htmlFor="prefix">Prefijo SKU</Label>
              <Input
                id="prefix"
                {...form.register('prefix')}
                placeholder="Ej. AQ"
                className="font-mono uppercase"
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase()
                  form.register('prefix').onChange(e)
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="parent_id">Categoría padre</Label>
            <Select
              value={form.watch('parent_id') ?? '__none__'}
              onValueChange={(v) => form.setValue('parent_id', v === '__none__' ? null : v)}
            >
              <SelectTrigger id="parent_id" className="h-8 text-sm">
                <SelectValue placeholder="Sin categoría padre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin categoría padre</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="icon">Ícono</Label>
              <Input id="icon" {...form.register('icon')} placeholder="Ej. leaf" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="color">Color</Label>
              <Input id="color" {...form.register('color')} placeholder="Ej. #22c55e" />
            </div>
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar categoría "${deleting?.name}"?`}
        description="Se eliminará esta categoría. Los artículos asociados perderán su categoría."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
