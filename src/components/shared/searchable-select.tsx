import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
}

export interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  /** Extra classes applied to the trigger button */
  triggerClassName?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'Sin resultados.',
  disabled = false,
  triggerClassName,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          // Match shadcn SelectTrigger look
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-muted-foreground',
          triggerClassName,
          className
        )}
      >
        <span className="flex-1 truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        className="p-0! w-[var(--anchor-width)] min-w-[240px] max-w-[calc(100vw-2rem)]"
        align="start"
        sideOffset={4}
      >
        <Command
          filter={(itemValue, search) => {
            const option = options.find((o) => o.value === itemValue)
            if (!option) return 0
            const haystack = `${option.label} ${option.sublabel ?? ''}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  data-checked={value === option.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue)
                    setOpen(false)
                  }}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium">{option.label}</span>
                    {option.sublabel && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
