import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Fuel,
  MapPin,
  Tractor,
  BarChart3,
  ShieldCheck,
  Settings,
  ClipboardList,
  ShoppingCart,
  Wrench,
  Warehouse,
  FileText,
  Receipt,
  Building2,
  CalendarClock,
  CalendarDays,
  History,
  DollarSign,
  Lock,
  LogOut,
  CreditCard,
  MessageSquareWarning,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_LABELS_NEW } from '@/lib/constants'
import type { UserRoleEnum } from '@/lib/database.types'
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
  /** Restrict this item to a subset of the module's allowedRoles. If unset,
   *  the item is visible to everyone who can see the module. */
  allowedRoles?: UserRoleEnum[]
}

interface NavSection {
  heading: string
  items: NavItem[]
}

// ─── Module-based navigation ─────────────────────────────────────────────────
// Each module is a self-contained workspace.  A user sees the modules their
// roles grant access to.  Items inside a module use absolute paths so the
// sidebar works regardless of where the user is in the tree.

interface ModuleSection extends NavSection {
  /** Roles that can see (and access) this module's group of links. */
  allowedRoles: UserRoleEnum[]
}

const MODULES: ModuleSection[] = [
  {
    heading: 'Dirección',
    allowedRoles: ['admin'],
    items: [
      { label: 'Cockpit', to: '/cockpit', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Almacén',
    allowedRoles: ['admin', 'almacenista', 'compras'],
    items: [
      { label: 'Dashboard',   to: '/almacen',             icon: LayoutDashboard },
      { label: 'Inventario',  to: '/almacen/inventario',  icon: Package },
      { label: 'Entradas',    to: '/almacen/entradas',    icon: ArrowDownToLine },
      { label: 'Salidas',     to: '/almacen/salidas',     icon: ArrowUpFromLine },
      { label: 'Traspasos',   to: '/almacen/traspasos',   icon: ArrowLeftRight },
      { label: 'Diésel',      to: '/almacen/diesel',      icon: Fuel },
      { label: 'Lotes',       to: '/almacen/lotes',       icon: MapPin },
    ],
  },
  {
    heading: 'Compras',
    allowedRoles: ['admin', 'compras'],
    items: [
      { label: 'Dashboard',     to: '/compras',                icon: LayoutDashboard },
      { label: 'Solicitudes',   to: '/compras/requisiciones',  icon: ClipboardList },
      { label: 'Cotizaciones',  to: '/compras/cotizaciones',   icon: FileText },
      { label: 'Órdenes',       to: '/compras/ordenes',        icon: ShoppingCart },
      { label: 'Recepciones',   to: '/compras/recepciones',    icon: ArrowDownToLine },
      { label: 'Facturas',      to: '/compras/facturas',       icon: Receipt },
      { label: 'Cuentas por pagar', to: '/compras/pagos',      icon: CreditCard },
      { label: 'Proveedores',   to: '/compras/proveedores',    icon: Building2 },
    ],
  },
  {
    heading: 'Mantenimiento',
    // El módulo se muestra a roles operativos (almacenista/compras) porque
    // todos pueden reportar problemas vía Solicitudes. Los items internos
    // están filtrados por `allowedRoles` para no exponer las pantallas de
    // mantto (órdenes, equipos, planes) a quien no tiene permiso.
    allowedRoles: ['admin', 'mantenimiento', 'almacenista', 'compras'],
    items: [
      { label: 'Dashboard',         to: '/mantenimiento',           icon: LayoutDashboard, allowedRoles: ['admin', 'mantenimiento'] },
      { label: 'Solicitudes',       to: '/mantenimiento/solicitudes', icon: MessageSquareWarning },
      { label: 'Órdenes de trabajo', to: '/mantenimiento/ordenes',  icon: Wrench, allowedRoles: ['admin', 'mantenimiento'] },
      { label: 'Equipos',           to: '/mantenimiento/equipos',   icon: Tractor, allowedRoles: ['admin', 'mantenimiento'] },
      { label: 'Planes preventivos', to: '/mantenimiento/planes',   icon: CalendarClock, allowedRoles: ['admin', 'mantenimiento'] },
      { label: 'Calendario',        to: '/mantenimiento/calendario', icon: CalendarDays, allowedRoles: ['admin', 'mantenimiento', 'almacenista'] },
      { label: 'Historial',         to: '/mantenimiento/historial', icon: History, allowedRoles: ['admin', 'mantenimiento'] },
    ],
  },
  {
    heading: 'Reportes',
    allowedRoles: ['admin', 'compras', 'mantenimiento'],
    items: [
      { label: 'Reportes', to: '/reportes', icon: BarChart3 },
    ],
  },
  {
    heading: 'Configuración',
    allowedRoles: ['admin'],
    items: [
      { label: 'Organización',   to: '/configuracion',             icon: Settings },
      { label: 'Tipo de cambio', to: '/configuracion/tipo-cambio', icon: DollarSign },
      { label: 'Auditoría',      to: '/configuracion/auditoria',   icon: ShieldCheck },
      { label: 'Cierre temporada', to: '/configuracion/cierre-temporada', icon: Lock },
    ],
  },
]

function visibleModulesForRoles(roles: UserRoleEnum[]): ModuleSection[] {
  return MODULES
    .filter((m) => m.allowedRoles.some((r) => roles.includes(r)))
    .map((m) => ({
      ...m,
      items: m.items.filter((it) =>
        !it.allowedRoles || it.allowedRoles.some((r) => roles.includes(r)),
      ),
    }))
    .filter((m) => m.items.length > 0)
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
      {/* Tile uses forest-green primary; a thin amber underline ties to the
          'trigo maduro' accent used in PageHeader */}
      <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <Warehouse className="size-4" strokeWidth={2} />
        <span aria-hidden className="absolute -bottom-0.5 left-1.5 right-1.5 h-[1.5px] rounded-full bg-warning/70" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            AgriStock
          </span>
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/80 mt-0.5">
            Campo · Almacén
          </span>
        </div>
      )}
    </div>
  )
}

// ─── User footer ──────────────────────────────────────────────────────────────

function UserFooter() {
  const { profile, primaryRole, signOut } = useAuth()
  const { state } = useSidebar()
  const navigate = useNavigate()
  const collapsed = state === 'collapsed'

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-1">
        <Avatar className="size-7">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex items-center gap-2.5 text-sm">
        <Avatar className="size-7">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-sidebar-foreground leading-tight">
            {profile?.full_name ?? '—'}
          </p>
          <p className="truncate text-[11px] text-sidebar-foreground/60 leading-tight">
            {primaryRole ? ROLE_LABELS_NEW[primaryRole] : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
      >
        <LogOut className="size-3.5" />
        Cerrar sesión
      </button>
    </div>
  )
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function NavMenuItem({ item, isDashboard }: { item: NavItem; isDashboard: boolean }) {
  const location = useLocation()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const collapsed = state === 'collapsed'

  // For dashboard (module landing), require exact match so deeper routes
  // don't keep the dashboard highlighted.  Other items use prefix match.
  const isActive = isDashboard
    ? location.pathname === item.to || location.pathname === `${item.to}/`
    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <NavLink
            to={item.to}
            end={isDashboard}
            onClick={() => { if (isMobile) setOpenMobile(false) }}
          />
        }
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
  const { roles } = useAuth()
  const modules = visibleModulesForRoles(roles)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border pb-2">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="py-2">
        {modules.map((module) => (
          <SidebarGroup key={module.heading}>
            <SidebarGroupLabel>{module.heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {module.items.map((item, idx) => (
                  <NavMenuItem
                    key={item.to}
                    item={item}
                    isDashboard={idx === 0}
                  />
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
