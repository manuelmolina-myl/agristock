import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Tractor,
  Clock, AlertOctagon, CheckCircle2,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  isBefore,
  isAfter,
} from 'date-fns'
import { es } from 'date-fns/locale'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { useAuth } from '@/hooks/use-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type ScheduleBucket = 'done' | 'overdue' | 'this_week' | 'upcoming'

interface CalendarPM {
  id: string
  organization_id: string
  folio: string | null
  scheduled_date: string
  status: string | null
  priority: string | null
  equipment_id: string | null
  equipment_name: string | null
  equipment_code: string | null
  equipment_criticality: string | null
  estimated_hours: number | null
  primary_technician_id: string | null
  technician_name: string | null
  task_description: string | null
  schedule_bucket: ScheduleBucket
}

// ─── Bucket styling tokens (Tierra cultivada palette) ──────────────────────

const BUCKET_LABEL: Record<ScheduleBucket, string> = {
  done: 'Completado',
  overdue: 'Vencido',
  this_week: 'Esta semana',
  upcoming: 'Próximo',
}

const BUCKET_PILL: Record<ScheduleBucket, string> = {
  done: 'bg-success/15 text-success border-success/30',
  overdue: 'bg-destructive/15 text-destructive border-destructive/30',
  this_week: 'bg-warning/15 text-warning border-warning/30',
  upcoming: 'bg-card text-foreground border-border',
}

const BUCKET_CELL_BG: Record<ScheduleBucket, string> = {
  done: 'bg-success/15 hover:bg-success/25 border-success/30 text-success',
  overdue: 'bg-destructive/15 hover:bg-destructive/25 border-destructive/30 text-destructive',
  this_week: 'bg-warning/15 hover:bg-warning/25 border-warning/30 text-warning',
  upcoming: 'bg-card hover:bg-muted/60 border-border text-foreground',
}

const BUCKET_DOT: Record<ScheduleBucket, string> = {
  done: 'bg-success',
  overdue: 'bg-destructive',
  this_week: 'bg-warning',
  upcoming: 'bg-muted-foreground/50',
}

// ─── Hook: viewport-driven view selection ──────────────────────────────────

function useMobileViewport(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    if (mql.addEventListener) mql.addEventListener('change', handler)
    else mql.addListener(handler)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler)
      else mql.removeListener(handler)
    }
  }, [breakpoint])

  return isMobile
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function PmCalendarPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { organization } = useAuth()
  const isMobile = useMobileViewport()

  // Month being viewed (state stores a date inside that month)
  const [monthDate, setMonthDate] = useState<Date>(() => new Date())
  // 'grid' (month) or 'list'. On mobile we force 'list' regardless of toggle.
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const effectiveView: 'grid' | 'list' = isMobile ? 'list' : view

  const monthStart = useMemo(() => startOfMonth(monthDate), [monthDate])
  const monthEnd = useMemo(() => endOfMonth(monthDate), [monthDate])
  const monthKey = format(monthStart, 'yyyy-MM')

  const { data: pms = [], isLoading, isError, error } = useQuery<CalendarPM[]>({
    queryKey: ['pm-calendar', { orgId: organization?.id, month: monthKey }],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error: qErr } = await db
        .from('pm_schedule_calendar')
        .select('*')
        .gte('scheduled_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('scheduled_date', format(monthEnd, 'yyyy-MM-dd'))
        .order('scheduled_date', { ascending: true })
      if (qErr) throw qErr
      return (data ?? []) as CalendarPM[]
    },
  })

  // Surface query errors as toast for parity with the rest of the module.
  useEffect(() => {
    if (!isError) return
    const { title, description } = formatSupabaseError(error, 'No se pudo cargar el calendario')
    toast.error(title, { description })
  }, [isError, error])

  // Group PMs by ISO date (yyyy-MM-dd) for fast lookup in the grid cells.
  const pmsByDate = useMemo(() => {
    const map = new Map<string, CalendarPM[]>()
    for (const pm of pms) {
      const key = pm.scheduled_date.slice(0, 10)
      const arr = map.get(key)
      if (arr) arr.push(pm)
      else map.set(key, [pm])
    }
    return map
  }, [pms])

  const goPrev = () => setMonthDate((d) => subMonths(d, 1))
  const goNext = () => setMonthDate((d) => addMonths(d, 1))
  const goToday = () => setMonthDate(new Date())

  const handlePmClick = (pm: CalendarPM) => {
    navigate(`/mantenimiento/ordenes/${pm.id}`, {
      state: { from: location.pathname },
    })
  }

  const monthLabel = format(monthStart, "LLLL yyyy", { locale: es })
  const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Calendario de Preventivos"
        description="Mantenimientos programados de los próximos 90 días"
      />

      {/* Toolbar: view toggle + month navigator */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* View toggle (hidden on mobile; mobile always shows the list) */}
        <div className="hidden sm:inline-flex rounded-md border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              view === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="size-3.5" /> Mes
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              view === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="size-3.5" /> Lista
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} className="gap-1">
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="gap-1">
            <CalendarDays className="size-4" />
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} className="gap-1">
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="size-4" />
          </Button>
          <div className="min-w-[10rem] text-right">
            <h2 className="font-heading text-base font-semibold tracking-[-0.01em] text-foreground tabular-nums">
              {monthLabelCap}
            </h2>
          </div>
        </div>
      </div>

      {/* Bucket legend */}
      <BucketLegend />

      {/* Body */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : pms.length === 0 ? (
        <EmptyState
          title="Sin preventivos en este mes"
          description="No hay órdenes preventivas programadas para el periodo seleccionado."
          icon={<CalendarDays className="size-8 text-muted-foreground" strokeWidth={1.5} />}
        />
      ) : effectiveView === 'grid' ? (
        <MonthGrid
          monthDate={monthStart}
          pmsByDate={pmsByDate}
          onPmClick={handlePmClick}
        />
      ) : (
        <ListView
          monthDate={monthStart}
          pms={pms}
          onPmClick={handlePmClick}
        />
      )}
    </div>
  )
}

// ─── Bucket legend ─────────────────────────────────────────────────────────

function BucketLegend() {
  const items: { bucket: ScheduleBucket; icon: typeof Clock }[] = [
    { bucket: 'overdue', icon: AlertOctagon },
    { bucket: 'this_week', icon: Clock },
    { bucket: 'upcoming', icon: CalendarDays },
    { bucket: 'done', icon: CheckCircle2 },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(({ bucket, icon: Icon }) => (
        <span
          key={bucket}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            BUCKET_PILL[bucket],
          )}
        >
          <Icon className="size-3" strokeWidth={1.75} />
          {BUCKET_LABEL[bucket]}
        </span>
      ))}
    </div>
  )
}

// ─── Month grid ────────────────────────────────────────────────────────────

interface MonthGridProps {
  monthDate: Date
  pmsByDate: Map<string, CalendarPM[]>
  onPmClick: (pm: CalendarPM) => void
}

function MonthGrid({ monthDate, pmsByDate, onPmClick }: MonthGridProps) {
  // Generate the 6-week grid (Mon-Sun) covering the visible month.
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 })
  const days: Date[] = []
  let cursor = gridStart
  while (!isAfter(cursor, gridEnd)) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }

  const dayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Day-of-week headers */}
      <div
        className="grid border-b border-border bg-muted/40"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {dayHeaders.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const cellPms = pmsByDate.get(key) ?? []
          const inMonth = isSameMonth(day, monthDate)
          const today = isToday(day)
          return (
            <DayCell
              key={key}
              day={day}
              pms={cellPms}
              inMonth={inMonth}
              isToday={today}
              onPmClick={onPmClick}
            />
          )
        })}
      </div>
    </div>
  )
}

interface DayCellProps {
  day: Date
  pms: CalendarPM[]
  inMonth: boolean
  isToday: boolean
  onPmClick: (pm: CalendarPM) => void
}

function DayCell({ day, pms, inMonth, isToday: today, onPmClick }: DayCellProps) {
  const visible = pms.slice(0, 3)
  const overflow = pms.length - visible.length

  return (
    <div
      className={cn(
        'min-h-[6.5rem] border-b border-r border-border p-1.5 flex flex-col gap-1',
        !inMonth && 'bg-muted/20 text-muted-foreground/60',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums',
            today
              ? 'bg-primary text-primary-foreground'
              : inMonth
              ? 'text-foreground'
              : 'text-muted-foreground/60',
          )}
        >
          {format(day, 'd')}
        </span>
        {pms.length > 0 && (
          <span className="text-[9px] tabular-nums text-muted-foreground">
            {pms.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {visible.map((pm) => (
          <PmChip key={pm.id} pm={pm} onClick={() => onPmClick(pm)} />
        ))}
        {overflow > 0 && (
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="text-left text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted/60"
                >
                  +{overflow} más
                </button>
              }
            />
            <PopoverContent align="start" className="w-72 max-h-80 overflow-auto">
              <div className="flex flex-col gap-1">
                <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {format(day, "EEEE d 'de' LLLL", { locale: es })}
                </div>
                {pms.map((pm) => (
                  <PmRow
                    key={pm.id}
                    pm={pm}
                    onClick={() => onPmClick(pm)}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

// ─── PM chip (used inside day cells) ──────────────────────────────────────

function PmChip({ pm, onClick }: { pm: CalendarPM; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group block w-full rounded border px-1.5 py-1 text-left transition-colors',
        BUCKET_CELL_BG[pm.schedule_bucket],
      )}
      title={`${pm.folio ?? '—'} · ${pm.equipment_name ?? 'Equipo'}`}
    >
      <div className="flex items-center gap-1">
        <span className={cn('size-1.5 shrink-0 rounded-full', BUCKET_DOT[pm.schedule_bucket])} aria-hidden />
        <span className="truncate text-[10px] font-medium tabular-nums">
          {pm.folio ?? 'OT'}
        </span>
      </div>
      <div className="truncate text-[10px] opacity-90">
        {pm.equipment_code ? `${pm.equipment_code} · ` : ''}
        {pm.equipment_name ?? '—'}
      </div>
    </button>
  )
}

// ─── PM row (used inside popovers + list view) ────────────────────────────

function PmRow({ pm, onClick }: { pm: CalendarPM; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2 rounded-md border border-border bg-card p-2 text-left hover:bg-muted/40 transition-colors"
    >
      <span
        className={cn('mt-1 size-2 shrink-0 rounded-full', BUCKET_DOT[pm.schedule_bucket])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium tabular-nums text-xs truncate">
            {pm.folio ?? 'OT'}
          </span>
          <Badge variant="outline" className={cn('text-[9px] border', BUCKET_PILL[pm.schedule_bucket])}>
            {BUCKET_LABEL[pm.schedule_bucket]}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Tractor className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">
            {pm.equipment_code ? `${pm.equipment_code} — ` : ''}
            {pm.equipment_name ?? '—'}
          </span>
        </div>
        {pm.task_description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
            {pm.task_description}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="tabular-nums">
            {format(parseISO(pm.scheduled_date), "d 'de' LLL", { locale: es })}
          </span>
          {pm.technician_name && (
            <span className="truncate">· {pm.technician_name}</span>
          )}
          {pm.estimated_hours != null && (
            <span className="tabular-nums">· {pm.estimated_hours} h</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── List view (mobile fallback + optional desktop toggle) ────────────────

interface ListViewProps {
  monthDate: Date
  pms: CalendarPM[]
  onPmClick: (pm: CalendarPM) => void
}

function ListView({ monthDate, pms, onPmClick }: ListViewProps) {
  // Group by "Hoy / Mañana / Próxima semana / Más adelante / Vencidos".
  const today = new Date()
  const tomorrow = addDays(today, 1)
  const inOneWeek = addDays(today, 7)

  const groups: { key: string; title: string; items: CalendarPM[] }[] = [
    { key: 'overdue', title: 'Vencidos', items: [] },
    { key: 'today', title: 'Hoy', items: [] },
    { key: 'tomorrow', title: 'Mañana', items: [] },
    { key: 'this_week', title: 'Próxima semana', items: [] },
    { key: 'later', title: 'Más adelante', items: [] },
    { key: 'done', title: 'Completados', items: [] },
  ]
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]))

  for (const pm of pms) {
    const d = parseISO(pm.scheduled_date)
    if (pm.schedule_bucket === 'done') {
      byKey.done.items.push(pm)
    } else if (isSameDay(d, today)) {
      byKey.today.items.push(pm)
    } else if (isSameDay(d, tomorrow)) {
      byKey.tomorrow.items.push(pm)
    } else if (isBefore(d, today)) {
      byKey.overdue.items.push(pm)
    } else if (!isAfter(d, inOneWeek)) {
      byKey.this_week.items.push(pm)
    } else {
      byKey.later.items.push(pm)
    }
  }

  const nonEmpty = groups.filter((g) => g.items.length > 0)
  if (nonEmpty.length === 0) {
    return (
      <EmptyState
        title="Sin preventivos en este mes"
        description={`No hay órdenes preventivas programadas en ${format(monthDate, 'LLLL yyyy', { locale: es })}.`}
        icon={<CalendarDays className="size-8 text-muted-foreground" strokeWidth={1.5} />}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {nonEmpty.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">
              {g.title}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              ({g.items.length})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {g.items.map((pm) => (
              <PmRow key={pm.id} pm={pm} onClick={() => onPmClick(pm)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="grid border-b border-border bg-muted/40"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-2 py-1.5">
            <Skeleton className="h-3 w-8 mx-auto" />
          </div>
        ))}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[6.5rem] border-b border-r border-border p-1.5">
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
