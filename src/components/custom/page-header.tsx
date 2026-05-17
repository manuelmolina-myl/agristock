import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * PageHeader — module/page title block.
 *
 * Decorative detail: a short warning-tone (ámbar dorado — "trigo maduro")
 * underline beneath the title. Subtle visual signature that ties pages
 * together without competing with content. Inspired by editorial pull-rules.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.01em] text-foreground truncate leading-tight">
          {title}
        </h1>
        <span
          aria-hidden
          className="block h-[2px] w-10 rounded-full bg-warning/80"
        />
        {description && (
          <div className="text-sm text-muted-foreground mt-1.5 max-w-prose">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
