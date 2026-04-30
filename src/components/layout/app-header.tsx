import { Fragment } from 'react'
import { useLocation, NavLink, useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/contexts/page-title-context'
import { Sun, Moon, Search, LogOut, ChevronRight, Bell, AlertTriangle, ClipboardList } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/hooks/use-theme'
import { useBasePath } from '@/hooks/use-base-path'
import { ROLE_LABELS, ROLE_ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const { profile } = useAuth()
  const { titles } = usePageTitle()
  const location = useLocation()
  const basePath = profile?.role ? ROLE_ROUTES[profile.role] : ''
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
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

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
            {profile?.role && (
              <span className="text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[profile.role]}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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

// ─── Notification bell ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface LowStockItem { id: string; name: string; sku: string; quantity: number }
interface PendingSolicitud { id: string }

function useNotifications(orgId: string | undefined, seasonId: string | undefined, canSeeAlerts: boolean, canSeeSolicitudes: boolean) {
  const lowStockQ = useQuery<LowStockItem[]>({
    queryKey: ['notif-low-stock', orgId, seasonId],
    queryFn: async () => {
      const { data, error } = await db
        .from('item_stock')
        .select('item_id, quantity, item:items!inner(id, name, sku, reorder_point)')
        .eq('season_id', seasonId)
        .gt('item.reorder_point', 0)
      if (error) throw error
      const rows = data as Array<{ item_id: string; quantity: number; item: { id: string; name: string; sku: string; reorder_point: number } }>
      return rows
        .filter((r) => r.quantity < r.item.reorder_point)
        .map((r) => ({ id: r.item.id, name: r.item.name, sku: r.item.sku, quantity: r.quantity }))
        .slice(0, 10)
    },
    enabled: !!orgId && !!seasonId && canSeeAlerts,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const solicitudesQ = useQuery<PendingSolicitud[]>({
    queryKey: ['notif-solicitudes', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('solicitudes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'pendiente')
      if (error) throw error
      return data as PendingSolicitud[]
    },
    enabled: !!orgId && canSeeSolicitudes,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  return { lowStock: lowStockQ.data ?? [], solicitudes: solicitudesQ.data ?? [] }
}

function NotificationBell() {
  const { organization, activeSeason, profile } = useAuth()
  const navigate = useNavigate()
  const basePath = useBasePath()

  const role = profile?.role
  const canSeeAlerts = role === 'admin' || role === 'super_admin' || role === 'gerente' || role === 'almacenista'
  const canSeeSolicitudes = role === 'admin' || role === 'super_admin' || role === 'gerente'

  const { lowStock, solicitudes } = useNotifications(
    organization?.id,
    activeSeason?.id,
    canSeeAlerts,
    canSeeSolicitudes,
  )

  const totalCount = lowStock.length + solicitudes.length

  if (!canSeeAlerts && !canSeeSolicitudes) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificaciones">
          <Bell className="size-4" />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Notificaciones</span>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground">{totalCount} pendiente{totalCount !== 1 ? 's' : ''}</span>
          )}
        </div>

        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
            <Bell className="size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Sin notificaciones</p>
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {/* Solicitudes pendientes */}
            {solicitudes.length > 0 && (
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`${basePath}/solicitudes`)}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 mt-0.5">
                  <ClipboardList className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''} pendiente{solicitudes.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">Requieren revisión y aprobación</p>
                </div>
              </button>
            )}

            {/* Low stock items */}
            {lowStock.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`${basePath}/inventario/${item.id}`)}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 mt-0.5">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.sku} · Stock: {item.quantity}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
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
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
