import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'
import { OVERLAY_CLASS } from './overlay'
import { DUR, EASE, fadeIn } from '@/shared/lib/motion'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

const SheetOpenContext = createContext(false)

export type SheetProps = PropsWithChildren<
  ControllableOpenProps & { modal?: boolean }
>

export function Sheet({ children, modal, ...openProps }: SheetProps) {
  const [open, setOpen] = useControllableOpen(openProps)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={modal}>
      <SheetOpenContext.Provider value={open}>{children}</SheetOpenContext.Provider>
    </DialogPrimitive.Root>
  )
}

export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export type SheetSide = 'right' | 'left' | 'bottom'

const SIDE_CLASS: Record<SheetSide, string> = {
  right: 'inset-y-0 right-0 h-full w-full max-w-md border-l',
  left: 'inset-y-0 left-0 h-full w-[min(20rem,85vw)] border-r',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-xl border-t',
}

interface SideMotion {
  initial: TargetAndTransition
  animate: TargetAndTransition
  exit: TargetAndTransition
}

const SIDE_MOTION: Record<SheetSide, SideMotion> = {
  right: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } },
  left: { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' } },
  bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
}

export interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: SheetSide
  hideClose?: boolean
}

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(function SheetContent(
  { className, children, side = 'right', hideClose = false, ...props },
  ref,
) {
  const open = useContext(SheetOpenContext)
  const sideMotion = SIDE_MOTION[side]

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              {...fadeIn}
              className={OVERLAY_CLASS}
            />
          </DialogPrimitive.Overlay>

          <DialogPrimitive.Content asChild forceMount ref={ref} {...props}>
            <motion.div
              initial={sideMotion.initial}
              animate={sideMotion.animate}
              exit={sideMotion.exit}
              transition={{ duration: DUR.slow, ease: EASE }}
              className={cn(
                'fixed z-50 flex flex-col overflow-hidden border-border bg-surface text-foreground shadow-xl',
                SIDE_CLASS[side],
                className,
              )}
            >
              {children}

              {hideClose ? null : (
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="关闭"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              )}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

export function SheetHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-border px-5 py-4 pr-12',
        className,
      )}
      {...props}
    />
  )
}

export function SheetBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />
  )
}

export function SheetFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
})

export const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
})
