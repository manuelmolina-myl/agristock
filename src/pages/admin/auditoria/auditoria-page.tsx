import { useState, useMemo, useEffect, memo } from 'react'
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Download, Loader2, RotateCcw, Shield } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatFechaCorta, formatHora, formatRelativo, cn } from '@/lib/utils'
import { auditOpColors, auditOpDotColors } from '@/lib/status-colors'
import { formatSupabaseError } from '@/lib/errors'
import { exportToCsv } from '@/lib/csv-export'
import type { AuditLog, Profile } from '@/lib/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50
const CSV_MAX_ROWS = 10_000

const ACTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todas las operaciones' },
  { value: 'INSERT', label: 'INSERT — Creación' },
  { value: 'UPDATE', label: 'UPDATE — Actualización' },
  { value: 'DELETE', label: 'DELETE — Eliminación' },
]

const ALL_USERS = '__all__'
const NULL_USER = '__null__'

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

/** Build a short human-readable diff summary used in the CSV export. */
function diffSummary(entry: AuditLog): string {
  if (entry.action === 'DELETE') return 'eliminado'
  if (entry.action === 'INSERT') return 'creado'
  if (entry.diff) {
    const keys = Object.keys(entry.diff)
    if (keys.length === 0) return 'sin cambios'
    if (keys.length <= 4) return `${keys.join(', ')} cambiado${keys.length > 1 ? 's' : ''}`
    return `${keys.slice(0, 4).join(', ')} (+${keys.length - 4}) cambiados`
  }
  return 'actualizado'
}

/** Hook: debounce a string value by the given delay. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
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

interface TimelineEntryProps {
  entry: AuditLog
  userName: string | null
}

const TimelineEntry = memo(function TimelineEntry({ entry, userName }: TimelineEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff =
    !!entry.before_data || !!entry.after_data || !!entry.diff

  const displayName = userName || entry.user_email || 'Sistema'

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
            {displayName}
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
            {/* DiffViewer renders only when expanded — saves work on long lists. */}
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
})

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Filters {
  table: string
  op: string
  user: string
  from: string
  to: string
}

function readFilters(params: URLSearchParams): Filters {
  return {
    table: params.get('table') ?? '',
    op: params.get('op') ?? 'all',
    user: params.get('user') ?? ALL_USERS,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

/** Apply current filters to a Supabase query builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, orgId: string, filters: Filters) {
  let q = query.eq('organization_id', orgId)
  if (filters.table.trim()) q = q.ilike('entity_type', `%${filters.table.trim()}%`)
  if (filters.op !== 'all') q = q.eq('action', filters.op)
  if (filters.user !== ALL_USERS) {
    q = filters.user === NULL_USER ? q.is('user_id', null) : q.eq('user_id', filters.user)
  }
  if (filters.from) q = q.gte('occurred_at', `${filters.from}T00:00:00`)
  if (filters.to) q = q.lte('occurred_at', `${filters.to}T23:59:59.999`)
  return q
}

export function AuditoriaPage() {
  const { organization } = useAuth()
  const orgId = organization?.id

  // ── Filters in URL search params ──
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  // Local state mirrors the URL only for the text input — so typing doesn't
  // rewrite the URL on every keystroke. Debounced 300 ms then synced.
  const [tableInput, setTableInput] = useState(filters.table)
  useEffect(() => { setTableInput(filters.table) }, [filters.table])
  const debouncedTable = useDebouncedValue(tableInput, 300)
  useEffect(() => {
    if (debouncedTable === filters.table) return
    const next = new URLSearchParams(searchParams)
    if (debouncedTable) next.set('table', debouncedTable)
    else next.delete('table')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTable])

  function updateParam(key: keyof Filters, value: string, defaultValue: string) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === defaultValue) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function resetFilters() {
    setTableInput('')
    setSearchParams({}, { replace: true })
  }

  // ── Distinct users (for the user filter dropdown) ──
  const { data: userOptions = [] } = useQuery<Array<{ id: string | null; label: string }>>({
    queryKey: ['audit-log-users', orgId],
    queryFn: async () => {
      // Pull distinct user_id + user_email from the org's audit_log, then join
      // against profiles for the display name. We cap at 1000 to be defensive
      // — the rendered Select would not be usable beyond that anyway.
      const { data: rows, error } = await db
        .from('audit_log')
        .select('user_id, user_email')
        .eq('organization_id', orgId)
        .limit(1000)
      if (error) throw error

      const seen = new Map<string, { id: string | null; email: string | null }>()
      for (const r of rows as Array<{ user_id: string | null; user_email: string | null }>) {
        const key = r.user_id ?? '__null__'
        if (!seen.has(key)) seen.set(key, { id: r.user_id, email: r.user_email })
      }

      // Fetch profile names in bulk.
      const ids = Array.from(seen.values()).map((v) => v.id).filter(Boolean) as string[]
      const profileMap = new Map<string, string>()
      if (ids.length > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        for (const p of (profiles as Profile[] | null) ?? []) {
          if (p.full_name) profileMap.set(p.id, p.full_name)
        }
      }

      const out: Array<{ id: string | null; label: string }> = []
      for (const v of seen.values()) {
        if (v.id === null) {
          out.push({ id: null, label: 'Sistema (sin usuario)' })
        } else {
          out.push({
            id: v.id,
            label: profileMap.get(v.id) ?? v.email ?? v.id.slice(0, 8),
          })
        }
      }
      return out.sort((a, b) => a.label.localeCompare(b.label))
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  // Lookup map for rendering each row's user display name.
  const userNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of userOptions) if (u.id) m.set(u.id, u.label)
    return m
  }, [userOptions])

  // ── Total count (separate head-only query) ──
  const { data: totalCount } = useQuery<number>({
    queryKey: ['audit-log-count', orgId, filters],
    queryFn: async () => {
      const base = db.from('audit_log').select('id', { count: 'exact', head: true })
      const { count, error } = await applyFilters(base, orgId!, filters)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!orgId,
  })

  // ── Cursor-paginated rows ──
  type Cursor = { occurred_at: string; id: number } | undefined

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<AuditLog[], Error, InfiniteData<AuditLog[], Cursor>, readonly unknown[], Cursor>({
    queryKey: ['audit-log-page', orgId, filters],
    enabled: !!orgId,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      let q = db.from('audit_log').select('*')
      q = applyFilters(q, orgId!, filters)
      // Cursor: rows strictly older than the last seen (occurred_at, id).
      // Newest-first ordering — for two rows with the same timestamp, fall
      // back to id so we don't skip or duplicate.
      if (pageParam) {
        q = q.or(
          `occurred_at.lt.${pageParam.occurred_at},and(occurred_at.eq.${pageParam.occurred_at},id.lt.${pageParam.id})`,
        )
      }
      const { data, error } = await q
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (error) throw error
      return (data as AuditLog[]) ?? []
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined
      const tail = lastPage[lastPage.length - 1]
      return { occurred_at: tail.occurred_at, id: tail.id }
    },
    refetchInterval: 60_000,
  })

  const rows = useMemo(() => data?.pages.flat() ?? [], [data])

  // ── CSV export ──
  const [isExporting, setIsExporting] = useState(false)
  async function handleExportCsv() {
    if (!orgId) return
    setIsExporting(true)
    try {
      let q = db.from('audit_log').select('*')
      q = applyFilters(q, orgId, filters)
      const { data, error } = await q
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CSV_MAX_ROWS)
      if (error) throw error
      const exportRows = (data as AuditLog[]) ?? []
      if (exportRows.length === 0) {
        toast.info('Sin datos para exportar')
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      exportToCsv({
        filename: `auditoria-${today}.csv`,
        headers: ['occurred_at', 'table_name', 'operation', 'user_name', 'record_id', 'diff_summary'],
        rows: exportRows.map((r) => [
          r.occurred_at,
          r.entity_type,
          r.action,
          (r.user_id && userNameById.get(r.user_id)) || r.user_email || '',
          r.entity_id ?? '',
          diffSummary(r),
        ]),
      })
      const capped = exportRows.length >= CSV_MAX_ROWS
      toast.success(
        capped
          ? `Exportadas ${CSV_MAX_ROWS} filas (límite alcanzado)`
          : `Exportadas ${exportRows.length} filas`,
      )
    } catch (e) {
      const { title, description } = formatSupabaseError(e, 'No se pudo exportar el CSV')
      toast.error(title, { description })
    } finally {
      setIsExporting(false)
    }
  }

  const hasActiveFilters =
    !!filters.table ||
    filters.op !== 'all' ||
    filters.user !== ALL_USERS ||
    !!filters.from ||
    !!filters.to

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Table name search */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Tabla</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Buscar tabla..."
                value={tableInput}
                onChange={(e) => setTableInput(e.target.value)}
              />
            </div>

            {/* Operation */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Operación</Label>
              <Select
                value={filters.op}
                onValueChange={(v) => v && updateParam('op', v, 'all')}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Operación" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Usuario</Label>
              <Select
                value={filters.user}
                onValueChange={(v) => v && updateParam('user', v, ALL_USERS)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Usuario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS}>Todos los usuarios</SelectItem>
                  {userOptions.map((u) => (
                    <SelectItem key={u.id ?? NULL_USER} value={u.id ?? NULL_USER}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.from}
                onChange={(e) => updateParam('from', e.target.value, '')}
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.to}
                onChange={(e) => updateParam('to', e.target.value, '')}
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {typeof totalCount === 'number'
                ? `Mostrando ${rows.length} de ${totalCount} eventos`
                : 'Cargando…'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
              >
                <RotateCcw className="mr-1 size-3.5" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={handleExportCsv}
                disabled={isExporting || !orgId}
              >
                {isExporting ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1 size-3.5" />
                )}
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Timeline ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Shield className="size-4" />
            Registro de actividad
            {typeof totalCount === 'number' && (
              <Badge variant="secondary" className="ml-1 text-xs font-normal">
                {totalCount} entradas
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
                {formatSupabaseError(error, 'Error al cargar el registro de auditoría').description}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          ) : !rows.length ? (
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
            <ScrollArea className="max-h-[calc(100vh-22rem)]">
              <div className="pr-4">
                {rows.map((entry) => (
                  <TimelineEntry
                    key={entry.id}
                    entry={entry}
                    userName={entry.user_id ? userNameById.get(entry.user_id) ?? null : null}
                  />
                ))}
              </div>

              {/* Cargar más */}
              <div className="mt-2 flex items-center justify-center pr-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                      Cargando…
                    </>
                  ) : hasNextPage ? (
                    'Cargar más'
                  ) : (
                    'No hay más eventos'
                  )}
                </Button>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AuditoriaPage
