import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useEmployees, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
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

interface Employee {
  id: string
  employee_code: string
  full_name: string
  role_field?: string | null
  is_active: boolean
}

const schema = z.object({
  employee_code: z.string().min(1, 'El código es requerido').max(30),
  full_name: z.string().min(1, 'El nombre es requerido').max(200),
  role_field: z.string().max(100).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Employee>()

export function EmployeesTab() {
  const { data = [], isLoading } = useEmployees()
  const create = useCreate<Employee>('employees')
  const update = useUpdate<Employee>('employees')
  const softDelete = useSoftDelete('employees')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { employee_code: '', full_name: '', role_field: null },
  })

  const openCreate = () => {
    form.reset({ employee_code: '', full_name: '', role_field: null })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Employee) => {
    form.reset({
      employee_code: row.employee_code,
      full_name: row.full_name,
      role_field: row.role_field ?? null,
    })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Employee) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Empleado actualizado')
      } else {
        await create.mutateAsync(values)
        toast.success('Empleado creado')
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
      toast.success('Empleado eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el empleado.')
    }
  }

  const columns = [
    helper.accessor('employee_code', { header: 'Núm. empleado', enableSorting: true }),
    helper.accessor('full_name', { header: 'Nombre completo', enableSorting: true }),
    helper.accessor('role_field', {
      header: 'Rol / Puesto',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
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
          Nuevo empleado
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Employee>[]}
        data={data as Employee[]}
        isLoading={isLoading}
        searchKey="full_name"
        searchPlaceholder="Buscar empleados..."
        emptyMessage="No hay empleados registrados."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar empleado' : 'Nuevo empleado'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-36">
              <Label htmlFor="emp-code">Núm. empleado *</Label>
              <Input id="emp-code" {...form.register('employee_code')} placeholder="Ej. EMP-001" />
              {form.formState.errors.employee_code && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.employee_code.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="emp-name">Nombre completo *</Label>
              <Input id="emp-name" {...form.register('full_name')} placeholder="Ej. María López" />
              {form.formState.errors.full_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.full_name.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emp-role">Rol / Puesto</Label>
            <Input id="emp-role" {...form.register('role_field')} placeholder="Ej. Operador de campo" />
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar empleado "${deleting?.full_name}"?`}
        description="Se eliminará este registro de empleado."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
