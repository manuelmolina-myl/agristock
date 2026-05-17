import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Mobile-first: full-bleed bottom sheet on small screens, centered card on sm:+.
          // box-border keeps padding inside the width budget so content never overflows.
          "fixed z-50 grid box-border",
          // Mobile: anchored to bottom edge, full width, no horizontal margin.
          "inset-x-0 bottom-0 w-full",
          // sm:+ : centered card with the legacy max-width budget.
          // NOTE: max-w-md is the *default* — call sites that need wider (max-w-2xl, max-w-xl)
          // override it via tailwind-merge.  Do NOT prefix this with `sm:` — a `sm:max-w-md`
          // here would survive twMerge alongside a plain `max-w-2xl` from the caller and beat
          // it via source-order at sm:+ widths, which is what caused the requisition dialog
          // to render at 448px instead of 672px.
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100vw-2rem)] max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2",
          // Scroll long forms inside the dialog instead of past the viewport — both axes.
          "max-h-[90vh] overflow-y-auto overflow-x-hidden overscroll-contain",
          // Sheet on mobile, rounded card on sm:+.
          "gap-4 rounded-t-2xl sm:rounded-2xl bg-popover p-4 pt-6 sm:pt-4 text-sm text-popover-foreground",
          "ring-1 ring-foreground/10 duration-100 outline-none",
          // Mobile animation: slide up from bottom. sm:+ retains the centered fade/zoom.
          "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-8 sm:data-open:slide-in-from-bottom-0 sm:data-open:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-8 sm:data-closed:slide-out-to-bottom-0 sm:data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:rounded-b-2xl sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
