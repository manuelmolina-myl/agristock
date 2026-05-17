/**
 * /notificaciones — inbox completo.
 *
 * Lista todas las notificaciones del usuario filtrables por estado (todas /
 * sin leer) y por tipo (requisiciones, cotizaciones, OTs, bajo reorden).
 * El estado de leído se guarda en localStorage por usuario — sin migración
 * necesaria.  Al hacer click en una notificación se marca como leída y se
 * navega al recurso.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ClipboardList,
  DollarSign,
  Wrench,
  AlertTriangle,
  Check,
  CheckCheck,
  Inbox,
} from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/features/notifications/hooks'
import { useNotificationReads } from '@/features/notifications/read-state'
import type { NotificationRow, NotificationKind } from '@/features/notifications/hooks'
import { formatRelativo } from '@/lib/utils'

import { PageHeader } from '@/components/custom/page-header'
import { EmptyState } from '@/components/custom/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type StateFilter = 'all' | 'unread'
type KindFilter = 'all' | NotificationKind

const KIND_CONFIG: Record<NotificationKind, { icon: React.ElementType; tone: string; bg: string; label: string }> = {
  requisition_pending: { icon: ClipboardList, tone: 'text-warning',    bg: 'bg-warning/10',    label: 'Requisiciones' },
  quotes_ready:        { icon: DollarSign,    tone: 'text-success',    bg: 'bg-success/10',    label: 'Cotizaciones' },
  wo_open:             { icon: Wrench,        tone: 'text-usd',        bg: 'bg-usd/10',        label: 'OTs abiertas' },
  low_stock:           { icon: AlertTriangle, tone: 'text-destructive', bg: 'bg-destructive/10', label: 'Bajo reorden' },
}

export default function NotificacionesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const notifQuery = useNotifications()
  const { reads, markRead, markUnread, markAllRead } = useNotificationReads(user?.id)

  const [stateFilter, setStateFilter] = useState<StateFilter>('unread')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const notifications: NotificationRow[] = notifQuery.data ?? []

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (kindFilter !== 'all' && n.kind !== kindFilter) return false
      const isRead = reads.has(n.link_path)
      if (stateFilter === 'unread' && isRead) return false
      return true
    })
  }, [notifications, reads, stateFilter, kindFilter])

  const unreadCount = useMemo(() => notifications.filter((n) => !reads.has(n.link_path)).length, [notifications, reads])

  function openOne(n: NotificationRow) {
    markRead(n.link_path)
    navigate(n.link_path)
  }

  function markAll() {
    markAllRead(notifications.map((n) => n.link_path))
  }

  const isError = notifQuery.isError
  const isLoading = notifQuery.isLoading

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl mx-auto w-full">
      <PageHeader
        title="Notificaciones"
        description={
          isLoading
            ? 'Cargando…'
            : unreadCount > 0
              ? `${unreadCount} sin leer · ${notifications.length} en total`
              : `${notifications.length} en total`
        }
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="mr-1.5 size-3.5" />
              Marcar todas como leídas
            </Button>
          ) : undefined
        }
      />

      {/* State filter */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="Sin leer" active={stateFilter === 'unread'} onClick={() => setStateFilter('unread')} count={unreadCount} />
        <FilterChip label="Todas" active={stateFilter === 'all'} onClick={() => setStateFilter('all')} count={notifications.length} />

        <div className="mx-1 h-5 w-px bg-border" />

        <FilterChip label="Tipo: todos" active={kindFilter === 'all'} onClick={() => setKindFilter('all')} />
        {(Object.keys(KIND_CONFIG) as NotificationKind[]).map((k) => (
          <FilterChip
            key={k}
            label={KIND_CONFIG[k].label}
            active={kindFilter === k}
            onClick={() => setKindFilter(k)}
            count={notifications.filter((n) => n.kind === k).length}
          />
        ))}
      </div>

      {/* List */}
      {isError ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="El sistema de notificaciones aún no está activo"
          description="El administrador debe aplicar la migración 035 para habilitar las notificaciones."
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={stateFilter === 'unread' ? 'Sin notificaciones sin leer' : 'No hay notificaciones'}
          description={
            stateFilter === 'unread'
              ? 'Estás al día. Las nuevas alertas aparecerán aquí.'
              : 'Tu bandeja está vacía.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((n) => (
            <NotificationItem
              key={n.link_path + n.created_at}
              n={n}
              isRead={reads.has(n.link_path)}
              onOpen={() => openOne(n)}
              onToggleRead={() => (reads.has(n.link_path) ? markUnread(n.link_path) : markRead(n.link_path))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function NotificationItem({
  n,
  isRead,
  onOpen,
  onToggleRead,
}: {
  n: NotificationRow
  isRead: boolean
  onOpen: () => void
  onToggleRead: () => void
}) {
  const cfg = KIND_CONFIG[n.kind]
  const Icon = cfg.icon

  return (
    <li>
      <div
        className={`group flex items-start gap-3 rounded-xl border p-3 transition-colors ${
          isRead
            ? 'border-border bg-card'
            : 'border-primary/30 bg-card shadow-sm'
        }`}
      >
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
          <Icon className={`size-4 ${cfg.tone}`} strokeWidth={1.75} />
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <p className={`text-sm truncate ${isRead ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
              {n.title}
            </p>
            {!isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
          </div>
          {n.subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{n.subtitle}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">{formatRelativo(n.created_at)}</p>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          onClick={onToggleRead}
          aria-label={isRead ? 'Marcar como no leída' : 'Marcar como leída'}
        >
          <Check className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}
