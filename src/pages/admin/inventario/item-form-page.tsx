import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  useItem,
  useCategories,
  useUnits,
  useCreate,
  useUpdate,
} from '@/hooks/use-supabase-query'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/database.types'

import { CurrencyBadge } from '@/components/custom/currency-badge'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  sku: z.string().min(1, 'SKU requerido').transform((v) => v.toUpperCase()),
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  unit_id: z.string().nullable().refine((v) => !!v, { message: 'Selecciona una unidad de medida' }),
  native_currency: z.enum(['MXN', 'USD']),
  barcode: z.string().optional().nullable(),
  min_stock: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0).nullable().optional()
  ),
  max_stock: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0).nullable().optional()
  ),
  reorder_point: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0).nullable().optional()
  ),
  is_diesel: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

type ItemFormValues = z.infer<typeof itemSchema>

// ─── Field error helper ───────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

// ─── Form skeleton ────────────────────────────────────────────────────────────

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const isEditing = !!id

  const { data: item, isLoading: itemLoading } = useItem(id)
  const { data: categories = [] } = useCategories()
  const { data: units = [] } = useUnits()

  const createItem = useCreate<Item>('items')
  const updateItem = useUpdate<Item>('items')

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(itemSchema) as any,
    defaultValues: {
      sku: '',
      name: '',
      description: null,
      category_id: null,
      unit_id: null,
      native_currency: 'MXN',
      barcode: null,
      min_stock: null,
      max_stock: null,
      reorder_point: null,
      is_diesel: false,
      notes: null,
    },
  })

  // Pre-fill when editing
  useEffect(() => {
    if (isEditing && item) {
      reset({
        sku: item.sku,
        name: item.name,
        description: item.description ?? null,
        category_id: item.category_id ?? null,
        unit_id: item.unit_id ?? null,
        native_currency: item.native_currency,
        barcode: item.barcode ?? null,
        min_stock: item.min_stock ?? null,
        max_stock: item.max_stock ?? null,
        reorder_point: item.reorder_point ?? null,
        is_diesel: item.is_diesel,
        notes: item.notes ?? null,
      })
    }
  }, [isEditing, item, reset])

  const watchedCurrency  = watch('native_currency')
  const watchedCategoryId = watch('category_id')

  const generateSku = useCallback(async (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat?.prefix) return
    const { count } = await (supabase as any)
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .is('deleted_at', null)
    const next = (count ?? 0) + 1
    const sku = `${cat.prefix}-${String(next).padStart(4, '0')}`
    setValue('sku', sku, { shouldValidate: false, shouldDirty: true })
  }, [categories, setValue])

  useEffect(() => {
    if (!isEditing && watchedCategoryId) {
      generateSku(watchedCategoryId)
    }
  }, [watchedCategoryId, isEditing, generateSku])

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function onSubmit(values: ItemFormValues) {
    // Normalize empty strings to null
    const payload = {
      ...values,
      description: values.description || null,
      category_id: values.category_id || null,
      unit_id: values.unit_id || null,
      barcode: values.barcode || null,
      notes: values.notes || null,
    }

    try {
      if (isEditing) {
        await updateItem.mutateAsync({ id: id!, values: payload })
        toast.success('Ítem actualizado')
        navigate(`${basePath}/inventario/${id}`)
      } else {
        const created = await createItem.mutateAsync(payload)
        toast.success('Ítem creado')
        navigate(`${basePath}/inventario/${(created as Item).id}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(`No se pudo guardar: ${message}`)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isEditing && itemLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-40" />
        </div>
        <FormSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() =>
              navigate(isEditing ? `${basePath}/inventario/${id}` : `${basePath}/inventario`)
            }
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold">
            {isEditing ? 'Editar ítem' : 'Nuevo ítem'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(isEditing ? `${basePath}/inventario/${id}` : `${basePath}/inventario`)
            }
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* ── Form body ──────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full"
      >
        {/* Section: Identidad */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Identidad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* SKU */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku" className="text-sm">
                  SKU <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sku"
                  placeholder="PROD-001"
                  className="font-mono uppercase"
                  {...register('sku')}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase()
                    register('sku').onChange(e)
                  }}
                />
                <FieldError message={errors.sku?.message} />
              </div>

              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Fertilizante NPK 20-20-20"
                  {...register('name')}
                />
                <FieldError message={errors.name?.message} />
              </div>

              {/* Descripción (full width) */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="description" className="text-sm">Descripción</Label>
                <Textarea
                  id="description"
                  placeholder="Descripción opcional del ítem…"
                  rows={2}
                  {...register('description')}
                />
              </div>

              {/* Código de barras */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="barcode" className="text-sm">Código de barras</Label>
                <Input
                  id="barcode"
                  placeholder="7501234567890"
                  className="font-mono"
                  {...register('barcode')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: Clasificación */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clasificación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Categoría */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Categoría</Label>
                <Controller
                  name="category_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin categoría</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <span className="flex items-center gap-1.5">
                              {cat.color && (
                                <span
                                  className="inline-block size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: cat.color }}
                                />
                              )}
                              {cat.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Unidad */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">
                  Unidad de medida <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="unit_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona unidad" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.unit_id?.message} />
              </div>

              {/* Moneda nativa */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">
                  Moneda nativa <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Controller
                    name="native_currency"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MXN">Peso mexicano (MXN)</SelectItem>
                          <SelectItem value="USD">Dólar estadounidense (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <CurrencyBadge currency={watchedCurrency} />
                </div>
                <FieldError message={errors.native_currency?.message} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: Parámetros de stock */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Parámetros de stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Stock mínimo */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="min_stock" className="text-sm">Stock mínimo</Label>
                <Input
                  id="min_stock"
                  type="number"
                  min={0}
                  placeholder="0"
                  className="tabular-nums"
                  {...register('min_stock')}
                />
                <FieldError message={errors.min_stock?.message} />
              </div>

              {/* Stock máximo */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="max_stock" className="text-sm">Stock máximo</Label>
                <Input
                  id="max_stock"
                  type="number"
                  min={0}
                  placeholder="0"
                  className="tabular-nums"
                  {...register('max_stock')}
                />
                <FieldError message={errors.max_stock?.message} />
              </div>

              {/* Punto de reorden */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reorder_point" className="text-sm">Punto de reorden</Label>
                <Input
                  id="reorder_point"
                  type="number"
                  min={0}
                  placeholder="0"
                  className="tabular-nums"
                  {...register('reorder_point')}
                />
                <FieldError message={errors.reorder_point?.message} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: Configuración adicional */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Configuración adicional
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Is diesel */}
            <div className="flex items-center gap-3">
              <Controller
                name="is_diesel"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="is_diesel"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="is_diesel" className="text-sm cursor-pointer">
                  Es diésel
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marca este ítem como combustible diésel para reportes de consumo.
                </p>
              </div>
            </div>

            <Separator />

            {/* Notas */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes" className="text-sm">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Notas internas sobre este ítem…"
                rows={3}
                {...register('notes')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Footer spacer for mobile (sticky header handles desktop) */}
        <div className="h-4" />
      </form>
    </div>
  )
}

export default ItemFormPage
