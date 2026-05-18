import { Fragment } from 'react'
import { useLocation, NavLink, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/contexts/page-title-context'
import { Sun, Moon, Search, LogOut, ChevronRight, Network } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePlatformAdmin } from '@/hooks/use-platform-admin'
import { useTheme } from '@/hooks/use-theme'
import { ROLE_LABELS_NEW, ROLE_ROUTES_NEW } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { NotificationsBell } from './notifications-bell'

// ─── Breadcrumb helpers ───────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
  inventario: 'Inventario',
  entradas: 'Entradas',
  salidas: 'Salidas',
  diesel: 'Diésel',
  lotes: 'Lotes',
  equipos: 'Equipos',
  reportes: 'Reportes',
  auditoria: 'Auditoría',
  configuracion: 'Configuración',
  solicitudes: 'Solicitudes',
  // role roots
  admin: 'Dashboard',
  almacenista: 'Dashboard',
  supervisor: 'Dashboard',
}

function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
}

interface BreadcrumbEntry {
  label: string
  to: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function useBreadcrumbs(): BreadcrumbEntry[] {
  const { primaryRole } = useAuth()
  const { titles } = usePageTitle()
  const location = useLocation()
  const basePath = primaryRole ? ROLE_ROUTES_NEW[primaryRole] : ''
  const baseLabel = 'AgriStock'

  const relative = location.pathname.replace(basePath, '').replace(/^\//, '')
  const segments = relative ? relative.split('/').filter(Boolean) : []

  const crumbs: BreadcrumbEntry[] = [{ label: baseLabel, to: basePath || '/' }]

  segments.forEach((seg, i) => {
    const to = `${basePath}/${segments.slice(0, i + 1).join('/')}`
    const label = UUID_RE.test(seg) ? (titles[location.pathname] ?? '…') : segmentLabel(seg)
    crumbs.push({ label, to })
  })

  return crumbs
}

// ─── Season badge ─────────────────────────────────────────────────────────────

function SeasonBadge() {
  const { activeSeason } = useAuth()

  if (!activeSeason) return null

  const statusColors: Record<string, string> = {
    active: 'bg-primary/10 text-primary',
    planning: 'bg-muted text-muted-foreground',
    closing: 'bg-warning/10 text-warning-foreground',
    closed: 'bg-muted text-muted-foreground',
  }

  const statusLabels: Record<string, string> = {
    active: 'Activa',
    planning: 'Planeación',
    closing: 'Cierre',
    closed: 'Cerrada',
  }

  const colorClass = statusColors[activeSeason.status] ?? statusColors.planning
  const statusLabel = statusLabels[activeSeason.status] ?? activeSeason.status

  return (
    <span
      className={cn(
        'hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClass
      )}
    >
      <span>🌾</span>
      <span>{activeSeason.name} · {statusLabel}</span>
    </span>
  )
}

// ─── Search trigger ───────────────────────────────────────────────────────────

function SearchTrigger() {
  return (
    <button
      type="button"
      className={cn(
        'hidden md:flex items-center gap-2 rounded-lg border border-border',
        'bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground',
        'hover:bg-muted transition-colors w-48 lg:w-64',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      onClick={() => {
        // Trigger the CommandSearch dialog via keyboard event
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      }}
    >
      <Search className="size-3.5 shrink-0" />
      <span className="flex-1 text-left">Buscar...</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  )
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {resolvedTheme === 'dark'
        ? <Sun className="size-4" />
        : <Moon className="size-4" />
      }
    </Button>
  )
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const { profile, primaryRole, signOut } = useAuth()
  const navigate = useNavigate()
  const { data: isPlatformAdmin } = usePlatformAdmin()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Menú de usuario"
      >
        <Avatar className="size-8">
          {profile?.avatar_url && (
            <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
          )}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="bottom" sideOffset={8}>
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{profile?.full_name ?? '—'}</span>
            {primaryRole && (
              <span className="text-xs font-normal text-muted-foreground">
                {ROLE_LABELS_NEW[primaryRole]}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPlatformAdmin && (
          <>
            <button
              type="button"
              onClick={() => navigate('/plataforma')}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted"
            >
              <Network className="size-4" />
              Cockpit plataforma
            </button>
            <DropdownMenuSeparator />
          </>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10"
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── AppHeader ────────────────────────────────────────────────────────────────

export function AppHeader() {
  const crumbs = useBreadcrumbs()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
      {/* Sidebar toggle */}
      <SidebarTrigger className="-ml-1 shrink-0" />

      {/* Breadcrumbs */}
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1
            return (
              <Fragment key={crumb.to}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<NavLink to={crumb.to} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator>
                    <ChevronRight />
                  </BreadcrumbSeparator>
                )}
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Center: search */}
      <div className="flex-shrink-0">
        <SearchTrigger />
      </div>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <SeasonBadge />
        <NotificationsBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
