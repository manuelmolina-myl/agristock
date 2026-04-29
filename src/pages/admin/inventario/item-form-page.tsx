import { useEffect, useCallback, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBasePath } from '@/hooks/use-base-path'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import {
  useItem,
  useCategories,
  useUnits,
  useCreate,
  useUpdate,
} from '@/hooks/use-supabase-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/database.types'

import { CurrencyBadge } from '@/components/custom/currency-badge'
import { SearchableSelect } from '@/components/shared/searchable-select'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
  sku: z.string().optional().transform((v) => v?.trim() ? v.trim().toUpperCase() : undefined),
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
  image_url: z.string().optional().nullable(),
})

type ItemFormValues = z.infer<typeof itemSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

// ─── Image upload component ───────────────────────────────────────────────────

interface ImageUploadProps {
  value: string | null | undefined
  onChange: (url: string | null) => void
  orgId: string
}

function ImageUpload({ value, onChange, orgId }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5 MB')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${orgId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('item-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('item-images').getPublicUrl(path)
      onChange(urlData.publicUrl)
    } catch {
      toast.error('Error al subir la imagen')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {value ? (
        <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border group">
          <img src={value} alt="Foto del artículo" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white"
          >
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex w-32 h-32 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border',
            'text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors',
            uploading && 'opacity-50 pointer-events-none'
          )}
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-xs">{uploading ? 'Subiendo…' : 'Agregar foto'}</span>
        </button>
      )}
      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-muted-foreground hover:text-primary transition-colors w-fit"
        >
          {uploading ? 'Subiendo…' : 'Cambiar foto'}
        </button>
      )}
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Categoría', 'Identificación', 'Configuración'] as const

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                done
                  ? 'bg-primary text-primary-foreground'
                  : active
                  ? 'bg-primary/15 text-primary ring-2 ring-primary/30'
                  : 'bg-muted text-muted-foreground'
              )}>
                {done ? <Check className="size-3" /> : i + 1}
              </div>
              <span className={cn(
                'hidden sm:block text-xs',
                active ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}>
                {label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={cn(
                'mx-2 h-px w-8',
                i < current ? 'bg-primary' : 'bg-border'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const basePath = useBasePath()
  const { organization } = useAuth()
  const isEditing = !!id
  const orgId = organization?.id ?? ''

  const { data: item, isLoading: itemLoading } = useItem(id)
  const { data: categories = [] } = useCategories()
  const { data: units = [] } = useUnits()

  const createItem = useCreate<Item>('items')
  const updateItem = useUpdate<Item>('items')

  const [step, setStep] = useState(0)

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    trigger,
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

  const watchedCurrency = watch('native_currency')
  const watchedCategoryId = watch('category_id')
  const watchedSku = watch('sku')

  // ── SKU generation ─────────────────────────────────────────────────────────

  const generateSkuForCategory = useCallback(async (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return null
    // Use explicit prefix or derive one from the first letters of the category name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const explicitPrefix = (cat as any).prefix as string | undefined
    const prefix = explicitPrefix?.trim() ||
      cat.name
        .split(/\s+/)
        .map((w: string) => w.replace(/[^a-zA-Z]/g, '').slice(0, 3))
        .filter(Boolean)
        .join('')
        .toUpperCase()
        .slice(0, 4)
    if (!prefix) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .is('deleted_at', null)
    const next = (count ?? 0) + 1
    return `${prefix}-${String(next).padStart(4, '0')}`
  }, [categories])

  const generateGenericSku = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('items')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
    const next = (count ?? 0) + 1
    return `ITEM-${String(next).padStart(4, '0')}`
  }, [])

  // Auto-generate SKU when category changes (create mode only)
  useEffect(() => {
    if (isEditing) return
    if (watchedCategoryId) {
      generateSkuForCategory(watchedCategoryId).then((sku) => {
        if (sku) setValue('sku', sku, { shouldValidate: false, shouldDirty: true })
      })
    } else {
      setValue('sku', '', { shouldValidate: false })
    }
  }, [watchedCategoryId, isEditing, generateSkuForCategory, setValue])

  // ── Wizard navigation ──────────────────────────────────────────────────────

  const STEP_REQUIRED: (keyof ItemFormValues)[][] = [
    [],         // step 0: category (optional)
    ['name'],   // step 1: name required
    ['unit_id'],// step 2: unit required
  ]

  async function handleNext() {
    const required = STEP_REQUIRED[step]
    if (required.length > 0) {
      const ok = await trigger(required)
      if (!ok) return
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function onSubmit(values: ItemFormValues) {
    let sku = values.sku
    if (!sku) {
      if (values.category_id) {
        sku = (await generateSkuForCategory(values.category_id)) ?? undefined
      }
      if (!sku) sku = await generateGenericSku()
    }

    const payload = {
      ...values,
      sku,
      description: values.description || null,
      category_id: values.category_id || null,
      unit_id: values.unit_id || null,
      barcode: values.barcode || null,
      notes: values.notes || null,
      image_url: values.image_url || null,
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

  // ── Edit mode: single-page form ────────────────────────────────────────────

  if (isEditing) {
    return (
      <div className="flex flex-col gap-0 min-h-full">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => navigate(`${basePath}/inventario/${id}`)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-base font-semibold">Editar ítem</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/inventario/${id}`)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
              {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Identidad</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sku" className="text-sm">SKU</Label>
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name" className="text-sm">
                    Nombre <span className="text-destructive">*</span>
                  </Label>
                  <Input id="name" placeholder="Fertilizante NPK 20-20-20" {...register('name')} />
                  <FieldError message={errors.name?.message} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="description" className="text-sm">Descripción</Label>
                  <Textarea id="description" placeholder="Descripción opcional…" rows={2} {...register('description')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="barcode" className="text-sm">Código de barras</Label>
                  <Input id="barcode" placeholder="7501234567890" className="font-mono" {...register('barcode')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Foto del producto</Label>
                  <Controller
                    name="image_url"
                    control={control}
                    render={({ field }) => (
                      <ImageUpload value={field.value} onChange={field.onChange} orgId={orgId} />
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clasificación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Categoría</Label>
                  <Controller
                    name="category_id"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                        options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
                        placeholder="Sin categoría"
                        searchPlaceholder="Buscar categoría…"
                        emptyMessage="Sin categorías."
                      />
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">
                    Unidad de medida <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="unit_id"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                        options={units.map((u) => ({ value: u.id, label: u.name, sublabel: u.code }))}
                        placeholder="Selecciona unidad"
                        searchPlaceholder="Buscar unidad…"
                        emptyMessage="Sin unidades."
                      />
                    )}
                  />
                  <FieldError message={errors.unit_id?.message} />
                </div>
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
                            <SelectValue>
                              {field.value === 'MXN' ? 'Peso mexicano (MXN)' : 'Dólar estadounidense (USD)'}
                            </SelectValue>
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
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Parámetros de stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="min_stock" className="text-sm">Stock mínimo</Label>
                  <Input id="min_stock" type="number" min={0} placeholder="0" className="tabular-nums" {...register('min_stock')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="max_stock" className="text-sm">Stock máximo</Label>
                  <Input id="max_stock" type="number" min={0} placeholder="0" className="tabular-nums" {...register('max_stock')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reorder_point" className="text-sm">Punto de reorden</Label>
                  <Input id="reorder_point" type="number" min={0} placeholder="0" className="tabular-nums" {...register('reorder_point')} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Configuración adicional</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Controller
                  name="is_diesel"
                  control={control}
                  render={({ field }) => (
                    <Checkbox id="is_diesel" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="is_diesel" className="text-sm cursor-pointer">Es diésel</Label>
                  <p className="text-xs text-muted-foreground">Marca este ítem como combustible diésel para reportes.</p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes" className="text-sm">Notas</Label>
                <Textarea id="notes" placeholder="Notas internas…" rows={3} {...register('notes')} />
              </div>
            </CardContent>
          </Card>

          <div className="h-4" />
        </form>
      </div>
    )
  }

  // ── Create mode: wizard ────────────────────────────────────────────────────

  const selectedCategory = categories.find((c) => c.id === watchedCategoryId)

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => step === 0 ? navigate(`${basePath}/inventario`) : handleBack()}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold">Nuevo ítem</h1>
        </div>
        <StepIndicator current={step} />
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(`${basePath}/inventario`)}>
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full">

        {/* ── Step 0: Categoría ─────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">¿De qué categoría es este producto?</h2>
              <p className="text-sm text-muted-foreground">
                La categoría determina el identificador automático del producto. Puedes omitirla.
              </p>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay categorías dadas de alta. Puedes continuar sin categoría.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {/* No category option */}
                <button
                  type="button"
                  onClick={() => setValue('category_id', null, { shouldDirty: true })}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/50',
                    !watchedCategoryId ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  )}
                >
                  <span className="text-sm font-medium text-muted-foreground">Sin categoría</span>
                  <Badge variant="outline" className="w-fit font-mono text-[10px] px-1.5 py-0">
                    ITEM-XXXX
                  </Badge>
                </button>

                {categories.map((cat) => {
                  const isSelected = watchedCategoryId === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setValue('category_id', cat.id, { shouldDirty: true })}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(cat as any).color && (
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            style={{ backgroundColor: (cat as any).color }}
                          />
                        )}
                        <span className="text-sm font-medium leading-tight">{cat.name}</span>
                      </div>
                      {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const explicitPrefix = (cat as any).prefix as string | undefined
                        const prefix = explicitPrefix?.trim() ||
                          cat.name.split(/\s+/).map((w: string) => w.replace(/[^a-zA-Z]/g, '').slice(0, 3)).filter(Boolean).join('').toUpperCase().slice(0, 4)
                        return (
                          <Badge variant="outline" className="w-fit font-mono text-[10px] px-1.5 py-0">
                            {prefix}-XXXX
                          </Badge>
                        )
                      })()}
                    </button>
                  )
                })}
              </div>
            )}

            {watchedCategoryId && watchedSku && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-4 py-3">
                <Check className="size-4 text-primary shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Identificador generado: <span className="font-mono font-semibold text-foreground">{watchedSku}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Identificación ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Identificación del producto</h2>
              <p className="text-sm text-muted-foreground">
                El nombre es obligatorio. El SKU fue generado automáticamente — puedes editarlo si lo necesitas.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm">
                  Nombre del producto <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Ej. Fertilizante NPK 20-20-20"
                  autoFocus
                  {...register('name')}
                />
                <FieldError message={errors.name?.message} />
              </div>

              {/* SKU */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sku" className="text-sm">
                    SKU / Identificador
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  {selectedCategory && (
                    <span className="text-xs text-muted-foreground">
                      Categoría: <strong>{selectedCategory.name}</strong>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="sku"
                    placeholder={watchedCategoryId ? 'Generado automáticamente' : 'Ej. PROD-0001'}
                    className="font-mono uppercase pr-8"
                    {...register('sku')}
                    onChange={(e) => {
                      e.target.value = e.target.value.toUpperCase()
                      register('sku').onChange(e)
                    }}
                  />
                  {watchedSku && (
                    <Pencil className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Si lo dejas vacío, se asignará uno automáticamente al guardar.
                </p>
                <FieldError message={errors.sku?.message} />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description" className="text-sm">
                  Descripción
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Descripción adicional del producto…"
                  rows={2}
                  {...register('description')}
                />
              </div>

              {/* Barcode */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="barcode" className="text-sm">
                  Código de barras
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="barcode"
                  placeholder="7501234567890"
                  className="font-mono"
                  {...register('barcode')}
                />
              </div>

              {/* Image */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">
                  Foto del producto
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Controller
                  name="image_url"
                  control={control}
                  render={({ field }) => (
                    <ImageUpload value={field.value} onChange={field.onChange} orgId={orgId} />
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Configuración ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Configuración</h2>
              <p className="text-sm text-muted-foreground">
                Unidad y moneda son necesarias para registrar movimientos. Los parámetros de stock son opcionales.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              {/* Unit + Currency */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">
                    Unidad de medida <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="unit_id"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                        options={units.map((u) => ({ value: u.id, label: u.name, sublabel: u.code }))}
                        placeholder="Selecciona unidad"
                        searchPlaceholder="Buscar unidad…"
                        emptyMessage="Sin unidades."
                      />
                    )}
                  />
                  <FieldError message={errors.unit_id?.message} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">Moneda nativa</Label>
                  <div className="flex items-center gap-2">
                    <Controller
                      name="native_currency"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="flex-1">
                            <SelectValue>
                              {field.value === 'MXN' ? 'Peso mexicano (MXN)' : 'Dólar (USD)'}
                            </SelectValue>
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
                </div>
              </div>

              <Separator />

              {/* Stock params */}
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Parámetros de stock <span className="text-xs font-normal text-muted-foreground">(opcionales)</span></p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="min_stock" className="text-sm">Stock mínimo</Label>
                    <Input id="min_stock" type="number" min={0} placeholder="0" className="tabular-nums" {...register('min_stock')} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="max_stock" className="text-sm">Stock máximo</Label>
                    <Input id="max_stock" type="number" min={0} placeholder="0" className="tabular-nums" {...register('max_stock')} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reorder_point" className="text-sm">Punto de reorden</Label>
                    <Input id="reorder_point" type="number" min={0} placeholder="0" className="tabular-nums" {...register('reorder_point')} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Is diesel */}
              <div className="flex items-center gap-3">
                <Controller
                  name="is_diesel"
                  control={control}
                  render={({ field }) => (
                    <Checkbox id="is_diesel" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="is_diesel" className="text-sm cursor-pointer">Es diésel</Label>
                  <p className="text-xs text-muted-foreground">Marca este ítem como combustible diésel para reportes de consumo.</p>
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes" className="text-sm">
                  Notas
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opcionales)</span>
                </Label>
                <Textarea id="notes" placeholder="Notas internas sobre este producto…" rows={3} {...register('notes')} />
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation buttons ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="mr-1.5 size-3.5" /> Anterior
            </Button>
          ) : (
            <div />
          )}

          {step < WIZARD_STEPS.length - 1 ? (
            <Button type="button" size="sm" onClick={handleNext}>
              Siguiente <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Guardar ítem
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default ItemFormPage
