import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Warehouse, Moon, Sun, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/hooks/use-theme'
import { ROLE_ROUTES } from '@/lib/constants'
import type { UserRole } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const DEMO_USERS: { label: string; role: UserRole; email: string }[] = [
  { label: 'Admin',       role: 'admin',       email: 'admin@agristock.mx' },
  { label: 'Gerente',     role: 'gerente',     email: 'gerente@agristock.mx' },
  { label: 'Almacenista', role: 'almacenista', email: 'almacen@agristock.mx' },
  { label: 'Supervisor',  role: 'supervisor',  email: 'supervisor@agristock.mx' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const { role } = await signIn(values.email, values.password)
      const route = ROLE_ROUTES[role]
      navigate(route, { replace: true })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Credenciales incorrectas'
      toast.error('Error al iniciar sesión', { description: message })
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Subtle gradient background */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl dark:bg-primary/8" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-primary/4 blur-3xl dark:bg-primary/6" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-border/60 bg-card/80 px-8 py-10 shadow-xl shadow-black/5 backdrop-blur-sm dark:border-border/40 dark:bg-card/60 dark:shadow-black/20">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Warehouse className="size-6 text-primary" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                AgriStock
              </h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Control total de tu almacén agrícola.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.mx"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...register('email')}
                className="h-9 text-sm"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
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
                  Iniciando sesión…
                </span>
              ) : (
                'Iniciar sesión'
              )}
            </Button>
          </form>

          {/* Demo quick-login buttons */}
          <div className="mt-6 flex flex-col gap-2">
            <p className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Acceso rápido demo
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => {
                    setValue('email', user.email)
                    setValue('password', 'demo123')
                  }}
                  className="rounded-lg border border-border/50 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                >
                  {user.label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer link */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            ¿Nuevo en AgriStock?{' '}
            <Link
              to="/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Crear cuenta gratis
            </Link>
          </p>
        </div>

        {/* Theme toggle */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
            }
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
            {resolvedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
