import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Warehouse, Moon, Sun, Eye, EyeOff, ArrowLeft } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/hooks/use-theme'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const signupSchema = z.object({
  full_name: z.string().min(2, 'Nombre muy corto'),
  org_name:  z.string().min(2, 'Nombre de empresa muy corto'),
  email:     z.string().email('Email inválido'),
  password:  z.string().min(8, 'Mínimo 8 caracteres'),
  confirm:   z.string(),
}).refine((d) => d.password === d.confirm, {
  path: ['confirm'],
  message: 'Las contraseñas no coinciden',
})

type SignupValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  const navigate   = useNavigate()
  const { signUp } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) })

  const onSubmit = async (values: SignupValues) => {
    try {
      await signUp(values.email, values.password, values.full_name, values.org_name)
      navigate('/verify-email', { state: { email: values.email } })
    } catch (err) {
      const { title, description } = formatSupabaseError(err, 'No se pudo crear la cuenta')
      toast.error(title, { description })
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl dark:bg-primary/8" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-primary/4 blur-3xl dark:bg-primary/6" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-border/60 bg-card/80 px-8 py-10 shadow-xl shadow-black/5 backdrop-blur-sm dark:border-border/40 dark:bg-card/60 dark:shadow-black/20">
          {/* Logo */}
          <div className="mb-7 flex flex-col items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Warehouse className="size-6 text-primary" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                Crear cuenta
              </h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Empieza gratis. Sin tarjeta de crédito.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
            {/* Full name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name" className="text-xs">Tu nombre completo</Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Juan Ramírez López"
                autoComplete="name"
                autoFocus
                aria-invalid={!!errors.full_name}
                {...register('full_name')}
                className="h-9 text-sm"
              />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>

            {/* Org name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org_name" className="text-xs">Nombre de tu empresa / rancho</Label>
              <Input
                id="org_name"
                type="text"
                placeholder="Agropecuaria San Isidro"
                autoComplete="organization"
                aria-invalid={!!errors.org_name}
                {...register('org_name')}
                className="h-9 text-sm"
              />
              {errors.org_name && <p className="text-xs text-destructive">{errors.org_name.message}</p>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.mx"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register('email')}
                className="h-9 text-sm"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                  className="h-9 pr-9 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm" className="text-xs">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                {...register('confirm')}
                className="h-9 text-sm"
              />
              {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className={cn(
                'mt-1 h-9 w-full bg-primary text-primary-foreground hover:bg-primary/90',
                isSubmitting && 'cursor-not-allowed opacity-70'
              )}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Creando cuenta…
                </span>
              ) : (
                'Crear cuenta gratuita'
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-5 text-center text-xs text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link
              to="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Iniciar sesión
            </Link>
          </p>
        </div>

        {/* Back to home + theme toggle */}
        <div className="mt-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Inicio
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {resolvedTheme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            {resolvedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </div>
    </div>
  )
}
