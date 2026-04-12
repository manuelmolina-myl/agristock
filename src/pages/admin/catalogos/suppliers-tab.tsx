import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useSuppliers, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
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

interface Supplier {
  id: string
  name: string
  rfc?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  default_currency: 'MXN' | 'USD'
}

const schema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  rfc: z.string().max(13).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email('Email inválido').nullable().optional().or(z.literal('')),
  default_currency: z.enum(['MXN', 'USD']),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Supplier>()

export function SuppliersTab() {
  const { data = [], isLoading } = useSuppliers()
  const create = useCreate<Supplier>('suppliers')
  const update = useUpdate<Supplier>('suppliers')
  const softDelete = useSoftDelete('suppliers')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      rfc: null,
      contact_name: null,
      phone: null,
      email: null,
      default_currency: 'MXN',
    },
  })

  const openCreate = () => {
    form.reset({
      name: '',
      rfc: null,
      contact_name: null,
      phone: null,
      email: null,
      default_currency: 'MXN',
    })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Supplier) => {
    form.reset({
      name: row.name,
      rfc: row.rfc ?? null,
      contact_name: row.contact_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      default_currency: row.default_currency,
    })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Supplier) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      email: values.email === '' ? null : values.email,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values: payload })
        toast.success('Proveedor actualizado')
      } else {
        await create.mutateAsync(payload)
        toast.success('Proveedor creado')
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
      toast.success('Proveedor eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el proveedor.')
    }
  }

  const columns = [
    helper.accessor('name', { header: 'Nombre', enableSorting: true }),
    helper.accessor('rfc', {
      header: 'RFC',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
    }),
    helper.accessor('contact_name', {
      header: 'Contacto',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
    }),
    helper.accessor('phone', {
      header: 'Teléfono',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
    }),
    helper.accessor('email', {
      header: 'Email',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
    }),
    helper.accessor('default_currency', {
      header: 'Moneda',
      cell: (info) => (
        <Badge variant={info.getValue() === 'USD' ? 'default' : 'secondary'} className="text-xs font-normal">
          {info.getValue()}
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
          Nuevo proveedor
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Supplier>[]}
        data={data as Supplier[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar proveedores..."
        emptyMessage="No hay proveedores registrados."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-name">Nombre *</Label>
            <Input id="sup-name" {...form.register('name')} placeholder="Ej. Agroquímicos del Norte" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="sup-rfc">RFC</Label>
              <Input id="sup-rfc" {...form.register('rfc')} placeholder="Ej. XAXX010101000" />
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <Label htmlFor="sup-currency">Moneda</Label>
              <Select
                value={form.watch('default_currency')}
                onValueChange={(v) => form.setValue('default_currency', v as 'MXN' | 'USD')}
              >
                <SelectTrigger id="sup-currency" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-contact">Nombre de contacto</Label>
            <Input id="sup-contact" {...form.register('contact_name')} placeholder="Ej. Juan Pérez" />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="sup-phone">Teléfono</Label>
              <Input id="sup-phone" {...form.register('phone')} placeholder="Ej. 664-123-4567" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" type="email" {...form.register('email')} placeholder="contacto@proveedor.mx" />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar proveedor "${deleting?.name}"?`}
        description="Se eliminará este proveedor. Las entradas asociadas no se verán afectadas."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
