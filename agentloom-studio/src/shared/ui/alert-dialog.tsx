import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type PropsWithChildren,
} from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { fadeIn, scaleIn } from '@/shared/lib/motion'
import { buttonVariants } from './button'
import { OVERLAY_CLASS } from './overlay'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

/**
 * AlertDialog 与 Dialog 同构：都用 `useControllableOpen` 在 React 树里镜像
 * open 值，再配合 `AnimatePresence` + `forceMount` 驱动进退场。
 * 原实现依赖 `animate-in/fade-in-0/zoom-in-95` 等 tailwindcss-animate 类，
 * 而该插件并未安装，因此过去实际上没有任何动画。
 */
const AlertDialogOpenContext = createContext(false)

export type AlertDialogProps = PropsWithChildren<ControllableOpenProps>

export function AlertDialog({ children, ...openProps }: AlertDialogProps) {
  const [open, setOpen] = useControllableOpen(openProps)

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <AlertDialogOpenContext.Provider value={open}>
        {children}
      </AlertDialogOpenContext.Provider>
    </AlertDialogPrimitive.Root>
  )
}

export const AlertDialogTrigger = AlertDialogPrimitive.Trigger

export const AlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(function AlertDialogContent({ className, children, ...props }, ref) {
  const open = useContext(AlertDialogOpenContext)

  return (
    <AnimatePresence>
      {open ? (
        <AlertDialogPrimitive.Portal forceMount>
          <AlertDialogPrimitive.Overlay asChild forceMount>
            <motion.div {...fadeIn} className={OVERLAY_CLASS} />
          </AlertDialogPrimitive.Overlay>

          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <AlertDialogPrimitive.Content
              asChild
              forceMount
              ref={ref}
              {...props}
            >
              <motion.div
                {...scaleIn}
                className={cn(
                  'pointer-events-auto relative w-full max-w-md rounded-xl border border-border bg-surface p-6 text-foreground shadow-xl focus:outline-none',
                  className,
                )}
              >
                {children}
              </motion.div>
            </AlertDialogPrimitive.Content>
          </div>
        </AlertDialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

export const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
})

export const AlertDialogDescription = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('mt-2 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
})

export const AlertDialogAction = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Action>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(function AlertDialogAction({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(buttonVariants({ variant: 'default' }), className)}
      {...props}
    />
  )
})

export const AlertDialogCancel = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Cancel>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(function AlertDialogCancel({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(buttonVariants({ variant: 'outline' }), className)}
      {...props}
    />
  )
})
