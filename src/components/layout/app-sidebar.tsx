import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Fuel,
  MapPin,
  Tractor,
  BarChart3,
  ShieldCheck,
  Settings,
  ClipboardList,
  Warehouse,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_LABELS, ROLE_ROUTES } from '@/lib/constants'
import type { UserRole } from '@/lib/database.types'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// ─── Nav item types ─────────────────────────────────────────────────────────

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
}

interface NavSection {
  heading: string
  items: NavItem[]
}

// ─── Navigation definitions per role ─────────────────────────────────────────

const ADMIN_NAV: NavSection[] = [
  {
    heading: 'Operación',
    items: [
      { label: 'Dashboard',   to: '',              icon: LayoutDashboard },
      { label: 'Inventario',  to: '/inventario',   icon: Package },
      { label: 'Entradas',    to: '/entradas',     icon: ArrowDownToLine },
      { label: 'Salidas',     to: '/salidas',      icon: ArrowUpFromLine },
      { label: 'Diésel',      to: '/diesel',       icon: Fuel },
    ],
  },
  {
    heading: 'Análisis',
    items: [
      { label: 'Lotes',       to: '/lotes',        icon: MapPin },
      { label: 'Equipos',     to: '/equipos',      icon: Tractor },
      { label: 'Reportes',    to: '/reportes',     icon: BarChart3 },
    ],
  },
  {
    heading: 'Sistema',
    items: [
      { label: 'Auditoría',      to: '/auditoria',     icon: ShieldCheck },
      { label: 'Configuración',  to: '/configuracion', icon: Settings },
    ],
  },
]

const ALMACENISTA_NAV: NavSection[] = [
  {
    heading: 'Operación',
    items: [
      { label: 'Dashboard',   to: '',             icon: LayoutDashboard },
      { label: 'Inventario',  to: '/inventario',  icon: Package },
      { label: 'Entradas',    to: '/entradas',    icon: ArrowDownToLine },
      { label: 'Salidas',     to: '/salidas',     icon: ArrowUpFromLine },
      { label: 'Diésel',      to: '/diesel',      icon: Fuel },
    ],
  },
]

const SUPERVISOR_NAV: NavSection[] = [
  {
    heading: 'Operación',
    items: [
      { label: 'Dashboard',    to: '',              icon: LayoutDashboard },
      { label: 'Solicitudes',  to: '/solicitudes',  icon: ClipboardList },
    ],
  },
]

function navSectionsForRole(role: UserRole | undefined): NavSection[] {
  if (!role) return []
  if (role === 'super_admin' || role === 'gerente') return ADMIN_NAV
  if (role === 'almacenista') return ALMACENISTA_NAV
  if (role === 'supervisor') return SUPERVISOR_NAV
  return []
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-2 py-1 select-none',
      collapsed && 'justify-center'
    )}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Warehouse className="size-4" />
      </div>
      {!collapsed && (
        <span className="font-heading text-[15px] font-semibold tracking-tight text-foreground">
          AgriStock
        </span>
      )}
    </div>
  )
}

// ─── User footer ──────────────────────────────────────────────────────────────

function UserFooter() {
  const { profile } = useAuth()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 py-1">
        <Avatar className="size-7">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm">
      <Avatar className="size-7">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-sidebar-foreground leading-tight">
          {profile?.full_name ?? '—'}
        </p>
        <p className="truncate text-[11px] text-sidebar-foreground/60 leading-tight">
          {profile?.role ? ROLE_LABELS[profile.role] : ''}
        </p>
      </div>
    </div>
  )
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function NavMenuItem({ item, baseRoute }: { item: NavItem; baseRoute: string }) {
  const location = useLocation()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const fullTo = `${baseRoute}${item.to}`

  // Exact match for base route, prefix match for sub-routes
  const isActive = item.to === ''
    ? location.pathname === baseRoute || location.pathname === `${baseRoute}/`
    : location.pathname.startsWith(fullTo)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={fullTo} end={item.to === ''} />}
        isActive={isActive}
        tooltip={collapsed ? item.label : undefined}
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { profile } = useAuth()
  const role = profile?.role
  const sections = navSectionsForRole(role)
  const baseRoute = role ? ROLE_ROUTES[role] : '/'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border pb-2">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="py-2">
        {sections.map(section => (
          <SidebarGroup key={section.heading}>
            <SidebarGroupLabel>{section.heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map(item => (
                  <NavMenuItem key={item.to} item={item} baseRoute={baseRoute} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border pt-2">
        <UserFooter />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
