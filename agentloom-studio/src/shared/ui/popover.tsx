import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type PropsWithChildren,
} from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { scaleIn } from '@/shared/lib/motion'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

const PopoverOpenContext = createContext(false)

export type PopoverProps = PropsWithChildren<
  ControllableOpenProps & { modal?: boolean }
>

export function Popover({ children, modal, ...openProps }: PopoverProps) {
  const [open, setOpen] = useControllableOpen(openProps)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverOpenContext.Provider value={open}>
        {children}
      </PopoverOpenContext.Provider>
    </PopoverPrimitive.Root>
  )
}

export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
  { className, children, align = 'center', sideOffset = 6, ...props },
  ref,
) {
  const open = useContext(PopoverOpenContext)

  return (
    <AnimatePresence>
      {open ? (
        <PopoverPrimitive.Portal forceMount>
          <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            asChild
            forceMount
            {...props}
          >
            <motion.div
              {...scaleIn}
              className={cn(
                'z-50 w-72 rounded-card border border-border bg-popover p-4 text-popover-foreground shadow-popover outline-none',
                className,
              )}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})
