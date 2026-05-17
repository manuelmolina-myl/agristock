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
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useBasePath } from '@/hooks/use-base-path'
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
  const { organization, activeSeason } = useAuth()
  const navItems               = useNavItems(basePath)

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
    queryKey: ['search-items', organization?.id, activeSeason?.id],
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

  const go = useCallback((path: string) => {
    setOpen(false)
    navigate(path)
  }, [navigate])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar en AgriStock…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

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
            <LogIn className="mr-2 size-4 text-emerald-600" />
            Nueva entrada
          </CommandItem>
          <CommandItem value="nueva salida" onSelect={() => go(`${basePath}/salidas/nueva`)}>
            <LogOut className="mr-2 size-4 text-red-600" />
            Nueva salida
          </CommandItem>
          <CommandItem value="nuevo item articulo inventario" onSelect={() => go(`${basePath}/inventario/nuevo`)}>
            <Package className="mr-2 size-4 text-blue-600" />
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
