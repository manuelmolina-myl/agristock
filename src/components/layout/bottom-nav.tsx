import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Package,
  ShoppingCart,
  Wrench,
  Menu,
  BarChart3,
  Settings,
  Bell,
  LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { UserRoleEnum } from '@/lib/database.types'

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface BottomTab {
  key: string
  label: string
  to: string
  icon: LucideIcon
  /** Roles that can see this tab. */
  roles: UserRoleEnum[]
}

const PRIMARY_TABS: BottomTab[] = [
  {
    key: 'almacen',
    label: 'Almacén',
    to: '/almacen',
    icon: Package,
    // admin (full), almacenista (full), compras (read), mantenimiento (read).
    roles: ['admin', 'almacenista', 'compras', 'mantenimiento'],
  },
  {
    key: 'compras',
    label: 'Compras',
    to: '/compras',
    icon: ShoppingCart,
    // admin, compras, almacenista (own requisitions).
    roles: ['admin', 'compras', 'almacenista'],
  },
  {
    key: 'mantenimiento',
    label: 'Mantenimiento',
    to: '/mantenimiento',
    icon: Wrench,
    // admin, mantenimiento, almacenista (request only).
    roles: ['admin', 'mantenimiento', 'almacenista'],
  },
]

function isTabActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

// ─── Más sheet ────────────────────────────────────────────────────────────────

function MasSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const navigate = useNavigate()
  const { primaryRole, signOut } = useAuth()

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  const handleSignOut = async () => {
    onOpenChange(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  const canSeeReportes =
    primaryRole === 'admin' ||
    primaryRole === 'compras' ||
    primaryRole === 'mantenimiento'
  const canSeeConfiguracion = primaryRole === 'admin'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        <SheetHeader>
          <SheetTitle>Más</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col px-2 pb-2">
          <MasItem
            icon={Bell}
            label="Notificaciones"
            onClick={() => {
              onOpenChange(false)
              // Open the global notification bell — header's bell is the source of truth.
              // For now we just close; users can tap the bell in the header.
            }}
          />
          {canSeeReportes && (
            <MasItem
              icon={BarChart3}
              label="Reportes"
              onClick={() => go('/reportes')}
            />
          )}
          {canSeeConfiguracion && (
            <MasItem
              icon={Settings}
              label="Configuración"
              onClick={() => go('/configuracion')}
            />
          )}
          <MasItem
            icon={LogOut}
            label="Cerrar sesión"
            onClick={handleSignOut}
            destructive
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MasItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-muted',
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
      <span className="font-medium">{label}</span>
    </button>
  )
}

// ─── BottomNav ────────────────────────────────────────────────────────────────

export function BottomNav() {
  const { primaryRole } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [masOpen, setMasOpen] = useState(false)

  if (!primaryRole) return null

  // Filter primary tabs by role visibility.
  const visiblePrimary = PRIMARY_TABS.filter((t) => t.roles.includes(primaryRole))

  // Always 4 slots: up to 3 primary tabs + the "Más" sheet trigger.
  // We cap visible primary tabs at 3 so "Más" always fits.
  const tabs = visiblePrimary.slice(0, 3)

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 flex md:hidden',
          'border-t border-border bg-card',
          'shadow-[0_-2px_8px_rgba(0,0,0,0.04)]',
          'pb-[max(env(safe-area-inset-bottom),0px)]',
        )}
        aria-label="Navegación principal"
      >
        {tabs.map((tab) => {
          const active = isTabActive(location.pathname, tab.to)
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to)}
              className={cn(
                'flex flex-1 min-h-14 flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn('size-5 transition-transform', active && 'scale-110')}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className="text-xs font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}

        {/* Más tab — always present */}
        <button
          key="mas"
          type="button"
          onClick={() => setMasOpen(true)}
          className={cn(
            'flex flex-1 min-h-14 flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors',
            masOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-haspopup="dialog"
          aria-expanded={masOpen}
        >
          <Menu
            className={cn('size-5 transition-transform', masOpen && 'scale-110')}
            strokeWidth={masOpen ? 2.25 : 1.75}
          />
          <span className="text-xs font-medium leading-none">Más</span>
        </button>
      </nav>

      <MasSheet open={masOpen} onOpenChange={setMasOpen} />
    </>
  )
}
