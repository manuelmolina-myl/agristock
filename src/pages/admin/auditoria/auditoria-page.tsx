import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Shield } from 'lucide-react'

import { PageHeader } from '@/components/custom/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatFechaCorta, formatHora, formatRelativo, cn } from '@/lib/utils'
import { auditOpColors, auditOpDotColors } from '@/lib/status-colors'
import type { AuditLog } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todas las entidades' },
  { value: 'items', label: 'Artículos' },
  { value: 'stock_movements', label: 'Movimientos de stock' },
  { value: 'stock_movement_lines', label: 'Líneas de movimiento' },
  { value: 'warehouses', label: 'Almacenes' },
  { value: 'suppliers', label: 'Proveedores' },
  { value: 'categories', label: 'Categorías' },
  { value: 'seasons', label: 'Temporadas' },
  { value: 'fx_rates', label: 'Tipos de cambio' },
  { value: 'units', label: 'Unidades' },
  { value: 'equipment', label: 'Equipos' },
  { value: 'employees', label: 'Empleados' },
  { value: 'crops_lots', label: 'Lotes de cultivo' },
]

const ACTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todas las acciones' },
  { value: 'INSERT', label: 'INSERT — Creación' },
  { value: 'UPDATE', label: 'UPDATE — Actualización' },
  { value: 'DELETE', label: 'DELETE — Eliminación' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actionLabel(action: string) {
  const map: Record<string, string> = {
    INSERT: 'Creó',
    UPDATE: 'Actualizó',
    DELETE: 'Eliminó',
  }
  return map[action] ?? action
}

function entityLabel(entity: string) {
  const map: Record<string, string> = {
    items: 'artículo',
    stock_movements: 'movimiento',
    stock_movement_lines: 'línea de movimiento',
    warehouses: 'almacén',
    suppliers: 'proveedor',
    categories: 'categoría',
    seasons: 'temporada',
    fx_rates: 'tipo de cambio',
    adjustment_reasons: 'motivo de ajuste',
    units: 'unidad',
    equipment: 'equipo',
    employees: 'empleado',
    crops_lots: 'lote de cultivo',
  }
  return map[entity] ?? entity
}

function actionBadgeClass(action: string) {
  if (action === 'INSERT') return auditOpColors.INSERT
  if (action === 'DELETE') return auditOpColors.DELETE
  return auditOpColors.UPDATE
}

function dotColor(action: string) {
  if (action === 'INSERT') return auditOpDotColors.INSERT
  if (action === 'DELETE') return auditOpDotColors.DELETE
  return auditOpDotColors.UPDATE
}

function userInitial(email: string | null) {
  if (!email) return '?'
  return email[0].toUpperCase()
}

// ─── Diff viewer ─────────────────────────────────────────────────────────────

interface DiffEntry {
  key: string
  before: unknown
  after: unknown
  changed: boolean
}

function buildDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  diff: Record<string, unknown> | null,
): DiffEntry[] {
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])

  const changedKeys = diff
    ? new Set(Object.keys(diff))
    : allKeys

  return Array.from(allKeys)
    .sort()
    .map((key) => ({
      key,
      before: (before ?? {})[key] ?? null,
      after: (after ?? {})[key] ?? null,
      changed: changedKeys.has(key),
    }))
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '(nulo)'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function DiffViewer({ entry }: { entry: AuditLog }) {
  const rows = useMemo(
    () => buildDiff(entry.before_data, entry.after_data, entry.diff),
    [entry],
  )

  if (entry.action === 'INSERT' && entry.after_data) {
    return (
      <div className="overflow-x-auto rounded-md border bg-muted/40">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-1/3">
                Campo
              </th>
              <th className="px-3 py-2 text-left font-medium text-success">
                Valor creado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(entry.after_data).map(([k, v]) => (
              <tr key={k} className="bg-success/10">
                <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                <td className="px-3 py-1.5 text-foreground whitespace-pre-wrap break-all">
                  + {renderValue(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (entry.action === 'DELETE' && entry.before_data) {
    return (
      <div className="overflow-x-auto rounded-md border bg-muted/40">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-1/3">
                Campo
              </th>
              <th className="px-3 py-2 text-left font-medium text-destructive">
                Valor eliminado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(entry.before_data).map(([k, v]) => (
              <tr key={k} className="bg-destructive/10">
                <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                <td className="px-3 py-1.5 text-foreground whitespace-pre-wrap break-all">
                  - {renderValue(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Sin datos de diff disponibles.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-muted/40">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-1/4">
              Campo
            </th>
            <th className="px-3 py-2 text-left font-medium text-destructive w-[37.5%]">
              Antes
            </th>
            <th className="px-3 py-2 text-left font-medium text-success w-[37.5%]">
              Después
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows
            .filter((r) => r.changed)
            .map((r) => (
              <tr
                key={r.key}
                className="bg-warning/10"
              >
                <td className="px-3 py-1.5 text-muted-foreground font-semibold">
                  {r.key}
                </td>
                <td className="px-3 py-1.5 text-destructive whitespace-pre-wrap break-all">
                  - {renderValue(r.before)}
                </td>
                <td className="px-3 py-1.5 text-success whitespace-pre-wrap break-all">
                  + {renderValue(r.after)}
                </td>
              </tr>
            ))}
          {rows
            .filter((r) => !r.changed)
            .map((r) => (
              <tr key={r.key} className="opacity-40">
                <td className="px-3 py-1.5 text-muted-foreground">{r.key}</td>
                <td className="px-3 py-1.5 text-foreground whitespace-pre-wrap break-all col-span-2">
                  {renderValue(r.before)}
                </td>
                <td className="px-3 py-1.5 text-foreground whitespace-pre-wrap break-all" />
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Timeline entry ───────────────────────────────────────────────────────────

function TimelineEntry({ entry }: { entry: AuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff =
    !!entry.before_data || !!entry.after_data || !!entry.diff

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-background',
            dotColor(entry.action),
          )}
        />
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Action badge */}
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                actionBadgeClass(entry.action),
              )}
            >
              {entry.action}
            </span>

            {/* Entity */}
            <span className="text-sm font-medium text-foreground">
              {actionLabel(entry.action)}{' '}
              <span className="font-semibold">{entityLabel(entry.entity_type)}</span>
            </span>

            {/* Entity ID */}
            {entry.entity_id && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                #{entry.entity_id.slice(0, 8)}
              </span>
            )}
          </div>

          {/* Time */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-muted-foreground" title={entry.occurred_at}>
              {formatRelativo(entry.occurred_at)}
            </span>
          </div>
        </div>

        {/* User + timestamp */}
        <div className="mt-1 flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground select-none">
            {userInitial(entry.user_email)}
          </div>
          <span className="text-xs text-muted-foreground">
            {entry.user_email ?? 'Sistema'}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {formatFechaCorta(entry.occurred_at)} {formatHora(entry.occurred_at)}
          </span>
        </div>

        {/* Expand diff */}
        {hasDiff && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronDown className="mr-1 size-3.5" />
              ) : (
                <ChevronRight className="mr-1 size-3.5" />
              )}
              {expanded ? 'Ocultar cambios' : 'Ver cambios'}
            </Button>
            {expanded && (
              <div className="mt-2">
                <DiffViewer entry={entry} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AuditoriaPage() {
  const { organization } = useAuth()
  const orgId = organization?.id

  // Filters
  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [userSearch, setUserSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery<AuditLog[]>({
    queryKey: ['audit-log-full', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('audit_log')
        .select('*')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as AuditLog[]
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  })

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((entry) => {
      if (entityType !== 'all' && entry.entity_type !== entityType) return false
      if (action !== 'all' && entry.action !== action) return false
      if (
        userSearch &&
        !(entry.user_email ?? '')
          .toLowerCase()
          .includes(userSearch.toLowerCase())
      )
        return false
      if (dateFrom && entry.occurred_at < dateFrom) return false
      if (dateTo) {
        const to = dateTo + 'T23:59:59'
        if (entry.occurred_at > to) return false
      }
      return true
    })
  }, [data, entityType, action, userSearch, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Auditoría"
        description="Registro de actividad del sistema"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Actualizar
          </Button>
        }
      />

      {/* ── Filters ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {/* Entity type */}
            <Select value={entityType} onValueChange={(v) => v && setEntityType(v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Entidad" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action */}
            <Select value={action} onValueChange={(v) => v && setAction(v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* User search */}
            <Input
              className="h-9 text-sm"
              placeholder="Filtrar por usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />

            {/* Date from */}
            <Input
              type="date"
              className="h-9 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />

            {/* Date to */}
            <Input
              type="date"
              className="h-9 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {/* Active filters summary */}
          {(entityType !== 'all' ||
            action !== 'all' ||
            userSearch ||
            dateFrom ||
            dateTo) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setEntityType('all')
                  setAction('all')
                  setUserSearch('')
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Timeline ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Shield className="size-4" />
            Registro de actividad
            {data && (
              <Badge variant="secondary" className="ml-1 text-xs font-normal">
                {filtered.length} entradas
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <Skeleton className="size-2.5 rounded-full" />
                    <div className="mt-1 w-px flex-1 bg-border" style={{ height: 48 }} />
                  </div>
                  <div className="flex-1 space-y-1 pb-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Shield className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Error al cargar el registro de auditoría.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Shield className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Sin registros
              </p>
              <p className="text-xs text-muted-foreground">
                No hay actividad que coincida con los filtros aplicados.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-18rem)]">
              <div className="pr-4">
                {filtered.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AuditoriaPage
