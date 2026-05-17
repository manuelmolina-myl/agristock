import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Save, Upload, Building2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const orgSchema = z.object({
  name:          z.string().min(2, 'Nombre muy corto'),
  rfc:           z.string().optional(),
  address:       z.string().optional(),
  base_currency: z.enum(['MXN', 'USD']),
  timezone:      z.string().min(1),
})

type OrgValues = z.infer<typeof orgSchema>

const TIMEZONES = [
  { value: 'America/Mexico_City',  label: 'Ciudad de México (CST/CDT)' },
  { value: 'America/Mazatlan',     label: 'Mazatlán / Sinaloa (MST)' },
  { value: 'America/Monterrey',    label: 'Monterrey (CST/CDT)' },
  { value: 'America/Hermosillo',   label: 'Hermosillo (MST)' },
  { value: 'America/Chihuahua',    label: 'Chihuahua (MST/MDT)' },
  { value: 'America/Tijuana',      label: 'Tijuana (PST/PDT)' },
]

export function OrgTab() {
  const { organization, refreshOrganization } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      name:          organization?.name ?? '',
      rfc:           organization?.rfc ?? '',
      address:       organization?.address ?? '',
      base_currency: (organization?.base_currency as 'MXN' | 'USD') ?? 'MXN',
      timezone:      organization?.timezone ?? 'America/Mexico_City',
    },
  })

  useEffect(() => {
    if (organization) {
      reset({
        name:          organization.name,
        rfc:           organization.rfc ?? '',
        address:       organization.address ?? '',
        base_currency: organization.base_currency as 'MXN' | 'USD',
        timezone:      organization.timezone,
      })
      setLogoUrl(organization.logo_url)
    }
  }, [organization, reset])

  const onSubmit = async (values: OrgValues) => {
    if (!organization) return
    try {
      const { error } = await db
        .from('organizations')
        .update({
          name:          values.name,
          rfc:           values.rfc || null,
          address:       values.address || null,
          base_currency: values.base_currency,
          timezone:      values.timezone,
        })
        .eq('id', organization.id)
      if (error) throw error
      await refreshOrganization()
      toast.success('Organización actualizada')
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo guardar la organización')
      toast.error(title, { description })
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !organization) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `logos/${organization.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('item-images')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('item-images').getPublicUrl(path)

      const { error: dbErr } = await db
        .from('organizations')
        .update({ logo_url: publicUrl })
        .eq('id', organization.id)
      if (dbErr) throw dbErr

      setLogoUrl(publicUrl)
      await refreshOrganization()
      toast.success('Logo actualizado')
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo subir el logo')
      toast.error(title, { description })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const timezone  = watch('timezone')
  const currency  = watch('base_currency')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Logo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Logo de la organización
          </CardTitle>
          <CardDescription className="text-xs">Imagen que aparece en reportes y documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="size-full object-contain" />
              ) : (
                <Building2 className="size-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="logo-upload"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Upload className="size-3.5" />
                {uploading ? 'Subiendo…' : 'Cambiar logo'}
              </label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={handleLogoUpload}
              />
              <p className="text-[11px] text-muted-foreground">PNG, JPG o SVG. Máx 2 MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* General info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="org-name">Nombre de la organización <span className="text-destructive">*</span></Label>
          <Input id="org-name" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rfc">RFC</Label>
          <Input id="rfc" {...register('rfc')} placeholder="XAXX010101000" className="h-9 font-mono uppercase" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Moneda base</Label>
          <Select value={currency} onValueChange={(v) => setValue('base_currency', v as 'MXN' | 'USD', { shouldDirty: true })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MXN">MXN — Pesos mexicanos</SelectItem>
              <SelectItem value="USD">USD — Dólares</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" {...register('address')} placeholder="Calle, Colonia, Ciudad, Estado, CP" className="h-9" />
        </div>

        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <Label>Zona horaria</Label>
          <Select value={timezone ?? ''} onValueChange={(v) => setValue('timezone', v ?? '', { shouldDirty: true })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isDirty} className="gap-1.5">
          <Save className="size-4" />
          {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
