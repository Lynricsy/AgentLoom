import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type PropsWithChildren,
} from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { scaleIn } from '@/shared/lib/motion'
import { useControllableOpen, type ControllableOpenProps } from './use-controllable-open'

/** 与 Popover 同构：在 React 树里镜像 open，AnimatePresence 才能播放退场 */
const DropdownMenuOpenContext = createContext(false)

export type DropdownMenuProps = PropsWithChildren<ControllableOpenProps & { modal?: boolean }>

export function DropdownMenu({ children, modal, ...openProps }: DropdownMenuProps) {
  const [open, setOpen] = useControllableOpen(openProps)

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen} modal={modal}>
      <DropdownMenuOpenContext.Provider value={open}>{children}</DropdownMenuOpenContext.Provider>
    </DropdownMenuPrimitive.Root>
  )
}

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, children, sideOffset = 4, ...props }, ref) {
  const open = useContext(DropdownMenuOpenContext)

  return (
    <AnimatePresence>
      {open ? (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            asChild
            forceMount
            {...props}
          >
            <motion.div
              {...scaleIn}
              className={cn(
                'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] max-w-[var(--radix-dropdown-menu-content-available-width)] origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
                className,
              )}
            >
              {children}
            </motion.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    destructive?: boolean
  }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors duration-150',
        'focus:bg-muted',
        destructive ? 'text-error focus:bg-error/10' : 'text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
})

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  )
})
