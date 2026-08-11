import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type PropsWithChildren,
} from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { scaleIn } from '@/shared/lib/motion'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

const SelectOpenContext = createContext(false)

export type SelectProps = PropsWithChildren<
  ControllableOpenProps &
    Omit<
      ComponentPropsWithoutRef<typeof SelectPrimitive.Root>,
      'open' | 'defaultOpen' | 'onOpenChange' | 'children'
    >
>

export function Select({
  children,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectProps) {
  const [isOpen, setOpen] = useControllableOpen({ open, defaultOpen, onOpenChange })

  return (
    <SelectPrimitive.Root open={isOpen} onOpenChange={setOpen} {...props}>
      <SelectOpenContext.Provider value={isOpen}>
        {children}
      </SelectOpenContext.Provider>
    </SelectPrimitive.Root>
  )
}

export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors data-[placeholder]:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = 'popper', sideOffset = 4, ...props },
  ref,
) {
  const open = useContext(SelectOpenContext)

  return (
    <AnimatePresence>
      {open ? (
        <SelectPrimitive.Portal forceMount>
          <SelectPrimitive.Content
            ref={ref}
            position={position}
            sideOffset={sideOffset}
            asChild
            forceMount
            {...props}
          >
            <motion.div
              {...scaleIn}
              className={cn(
                'relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-card border border-border bg-popover text-popover-foreground shadow-popover',
                position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
                className,
              )}
            >
              <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
                <ChevronUp className="h-3.5 w-3.5" />
              </SelectPrimitive.ScrollUpButton>

              <SelectPrimitive.Viewport className="p-1">
                {children}
              </SelectPrimitive.Viewport>

              <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
                <ChevronDown className="h-3.5 w-3.5" />
              </SelectPrimitive.ScrollDownButton>
            </motion.div>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
})

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm text-foreground outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-primary/12 data-[highlighted]:text-primary data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
})

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
})
