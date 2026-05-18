/**
 * PlatformLayout — chrome mínimo para el cockpit /plataforma.
 *
 * Diseño intencional: NO usamos AppLayout porque sus sidebars de módulos
 * son org-scoped (Almacén, Compras, Mantenimiento…). El cockpit opera
 * sobre TODAS las organizaciones, así que necesita su propio chrome.
 *
 * Header propio con marca de "Plataforma" + atajo para regresar al app
 * normal del usuario (que sigue siendo admin de su org).
 */
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Network, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

export default function PlatformLayout() {
  const navigate = useNavigate()
  const { profile, organization } = useAuth()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/plataforma" className="flex items-center gap-2 group">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" strokeWidth={2} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">
                Plataforma
              </span>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Cockpit cross-tenant
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col text-right leading-tight">
              <span className="text-sm font-medium text-foreground">
                {profile?.full_name ?? '—'}
              </span>
              {organization && (
                <span className="text-[11px] text-muted-foreground">
                  Tenant base: {organization.name}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="gap-1.5"
              title="Volver al app del tenant"
            >
              <ArrowLeftRight className="size-3.5" />
              <span className="hidden sm:inline">Salir al app</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="gap-1.5"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
