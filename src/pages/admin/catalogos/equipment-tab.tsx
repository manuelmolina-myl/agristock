import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react'
import { useEquipment, useCreate, useUpdate, useSoftDelete } from '@/hooks/use-supabase-query'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Equipment {
  id: string
  code: string
  name: string
  type?: string | null
  brand?: string | null
  model?: string | null
  current_hours?: number | null
}

const EQUIPMENT_TYPES = [
  { value: 'tractor', label: 'Tractor' },
  { value: 'vehicle', label: 'Vehículo' },
  { value: 'implement', label: 'Implemento' },
  { value: 'irrigation', label: 'Riego' },
  { value: 'tool', label: 'Herramienta' },
  { value: 'other', label: 'Otro' },
]

const schema = z.object({
  code: z.string().min(1, 'El código es requerido').max(30),
  name: z.string().min(1, 'El nombre es requerido').max(200),
  type: z.string().max(50).nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  current_hours: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().nonnegative().nullable().optional()
  ),
})

type FormValues = z.infer<typeof schema>

const helper = createColumnHelper<Equipment>()

export function EquipmentTab() {
  const { data = [], isLoading } = useEquipment()
  const create = useCreate<Equipment>('equipment')
  const update = useUpdate<Equipment>('equipment')
  const softDelete = useSoftDelete('equipment')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [deleting, setDeleting] = useState<Equipment | null>(null)

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      code: '',
      name: '',
      type: null,
      brand: null,
      model: null,
      current_hours: null,
    },
  })

  const openCreate = () => {
    form.reset({ code: '', name: '', type: null, brand: null, model: null, current_hours: null })
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (row: Equipment) => {
    form.reset({
      code: row.code,
      name: row.name,
      type: row.type ?? null,
      brand: row.brand ?? null,
      model: row.model ?? null,
      current_hours: row.current_hours ?? null,
    })
    setEditing(row)
    setDialogOpen(true)
  }

  const openDelete = (row: Equipment) => {
    setDeleting(row)
    setDeleteOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.success('Equipo actualizado')
      } else {
        await create.mutateAsync(values)
        toast.success('Equipo creado')
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
      toast.success('Equipo eliminado')
      setDeleteOpen(false)
    } catch {
      toast.error('No se pudo eliminar el equipo.')
    }
  }

  const typeLabel = (val: string | null | undefined) =>
    EQUIPMENT_TYPES.find((t) => t.value === val)?.label ?? val ?? '—'

  const columns = [
    helper.accessor('code', { header: 'Código', enableSorting: true }),
    helper.accessor('name', { header: 'Nombre', enableSorting: true, meta: { truncate: true } }),
    helper.accessor('type', {
      header: 'Tipo',
      meta: { hiddenOnMobile: true },
      cell: (info) => {
        const val = info.getValue()
        if (!val) return '—'
        return (
          <Badge variant="secondary" className="text-xs font-normal">
            {typeLabel(val)}
          </Badge>
        )
      },
      enableSorting: false,
    }),
    helper.accessor('brand', {
      header: 'Marca',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor('model', {
      header: 'Modelo',
      cell: (info) => info.getValue() ?? '—',
      enableSorting: false,
      meta: { hiddenOnMobile: true },
    }),
    helper.accessor('current_hours', {
      header: 'Horas',
      meta: { hiddenOnMobile: true },
      cell: (info) => {
        const val = info.getValue()
        return val != null ? val.toLocaleString('es-MX') : '—'
      },
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
          Nuevo equipo
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<Equipment>[]}
        data={data as Equipment[]}
        isLoading={isLoading}
        searchKey="name"
        tableFixed
        searchPlaceholder="Buscar equipos..."
        emptyMessage="No hay equipos registrados."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar equipo' : 'Nuevo equipo'}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-36">
              <Label htmlFor="eq-code">Código *</Label>
              <Input id="eq-code" {...form.register('code')} placeholder="Ej. TRAC-01" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="eq-name">Nombre *</Label>
              <Input id="eq-name" {...form.register('name')} placeholder="Ej. Tractor John Deere" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="eq-type">Tipo</Label>
              <Select
                value={form.watch('type') ?? '__none__'}
                onValueChange={(v) => form.setValue('type', v === '__none__' ? null : v)}
              >
                <SelectTrigger id="eq-type" className="h-8 text-sm">
                  <SelectValue>{!form.watch('type') || form.watch('type') === '__none__' ? 'Sin tipo' : EQUIPMENT_TYPES.find((t) => t.value === form.watch('type'))?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin tipo</SelectItem>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="eq-hours">Horas actuales</Label>
              <Input
                id="eq-hours"
                type="number"
                min={0}
                step={0.1}
                {...form.register('current_hours')}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="eq-brand">Marca</Label>
              <Input id="eq-brand" {...form.register('brand')} placeholder="Ej. John Deere" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="eq-model">Modelo</Label>
              <Input id="eq-model" {...form.register('model')} placeholder="Ej. 5075E" />
            </div>
          </div>
        </div>
      </CrudDialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar equipo "${deleting?.name}"?`}
        description="Se eliminará este equipo del catálogo."
        onConfirm={handleDelete}
        isDeleting={softDelete.isPending}
      />
    </div>
  )
}
