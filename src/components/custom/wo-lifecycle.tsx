/**
 * WoLifecycle — visualiza el ciclo de vida de una Orden de Trabajo (CMMS)
 * como una fila de pills con la etapa actual resaltada.
 *
 * Happy-path:
 *   Reportada → Programada → Asignada → En proceso → (Esperando partes)
 *               → Completada → Cerrada
 *
 * Off-path terminal: Cancelada — se muestra sola como pill destacada.
 *
 * "Esperando partes" es una rama opcional dentro de la ejecución y se
 * muestra resaltada únicamente cuando el WO está en ese estado.
 *
 * Read-only: las transiciones las maneja `assign_wo`, `close_wo`, etc.
 */
import {
  Check, AlertCircle, CalendarClock, UserCheck, Wrench, PackageOpen,
  CheckCircle2, Archive, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WOStatus } from '@/lib/database.types'

interface Stage {
  status: WOStatus
  label: string
  icon: React.ElementType
}

const HAPPY_PATH: Stage[] = [
  { status: 'reported',      label: 'Reportada',        icon: AlertCircle },
  { status: 'scheduled',     label: 'Programada',       icon: CalendarClock },
  { status: 'assigned',      label: 'Asignada',         icon: UserCheck },
  { status: 'in_progress',   label: 'En proceso',       icon: Wrench },
  { status: 'waiting_parts', label: 'Esperando partes', icon: PackageOpen },
  { status: 'completed',     label: 'Completada',       icon: CheckCircle2 },
  { status: 'closed',        label: 'Cerrada',          icon: Archive },
]

const TERMINAL_OFF_PATH: Record<'cancelled', { label: string; icon: React.ElementType; tone: string }> = {
  cancelled: {
    label: 'Cancelada',
    icon: Ban,
    tone: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}

export interface WoLifecycleProps {
  status: WOStatus
  /** Compact: smaller pills, labels hidden on small screens. Default false. */
  compact?: boolean
  className?: string
}

export function WoLifecycle({ status, compact = false, className }: WoLifecycleProps) {
  // Off-path: render single terminal pill.
  if (status === 'cancelled') {
    const t = TERMINAL_OFF_PATH.cancelled
    const Icon = t.icon
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
          t.tone,
          className,
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} />
        <span className="text-xs font-medium">{t.label}</span>
      </div>
    )
  }

  const currentIdx = HAPPY_PATH.findIndex((s) => s.status === status)
  const isWaitingParts = status === 'waiting_parts'

  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto pb-1 -mb-1',
        className,
      )}
      role="list"
      aria-label="Ciclo de vida de la orden de trabajo"
    >
      {HAPPY_PATH.map((stage, idx) => {
        const Icon = stage.icon

        // The "waiting_parts" stage is an optional branch; treat it as
        // "future / inactive" unless the WO is currently in that state.
        const isOptional = stage.status === 'waiting_parts'
        const skipOptional = isOptional && !isWaitingParts

        const isDone    = !skipOptional && idx < currentIdx
        const isCurrent = idx === currentIdx
        const isFuture  = skipOptional || idx > currentIdx

        return (
          <div key={stage.status} className="flex items-center gap-1 shrink-0" role="listitem">
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
                isDone    && 'border-success/40 bg-success/10 text-success',
                isCurrent && 'border-primary bg-primary text-primary-foreground shadow-sm',
                isFuture  && 'border-border bg-card text-muted-foreground',
                isOptional && isFuture && 'border-dashed',
                compact && 'px-2 py-0.5',
              )}
              aria-current={isCurrent ? 'step' : undefined}
              title={isOptional ? 'Etapa opcional — sólo si la OT se bloquea por refacciones' : undefined}
            >
              {isDone ? (
                <Check className={cn('size-3', compact && 'size-2.5')} strokeWidth={2.5} />
              ) : (
                <Icon className={cn('size-3', compact && 'size-2.5')} strokeWidth={2} />
              )}
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  compact && 'hidden sm:inline text-[11px]',
                )}
              >
                {stage.label}
              </span>
            </div>
            {idx < HAPPY_PATH.length - 1 && (
              <div
                className={cn(
                  'h-px w-3 shrink-0',
                  !skipOptional && idx < currentIdx ? 'bg-success/40' : 'bg-border',
                  compact && 'w-2',
                )}
                aria-hidden
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
