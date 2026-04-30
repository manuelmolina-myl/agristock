import { useLocation, Link } from 'react-router-dom'
import { MailCheck, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email ?? ''
  const [resending, setResending] = useState(false)

  const handleResend = async () => {
    if (!email) return
    setResending(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw error
      toast.success('Correo reenviado', { description: `Revisa tu bandeja de entrada en ${email}` })
    } catch (err) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo reenviar' })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl dark:bg-primary/8" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-border/60 bg-card/80 px-8 py-10 shadow-xl shadow-black/5 backdrop-blur-sm dark:border-border/40 dark:bg-card/60">
          {/* Icon */}
          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <MailCheck className="size-8 text-primary" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Verifica tu correo
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Te enviamos un enlace de verificación a{' '}
                {email ? (
                  <span className="font-medium text-foreground">{email}</span>
                ) : (
                  'tu correo electrónico'
                )}
                . Haz clic en el enlace para activar tu cuenta.
              </p>
            </div>
          </div>

          {/* Steps */}
          <ol className="mb-6 flex flex-col gap-3">
            {[
              'Abre tu aplicación de correo',
              'Busca un mensaje de AgriStock',
              'Haz clic en "Confirmar correo"',
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {/* Resend */}
          {email && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={resending}
              onClick={handleResend}
            >
              {resending ? 'Reenviando…' : 'Reenviar correo de verificación'}
            </Button>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            ¿Correo incorrecto?{' '}
            <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Volver al registro
            </Link>
          </p>
        </div>

        <div className="mt-4 flex justify-center">
          <Link
            to="/login"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Ir a Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
