/**
 * Notification bell — header dropdown that surfaces role-relevant pending
 * events sourced from `get_user_notifications` (migration 035).
 *
 * Rendered inside `AppHeader` between the search box and the user menu.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  ClipboardList,
  DollarSign,
  Wrench,
  AlertTriangle,
  Fuel,
} from 'lucide-react'

import { cn, formatRelativo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  useNotifications,
  type NotificationKind,
  type NotificationRow,
} from '@/features/notifications/hooks'
import { useNotificationReads } from '@/features/notifications/read-state'
import { useAuth } from '@/hooks/use-auth'

// ─── Icon mapping per notification kind ─────────────────────────────────────

const KIND_META: Record<NotificationKind, { Icon: typeof Bell; color: string }> = {
  requisition_pending: { Icon: ClipboardList,  color: 'text-warning' },
  quotes_ready:        { Icon: DollarSign,     color: 'text-success' },
  wo_open:             { Icon: Wrench,         color: 'text-usd' },
  low_stock:           { Icon: AlertTriangle,  color: 'text-destructive' },
  tank_low_level:      { Icon: Fuel,           color: 'text-destructive' },
}

// ─── Row ────────────────────────────────────────────────────────────────────

function NotificationItem({
  row,
  onSelect,
}: {
  row: NotificationRow
  onSelect: (path: string) => void
}) {
  const { Icon, color } = KIND_META[row.kind] ?? KIND_META.requisition_pending

  return (
    <button
      type="button"
      onClick={() => onSelect(row.link_path)}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left',
        'border-b border-border last:border-b-0',
        'hover:bg-muted/50 transition-colors',
        'focus-visible:outline-none focus-visible:bg-muted/50'
      )}
    >
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className={cn('size-4', color)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
        {row.subtitle && (
          <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatRelativo(row.created_at)}
        </p>
      </div>
    </button>
  )
}

// ─── Bell ───────────────────────────────────────────────────────────────────

export function NotificationsBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useNotifications()
  const { user } = useAuth()
  const { reads, markRead } = useNotificationReads(user?.id)

  const rows = data ?? []
  const count = rows.filter((r) => !reads.has(r.link_path)).length

  const handleSelect = (path: string) => {
    markRead(path)
    setOpen(false)
    navigate(path)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Notificaciones"
            className="relative"
          />
        }
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5',
              'flex size-4 items-center justify-center rounded-full',
              'bg-destructive text-[10px] font-bold leading-none text-destructive-foreground'
            )}
            aria-label={`${count} notificaciones sin leer`}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notificaciones</span>
          {count > 0 && (
            <span className="text-xs text-muted-foreground">
              {count} pendiente{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Cargando…
            </div>
          ) : isError ? (
            <div className="px-4 py-8 text-center text-sm text-destructive">
              No se pudieron cargar las notificaciones
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="size-6 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Sin notificaciones</p>
            </div>
          ) : (
            rows.map((row, idx) => (
              <NotificationItem
                key={`${row.kind}-${row.link_path}-${idx}`}
                row={row}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-center">
          {/* TODO: build the full /notificaciones page (history + filters). */}
          <button
            type="button"
            onClick={() => handleSelect('/notificaciones')}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todo
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
