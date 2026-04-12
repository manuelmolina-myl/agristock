import { useLocation, NavLink } from 'react-router-dom'
import { Sun, Moon, Search, LogOut, User, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/hooks/use-theme'
import { ROLE_LABELS, ROLE_ROUTES } from '@/lib/constants'
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'

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
  gerente: 'Dashboard',
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

function useBreadcrumbs(): BreadcrumbEntry[] {
  const { profile } = useAuth()
  const location = useLocation()
  const basePath = profile?.role ? ROLE_ROUTES[profile.role] : ''
  const baseLabel = 'AgriStock'

  // Strip the base path to get relative segments
  const relative = location.pathname.replace(basePath, '').replace(/^\//, '')
  const segments = relative ? relative.split('/').filter(Boolean) : []

  const crumbs: BreadcrumbEntry[] = [{ label: baseLabel, to: basePath || '/' }]

  segments.forEach((seg, i) => {
    const to = `${basePath}/${segments.slice(0, i + 1).join('/')}`
    crumbs.push({ label: segmentLabel(seg), to })
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
        // TODO: open command palette / search dialog
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
  const { profile, signOut } = useAuth()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Menú de usuario"
      >
        <Avatar size="sm">
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
            {profile?.role && (
              <span className="text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[profile.role]}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User />
          <span>Perfil</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut()}
        >
          <LogOut />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
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
              <BreadcrumbItem key={crumb.to}>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <>
                    <BreadcrumbLink render={<NavLink to={crumb.to} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                    <BreadcrumbSeparator>
                      <ChevronRight />
                    </BreadcrumbSeparator>
                  </>
                )}
              </BreadcrumbItem>
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
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
