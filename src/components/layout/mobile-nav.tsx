import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  MoreHorizontal,
  Fuel,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_ROUTES } from '@/lib/constants'

interface MobileNavItem {
  label: string
  to: string
  icon: React.ElementType
  exact?: boolean
}

function useMobileNavItems(): MobileNavItem[] {
  const { profile } = useAuth()
  const base = profile?.role ? ROLE_ROUTES[profile.role] : '/'
  const role = profile?.role

  return useMemo(() => {
    switch (role) {
      case 'supervisor':
        return [
          { label: 'Inicio',       to: base,                    icon: LayoutDashboard, exact: true },
          { label: 'Solicitudes',  to: `${base}/solicitudes`,   icon: ClipboardList },
        ]
      case 'almacenista':
        return [
          { label: 'Inicio',       to: base,                    icon: LayoutDashboard, exact: true },
          { label: 'Inventario',   to: `${base}/inventario`,    icon: Package },
          { label: 'Movimientos',  to: `${base}/entradas`,      icon: ArrowLeftRight },
          { label: 'Diésel',       to: `${base}/diesel`,        icon: Fuel },
        ]
      default: // admin
        return [
          { label: 'Inicio',       to: base,                    icon: LayoutDashboard, exact: true },
          { label: 'Inventario',   to: `${base}/inventario`,    icon: Package },
          { label: 'Movimientos',  to: `${base}/entradas`,      icon: ArrowLeftRight },
          { label: 'Reportes',     to: `${base}/reportes`,      icon: BarChart3 },
          { label: 'Más',          to: `${base}/configuracion`, icon: MoreHorizontal },
        ]
    }
  }, [role, base])
}

export function MobileNav() {
  const items = useMobileNavItems()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 flex md:hidden border-t border-border bg-background/95 backdrop-blur-sm"
      aria-label="Navegación móvil"
    >
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn(
                  'size-5 transition-transform',
                  isActive && 'scale-110'
                )}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
