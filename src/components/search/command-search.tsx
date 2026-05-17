import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Fuel,
  MapPin,
  Wrench,
  FileText,
  LogIn,
  LogOut,
  ClipboardList,
  Truck,
  HardHat,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
import { useRecents } from '@/features/recents/store'
import { Clock } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SearchItem {
  id: string
  name: string
  sku: string
}

interface SearchSupplier {
  id: string
  name: string
  rfc: string | null
}

interface SearchEquipment {
  id: string
  internal_code: string | null
  name: string
}

interface SearchRequisition {
  id: string
  folio: string
  notes: string | null
}

interface SearchWorkOrder {
  id: string
  folio: string
  description: string | null
}

// ─── Static navigation entries ────────────────────────────────────────────────

function useNavItems(basePath: string) {
  const { primaryRole } = useAuth()

  const items = [
    { label: 'Dashboard',   path: basePath,                     icon: LayoutDashboard },
    { label: 'Inventario',  path: `${basePath}/inventario`,     icon: Package },
    { label: 'Entradas',    path: `${basePath}/entradas`,       icon: LogIn },
    { label: 'Salidas',     path: `${basePath}/salidas`,        icon: LogOut },
    { label: 'Traspasos',   path: `${basePath}/traspasos`,      icon: ArrowLeftRight },
    { label: 'Reportes',    path: `${basePath}/reportes`,       icon: BarChart3 },
    { label: 'Diésel',      path: `${basePath}/diesel`,         icon: Fuel },
    { label: 'Lotes',       path: `${basePath}/lotes`,          icon: MapPin },
    { label: 'Equipos',     path: `${basePath}/equipos`,        icon: Wrench },
    { label: 'Auditoría',   path: `${basePath}/auditoria`,      icon: FileText },
    { label: 'Configuración', path: `${basePath}/configuracion`, icon: Settings },
  ]

  // Restrict by role (4-role model).
  if (primaryRole === 'compras') {
    return items.filter((i) => ['Dashboard', 'Inventario'].includes(i.label))
  }
  if (primaryRole === 'mantenimiento') {
    return items.filter((i) => ['Dashboard', 'Equipos'].includes(i.label))
  }
  if (primaryRole === 'almacenista') {
    return items.filter((i) => !['Reportes', 'Auditoría', 'Configuración'].includes(i.label))
  }
  // admin: everything.
  return items
}

// ─── CommandSearch component ──────────────────────────────────────────────────

export function CommandSearch() {
  const [open, setOpen]       = useState(false)
  const navigate               = useNavigate()
  const basePath               = useBasePath()
  const { organization, activeSeason, user } = useAuth()
  const navItems               = useNavItems(basePath)
  const recents                = useRecents(user?.id).slice(0, 6)

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Inventory items search
  const { data: items = [] } = useQuery<SearchItem[]>({
    queryKey: ['search-items', { orgId: organization?.id, seasonId: activeSeason?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('items')
        .select('id, name, sku')
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
        .order('name')
        .limit(100)
      if (error) throw error
      return data as SearchItem[]
    },
    enabled: !!organization?.id && open,
    staleTime: 60_000,
  })

  // Suppliers search
  const { data: suppliers = [] } = useQuery<SearchSupplier[]>({
    queryKey: ['search-suppliers', { orgId: organization?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('suppliers')
        .select('id, name, rfc')
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
        .order('name')
        .limit(60)
      if (error) throw error
      return data as SearchSupplier[]
    },
    enabled: !!organization?.id && open,
    staleTime: 60_000,
  })

  // Equipment search
  const { data: equipment = [] } = useQuery<SearchEquipment[]>({
    queryKey: ['search-equipment', { orgId: organization?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('equipment')
        .select('id, internal_code, name')
        .eq('organization_id', organization?.id)
        .order('name')
        .limit(60)
      if (error) throw error
      return data as SearchEquipment[]
    },
    enabled: !!organization?.id && open,
    staleTime: 60_000,
  })

  // Purchase requisitions search (active ones)
  const { data: requisitions = [] } = useQuery<SearchRequisition[]>({
    queryKey: ['search-requisitions', { orgId: organization?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_requisitions')
        .select('id, folio, notes')
        .eq('organization_id', organization?.id)
        .in('status', ['draft', 'submitted', 'approved', 'in_quotation', 'ordered'])
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data as SearchRequisition[]
    },
    enabled: !!organization?.id && open,
    staleTime: 30_000,
  })

  // Work orders search (open)
  const { data: workOrders = [] } = useQuery<SearchWorkOrder[]>({
    queryKey: ['search-work-orders', { orgId: organization?.id }],
    queryFn: async () => {
      const { data, error } = await db
        .from('work_orders')
        .select('id, folio, description')
        .eq('organization_id', organization?.id)
        .in('status', ['reported', 'scheduled', 'assigned', 'in_progress', 'waiting_parts'])
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data as SearchWorkOrder[]
    },
    enabled: !!organization?.id && open,
    staleTime: 30_000,
  })

  const go = useCallback((path: string) => {
    setOpen(false)
    navigate(path)
  }, [navigate])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar en AgriStock…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {/* Recents — shown first when there is history */}
        {recents.length > 0 && (
          <>
            <CommandGroup heading="Recientes">
              {recents.map((r) => (
                <CommandItem
                  key={`${r.kind}-${r.id}`}
                  value={`reciente ${r.label} ${r.sublabel ?? ''}`}
                  onSelect={() => go(r.linkPath)}
                >
                  <Clock className="mr-2 size-4 text-muted-foreground" />
                  <span className="truncate">{r.label}</span>
                  {r.sublabel && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">{r.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navegación">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.path}
                value={item.label}
                onSelect={() => go(item.path)}
              >
                <Icon className="mr-2 size-4 text-muted-foreground" />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {/* Quick actions */}
        <CommandSeparator />
        <CommandGroup heading="Acciones rápidas">
          <CommandItem value="nueva entrada" onSelect={() => go(`${basePath}/entradas/nueva`)}>
            <LogIn className="mr-2 size-4 text-success" />
            Nueva entrada
          </CommandItem>
          <CommandItem value="nueva salida" onSelect={() => go(`${basePath}/salidas/nueva`)}>
            <LogOut className="mr-2 size-4 text-destructive" />
            Nueva salida
          </CommandItem>
          <CommandItem value="nuevo item articulo inventario" onSelect={() => go(`${basePath}/inventario/nuevo`)}>
            <Package className="mr-2 size-4 text-usd" />
            Nuevo artículo
          </CommandItem>
        </CommandGroup>

        {/* Inventory items */}
        {items.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Artículos de inventario">
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.sku} ${item.name}`}
                  onSelect={() => go(`${basePath}/inventario/${item.id}`)}
                >
                  <Package className="mr-2 size-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground mr-2">{item.sku}</span>
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Suppliers */}
        {suppliers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Proveedores">
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`proveedor ${s.name} ${s.rfc ?? ''}`}
                  onSelect={() => go(`/compras/proveedores/${s.id}`)}
                >
                  <Truck className="mr-2 size-4 text-muted-foreground" />
                  {s.name}
                  {s.rfc && <span className="ml-2 text-xs text-muted-foreground font-mono">{s.rfc}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Equipment */}
        {equipment.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Equipos">
              {equipment.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`equipo ${e.internal_code ?? ''} ${e.name}`}
                  onSelect={() => go(`/mantenimiento/equipos/${e.id}`)}
                >
                  <HardHat className="mr-2 size-4 text-muted-foreground" />
                  {e.internal_code && <span className="font-mono text-xs text-muted-foreground mr-2">{e.internal_code}</span>}
                  {e.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Active requisitions */}
        {requisitions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Requisiciones activas">
              {requisitions.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`requisicion ${r.folio} ${r.notes ?? ''}`}
                  onSelect={() => go(`/compras/requisiciones/${r.id}`)}
                >
                  <ClipboardList className="mr-2 size-4 text-warning" />
                  <span className="font-mono text-xs text-muted-foreground mr-2">{r.folio}</span>
                  {r.notes ?? 'Sin notas'}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Open work orders */}
        {workOrders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="OTs abiertas">
              {workOrders.map((wo) => (
                <CommandItem
                  key={wo.id}
                  value={`ot ${wo.folio} ${wo.description ?? ''}`}
                  onSelect={() => go(`/mantenimiento/ordenes/${wo.id}`)}
                >
                  <Wrench className="mr-2 size-4 text-usd" />
                  <span className="font-mono text-xs text-muted-foreground mr-2">{wo.folio}</span>
                  {wo.description ?? 'Sin descripción'}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Reports */}
        <CommandSeparator />
        <CommandGroup heading="Reportes">
          {[
            { slug: 'kardex',             label: 'Kardex General' },
            { slug: 'existencias',        label: 'Existencias Valuadas' },
            { slug: 'salidas-lote',       label: 'Salidas por Lote' },
            { slug: 'consumo-diesel',     label: 'Consumo Diésel' },
            { slug: 'variacion-precios',  label: 'Variación de Precios' },
          ].map((r) => (
            <CommandItem
              key={r.slug}
              value={`reporte ${r.label}`}
              onSelect={() => go(`${basePath}/reportes/${r.slug}`)}
            >
              <BarChart3 className="mr-2 size-4 text-muted-foreground" />
              {r.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
