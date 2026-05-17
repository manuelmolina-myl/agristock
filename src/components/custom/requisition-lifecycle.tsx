/**
 * RequisitionLifecycle — visualiza el proceso de una requisición como una
 * fila de pills con la etapa actual resaltada.
 *
 * Happy-path:
 *   Borrador → Enviada → En cotización → Aprobada → OC generada
 *
 * Off-path (terminales): Rechazada · Cancelada — se muestran solas como
 * pill destacada cuando aplican.
 *
 * El componente es read-only — la transición de status la maneja la
 * RPC `approve_requisition` etc. en Supabase.
 */
import { Check, FileEdit, Send, Receipt, CheckCircle2, ShoppingCart, Ban, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RequisitionStatus } from '@/lib/database.types'

interface Stage {
  status: RequisitionStatus
  label: string
  icon: React.ElementType
}

const HAPPY_PATH: Stage[] = [
  { status: 'draft',        label: 'Borrador',     icon: FileEdit },
  { status: 'submitted',    label: 'Enviada',      icon: Send },
  { status: 'in_quotation', label: 'Cotización',   icon: Receipt },
  { status: 'approved',     label: 'Aprobada',     icon: CheckCircle2 },
  { status: 'po_generated', label: 'OC generada',  icon: ShoppingCart },
]

const TERMINAL_OFF_PATH: Record<'rejected' | 'cancelled', { label: string; icon: React.ElementType; tone: string }> = {
  rejected:  { label: 'Rechazada',  icon: XCircle, tone: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelada', icon: Ban,     tone: 'bg-muted text-muted-foreground border-border' },
}

export interface RequisitionLifecycleProps {
  status: RequisitionStatus
  /** Compact: smaller pills, no labels on small screens.  Default false. */
  compact?: boolean
  className?: string
}

export function RequisitionLifecycle({ status, compact = false, className }: RequisitionLifecycleProps) {
  // Off-path: render a single terminal pill, no stepper.
  if (status === 'rejected' || status === 'cancelled') {
    const t = TERMINAL_OFF_PATH[status]
    const Icon = t.icon
    return (
      <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1', t.tone, className)}>
        <Icon className="size-3.5" strokeWidth={2} />
        <span className="text-xs font-medium">{t.label}</span>
      </div>
    )
  }

  const currentIdx = HAPPY_PATH.findIndex((s) => s.status === status)

  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto pb-1 -mb-1', // -mb-1 hides scrollbar shadow
        className,
      )}
      role="list"
      aria-label="Progreso de la requisición"
    >
      {HAPPY_PATH.map((stage, idx) => {
        const Icon = stage.icon
        const isDone    = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isFuture  = idx > currentIdx

        return (
          <div key={stage.status} className="flex items-center gap-1 shrink-0" role="listitem">
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
                isDone    && 'border-success/40 bg-success/10 text-success',
                isCurrent && 'border-primary bg-primary text-primary-foreground shadow-sm',
                isFuture  && 'border-border bg-card text-muted-foreground',
                compact && 'px-2 py-0.5',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isDone ? (
                <Check className={cn('size-3', compact && 'size-2.5')} strokeWidth={2.5} />
              ) : (
                <Icon className={cn('size-3', compact && 'size-2.5')} strokeWidth={2} />
              )}
              <span className={cn('text-xs font-medium whitespace-nowrap', compact && 'hidden sm:inline text-[11px]')}>
                {stage.label}
              </span>
            </div>
            {idx < HAPPY_PATH.length - 1 && (
              <div
                className={cn(
                  'h-px w-3 shrink-0',
                  idx < currentIdx ? 'bg-success/40' : 'bg-border',
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
