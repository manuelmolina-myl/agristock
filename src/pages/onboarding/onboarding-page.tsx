import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Warehouse, Building2, Calendar, PackageOpen, ArrowRight, ArrowLeft, Check } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Schemas per step ─────────────────────────────────────────────────────────

const orgSchema = z.object({
  name:          z.string().min(2, 'Nombre muy corto'),
  rfc:           z.string().optional(),
  base_currency: z.enum(['MXN', 'USD']),
})

const seasonSchema = z.object({
  name:       z.string().min(2, 'Nombre de temporada muy corto'),
  start_date: z.string().min(1, 'Fecha de inicio requerida'),
  end_date:   z.string().min(1, 'Fecha de fin requerida'),
}).refine((d) => d.end_date > d.start_date, {
  path: ['end_date'],
  message: 'La fecha de fin debe ser posterior a la de inicio',
})

const warehouseSchema = z.object({
  name: z.string().min(2, 'Nombre de almacén muy corto'),
  code: z.string().min(1, 'Clave requerida').max(10, 'Máximo 10 caracteres'),
})

type OrgValues       = z.infer<typeof orgSchema>
type SeasonValues    = z.infer<typeof seasonSchema>
type WarehouseValues = z.infer<typeof warehouseSchema>

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Organización',  icon: Building2 },
  { label: 'Temporada',     icon: Calendar },
  { label: 'Almacén',       icon: PackageOpen },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done    = i < current
        const active  = i === current
        const Icon    = s.icon
        return (
          <div key={i} className="flex items-center">
            <div className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-all',
              done   ? 'border-primary bg-primary text-primary-foreground' :
              active ? 'border-primary bg-primary/10 text-primary' :
                       'border-muted bg-background text-muted-foreground'
            )}>
              {done ? <Check className="size-4" /> : <Icon className="size-4" />}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'h-0.5 w-10 transition-all',
                done ? 'bg-primary' : 'bg-muted'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: Organización ────────────────────────────────────────────────────

function OrgStep({ defaultName, onNext }: { defaultName: string; onNext: (v: OrgValues) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: defaultName, base_currency: 'MXN' },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Tu organización</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Datos generales de tu empresa o rancho.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre de la empresa / rancho</Label>
        <Input id="name" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rfc">RFC <span className="text-muted-foreground">(opcional)</span></Label>
        <Input id="rfc" {...register('rfc')} placeholder="XAXX010101000" className="h-9 font-mono uppercase" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Moneda base</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['MXN', 'USD'] as const).map((cur) => {
            const { ref, ...rest } = register('base_currency')
            return (
              <label
                key={cur}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                  'has-[:checked]:border-primary has-[:checked]:bg-primary/5'
                )}
              >
                <input ref={ref} {...rest} type="radio" value={cur} className="sr-only" />
                <span className="font-medium">{cur}</span>
                <span className="text-muted-foreground">{cur === 'MXN' ? 'Pesos mexicanos' : 'Dólares USD'}</span>
              </label>
            )
          })}
        </div>
      </div>

      <Button type="submit" className="mt-2 gap-1.5">
        Siguiente
        <ArrowRight className="size-4" />
      </Button>
    </form>
  )
}

// ─── Step 2: Temporada ───────────────────────────────────────────────────────

function SeasonStep({ onNext, onBack }: { onNext: (v: SeasonValues) => void; onBack: () => void }) {
  const thisYear = new Date().getFullYear()
  const { register, handleSubmit, formState: { errors } } = useForm<SeasonValues>({
    resolver: zodResolver(seasonSchema),
    defaultValues: {
      name:       `Temporada ${thisYear}`,
      start_date: `${thisYear}-01-01`,
      end_date:   `${thisYear}-12-31`,
    },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Primera temporada</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Define el período de producción activo.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sname">Nombre de la temporada</Label>
        <Input id="sname" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start_date">Fecha de inicio</Label>
          <Input id="start_date" type="date" {...register('start_date')} className="h-9 text-sm" aria-invalid={!!errors.start_date} />
          {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end_date">Fecha de fin</Label>
          <Input id="end_date" type="date" {...register('end_date')} className="h-9 text-sm" aria-invalid={!!errors.end_date} />
          {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Atrás
        </Button>
        <Button type="submit" className="flex-1 gap-1.5">
          Siguiente
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 3: Almacén ─────────────────────────────────────────────────────────

function WarehouseStep({
  onNext,
  onBack,
  submitting,
}: {
  onNext: (v: WarehouseValues) => void
  onBack: () => void
  submitting: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<WarehouseValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: 'Almacén Principal', code: 'ALM-01' },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Primer almacén</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define tu almacén principal. Puedes agregar más en Configuración.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wname">Nombre del almacén</Label>
        <Input id="wname" {...register('name')} className="h-9" aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Clave / código</Label>
        <Input id="code" {...register('code')} className="h-9 font-mono uppercase" placeholder="ALM-01" aria-invalid={!!errors.code} />
        {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
      </div>

      <div className="flex gap-2 mt-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Atrás
        </Button>
        <Button type="submit" className="flex-1 gap-1.5" disabled={submitting}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Configurando…
            </span>
          ) : (
            <>
              Finalizar configuración
              <Check className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// ─── Main onboarding page ─────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { organization, refreshOrganization } = useAuth()

  const [step, setStep]         = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [orgData, setOrgData]       = useState<OrgValues | null>(null)
  const [seasonData, setSeasonData] = useState<SeasonValues | null>(null)

  const handleOrg = (v: OrgValues) => {
    setOrgData(v)
    setStep(1)
  }

  const handleSeason = (v: SeasonValues) => {
    setSeasonData(v)
    setStep(2)
  }

  const handleWarehouse = async (warehouseValues: WarehouseValues) => {
    if (!organization || !orgData || !seasonData) return

    setSubmitting(true)
    try {
      // 1. Update organization
      const { error: orgErr } = await db
        .from('organizations')
        .update({
          name: orgData.name,
          rfc: orgData.rfc || null,
          base_currency: orgData.base_currency,
          onboarding_completed: true,
        })
        .eq('id', organization.id)
      if (orgErr) throw orgErr

      // 2. Create season as active
      const { data: season, error: seasonErr } = await db
        .from('seasons')
        .insert({
          organization_id: organization.id,
          name:       seasonData.name,
          start_date: seasonData.start_date,
          end_date:   seasonData.end_date,
          status:     'active',
        })
        .select()
        .single()
      if (seasonErr) throw seasonErr

      // 3. Create warehouse
      const { error: whErr } = await db
        .from('warehouses')
        .insert({
          organization_id: organization.id,
          name:    warehouseValues.name,
          code:    warehouseValues.code.toUpperCase(),
          is_active: true,
        })
      if (whErr) throw whErr

      // 4. Refresh auth context
      await refreshOrganization()
      void season // used above

      toast.success('¡Todo listo!', { description: 'Tu cuenta está configurada. Bienvenido a AgriStock.' })
      navigate('/admin', { replace: true })
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo completar la configuración')
      toast.error(title, { description })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl dark:bg-primary/8" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-primary/4 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Warehouse className="size-6 text-primary" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-muted-foreground">Configuración inicial</p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/80 px-8 py-8 shadow-xl shadow-black/5 backdrop-blur-sm dark:border-border/40 dark:bg-card/60">
          <StepIndicator current={step} />

          {step === 0 && (
            <OrgStep
              defaultName={organization?.name ?? ''}
              onNext={handleOrg}
            />
          )}
          {step === 1 && (
            <SeasonStep
              onNext={handleSeason}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <WarehouseStep
              onNext={handleWarehouse}
              onBack={() => setStep(1)}
              submitting={submitting}
            />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Paso {step + 1} de {STEPS.length} — Puedes cambiar todo esto después en Configuración.
        </p>
      </div>
    </div>
  )
}
