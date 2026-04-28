import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  MoreHorizontal,
  Fuel,
  ClipboardList,
  LogIn,
  LogOut,
  ArrowRightLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_ROUTES } from '@/lib/constants'

interface MobileNavItem {
  label: string
  to: string
  icon: React.ElementType
  exact?: boolean
  isMovimientos?: boolean
}

function useMobileNavItems(): MobileNavItem[] {
  const { profile } = useAuth()
  const base = profile?.role ? ROLE_ROUTES[profile.role] : '/'
  const role = profile?.role

  switch (role) {
    case 'supervisor':
      return [
        { label: 'Inicio',      to: base,                   icon: LayoutDashboard, exact: true },
        { label: 'Solicitudes', to: `${base}/solicitudes`,  icon: ClipboardList },
      ]
    case 'almacenista':
      return [
        { label: 'Inicio',      to: base,                   icon: LayoutDashboard, exact: true },
        { label: 'Inventario',  to: `${base}/inventario`,   icon: Package },
        { label: 'Movimientos', to: `${base}/entradas`,     icon: ArrowLeftRight, isMovimientos: true },
        { label: 'Diésel',      to: `${base}/diesel`,       icon: Fuel },
      ]
    default: // admin / gerente / super_admin
      return [
        { label: 'Inicio',      to: base,                   icon: LayoutDashboard, exact: true },
        { label: 'Inventario',  to: `${base}/inventario`,   icon: Package },
        { label: 'Movimientos', to: `${base}/entradas`,     icon: ArrowLeftRight, isMovimientos: true },
        { label: 'Reportes',    to: `${base}/reportes`,     icon: BarChart3 },
        { label: 'Más',         to: `${base}/configuracion`, icon: MoreHorizontal },
      ]
  }
}

// ─── Movimientos picker ───────────────────────────────────────────────────────

function MovimientosPicker({
  base,
  open,
  onClose,
}: {
  base: string
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()

  if (!open) return null

  const options = [
    { label: 'Entradas',   to: `${base}/entradas`,   icon: LogIn,           color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Salidas',    to: `${base}/salidas`,    icon: LogOut,          color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-500/10' },
    { label: 'Traspasos',  to: `${base}/traspasos`,  icon: ArrowRightLeft,  color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500/10' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — sits just above the nav bar */}
      <div className="fixed bottom-16 inset-x-0 z-50 mx-4 mb-1 rounded-2xl border border-border bg-background shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Movimientos</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x">
          {options.map(({ label, to, icon: Icon, color, bg }) => (
            <button
              key={to}
              type="button"
              className="flex flex-col items-center gap-2 py-5 px-2 hover:bg-muted/60 active:bg-muted transition-colors"
              onClick={() => { navigate(to); onClose() }}
            >
              <div className={cn('flex size-10 items-center justify-center rounded-xl', bg)}>
                <Icon className={cn('size-5', color)} strokeWidth={1.75} />
              </div>
              <span className="text-xs font-medium text-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── MobileNav ────────────────────────────────────────────────────────────────

export function MobileNav() {
  const items = useMobileNavItems()
  const { profile } = useAuth()
  const location = useLocation()
  const [movOpen, setMovOpen] = useState(false)
  const base = profile?.role ? ROLE_ROUTES[profile.role] : '/'

  const movPaths = [`${base}/entradas`, `${base}/salidas`, `${base}/traspasos`]
  const movActive = movPaths.some((p) => location.pathname.startsWith(p))

  return (
    <>
      <MovimientosPicker base={base} open={movOpen} onClose={() => setMovOpen(false)} />

      <nav
        className="fixed bottom-0 inset-x-0 z-30 flex md:hidden border-t border-border bg-background/95 backdrop-blur-sm"
        aria-label="Navegación móvil"
      >
        {items.map((item) => {
          if (item.isMovimientos) {
            return (
              <button
                key="movimientos"
                type="button"
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
                  movActive || movOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setMovOpen((v) => !v)}
              >
                <ArrowLeftRight
                  className={cn('size-5 transition-transform', (movActive || movOpen) && 'scale-110')}
                  strokeWidth={(movActive || movOpen) ? 2.5 : 1.75}
                />
                <span>Movimientos</span>
              </button>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('size-5 transition-transform', isActive && 'scale-110')}
                    strokeWidth={isActive ? 2.5 : 1.75}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
