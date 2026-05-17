"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

/**
 * Select — base-ui dropdown styled to match Input height/borders.
 *
 * Bug fixed (2026-05-16):
 *   base-ui's <Select.Value> shows the raw `value` (e.g. "medium" or a UUID)
 *   unless an `items` list is registered on <Select.Root>.  We can't rely on
 *   that prop at every call-site, so this wrapper builds a label registry
 *   via React Context: each <SelectItem> publishes its label and
 *   <SelectValue> reads from the registry to render the human label.
 */

/**
 * Registry of value→label entries published by SelectItem children.  Used
 * by SelectValue to render the active item's label even though base-ui's
 * Select.Value only sees the raw value.
 */
interface SelectLabelsApi {
  get: (value: string) => React.ReactNode | undefined
  set: (value: string, label: React.ReactNode) => void
}
const SelectLabelsContext = React.createContext<SelectLabelsApi | null>(null)

function reactNodeToString(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeToString).join('')
  if (React.isValidElement(node)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return reactNodeToString((node.props as any)?.children)
  }
  return ''
}

/**
 * Walks a React node tree extracting `{value, label}` pairs from every
 * SelectItem it finds.  Used at first render so the items list is available
 * before any effect runs — avoids the flash of raw value on initial paint.
 */
function extractSelectItems(node: React.ReactNode): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = child.props as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = child.type as any
    const isItem =
      t === SelectItem ||
      t === SelectPrimitive.Item ||
      t?.displayName === 'SelectItem' ||
      t?.name === 'SelectItem'

    if (isItem && 'value' in props) {
      const label = typeof props.label === 'string'
        ? props.label
        : reactNodeToString(props.children)
      out.push({ value: String(props.value), label })
      return
    }

    if (props?.children) {
      out.push(...extractSelectItems(props.children))
    }
  })
  return out
}

/**
 * Select wrapper that:
 *   1. Pre-fills a label registry by walking children at first render.
 *   2. Exposes that registry via context so <SelectValue> can render labels.
 *   3. Lets <SelectItem> overwrite its own label dynamically (e.g. when
 *      children change after a data fetch).
 *
 * Kept generic over `Value` so call-sites keep type inference for
 * `value` / `onValueChange`.
 */
function Select<Value = string, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>,
) {
  // Seed the registry with everything we can statically extract.  This makes
  // the FIRST paint correct (no flash of raw value).
  const initialItems = React.useMemo(
    () => extractSelectItems(props.children),
    [props.children],
  )

  const labelsRef = React.useRef<Map<string, React.ReactNode>>(new Map())
  const [, forceUpdate] = React.useReducer((s) => s + 1, 0)

  // Seed map from initial extraction on every render where the children
  // change.  Inexpensive (just a Map population).
  React.useMemo(() => {
    labelsRef.current = new Map(initialItems.map((i) => [i.value, i.label]))
  }, [initialItems])

  const api = React.useMemo<SelectLabelsApi>(
    () => ({
      get: (value: string) => labelsRef.current.get(value),
      set: (value: string, label: React.ReactNode) => {
        const prev = labelsRef.current.get(value)
        if (prev !== label) {
          labelsRef.current.set(value, label)
          forceUpdate()
        }
      },
    }),
    [],
  )

  return (
    <SelectLabelsContext.Provider value={api}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SelectPrimitive.Root items={initialItems as any} {...props} />
    </SelectLabelsContext.Provider>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, placeholder, ...props }: SelectPrimitive.Value.Props) {
  // Use the labels registry from <Select> to render the human label for the
  // currently-selected value.  Falls back to whatever base-ui resolves
  // (placeholder when nothing selected, or raw value as last resort).
  const labels = React.useContext(SelectLabelsContext)
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left truncate", className)}
      placeholder={placeholder}
      {...props}
    >
      {(value: unknown) => {
        if (value == null || value === '') return placeholder ?? ''
        const key = String(value)
        const label = labels?.get(key)
        if (label != null && label !== '') return label
        return placeholder ?? key
      }}
    </SelectPrimitive.Value>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default" | "lg"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        // Layout — full width by default, behaves like a real form control.
        "flex w-full items-center justify-between gap-2 rounded-lg",
        // Border + background tuned for the tierra-cultivada palette.
        "border border-input bg-card hover:bg-accent/40 transition-colors",
        // Sizing
        "px-3 text-sm whitespace-nowrap",
        "data-[size=sm]:h-8 data-[size=sm]:px-2.5 data-[size=sm]:text-xs",
        "data-[size=default]:h-9",
        "data-[size=lg]:h-10",
        // Focus
        "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        // States
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "data-placeholder:text-muted-foreground/70",
        // Internal helpers
        "select-none",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5",
        // Dark theme tweaks
        "dark:bg-card/60 dark:hover:bg-accent/30",
        // Icons
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon
            className={cn(
              "pointer-events-none size-4 text-muted-foreground",
              "transition-transform data-[popup-open]:rotate-180",
            )}
          />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            // Grow with the widest item: never narrower than the trigger,
            // never wider than 32rem (or 96vw on tiny phones). Items render
            // single-line so the dropdown sizes to the longest one.
            "relative isolate z-50",
            "min-w-[max(var(--anchor-width),_12rem)] w-max max-w-[min(96vw,_32rem)]",
            "max-h-(--available-height)",
            "origin-(--transform-origin) overflow-x-hidden overflow-y-auto",
            "rounded-lg bg-popover text-popover-foreground",
            "shadow-lg ring-1 ring-foreground/[0.06]",
            "p-1",
            // Animations
            "duration-150",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=top]:slide-in-from-bottom-2",
            "data-[side=left]:slide-in-from-right-2",
            "data-[side=right]:slide-in-from-left-2",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        "px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium",
        className,
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  // Publish the resolved label so SelectValue can show it on the trigger.
  // Especially important for items whose children come from async data
  // (suppliers, items, equipment...) — the initial children-walk in <Select>
  // wouldn't have seen them.
  const labels = React.useContext(SelectLabelsContext)
  const value = props.value
  React.useEffect(() => {
    if (!labels || value == null) return
    labels.set(String(value), children ?? '')
  }, [labels, value, children])

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // Layout — check on the LEFT (Linear/Notion-style), generous padding.
        "relative flex w-full items-center gap-2",
        "rounded-md py-2 pl-8 pr-2.5",
        "text-sm leading-tight",
        // Interaction — clear hover feedback under the tierra-cultivada palette.
        "cursor-pointer select-none outline-hidden",
        "transition-colors duration-75",
        "focus:bg-accent focus:text-accent-foreground",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        // Icons inside item (avatar, dot, etc.)
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center text-primary" />
        }
      >
        <CheckIcon className="pointer-events-none size-3.5" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="flex flex-1 items-center gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "sticky top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "sticky bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
