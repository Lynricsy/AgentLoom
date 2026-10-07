import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'
import { OVERLAY_CLASS } from './overlay'
import { fadeIn, scaleIn } from '@/shared/lib/motion'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

const DialogOpenContext = createContext(false)

export type DialogProps = PropsWithChildren<
  ControllableOpenProps & { modal?: boolean }
>

export function Dialog({ children, modal, ...openProps }: DialogProps) {
  const [open, setOpen] = useControllableOpen(openProps)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={modal}>
      <DialogOpenContext.Provider value={open}>
        {children}
      </DialogOpenContext.Provider>
    </DialogPrimitive.Root>
  )
}

export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** 隐藏右上角关闭按钮 */
  hideClose?: boolean
  /** 内容区尺寸档位 */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE_CLASS: Record<NonNullable<DialogContentProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, hideClose = false, size = 'md', ...props },
  ref,
) {
  const open = useContext(DialogOpenContext)

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

          {/* 居中容器：pointer-events-none 让空白区域的点击落到 Overlay 上完成关闭 */}
          <div className="pointer-events-none fixed inset-0 z-50 grid place-items-stretch sm:place-items-center sm:p-4">
            <DialogPrimitive.Content asChild forceMount ref={ref} {...props}>
              <motion.div
                {...scaleIn}
                className={cn(
                  'pointer-events-auto relative flex max-h-full w-full flex-col overflow-hidden border border-border bg-surface text-foreground shadow-xl',
                  'rounded-none sm:rounded-xl',
                  SIZE_CLASS[size],
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
          </div>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

export function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-border px-6 py-4 pr-12',
        className,
      )}
      {...props}
    />
  )
}

export function DialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)} {...props} />
  )
}

export function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
})

/** 无障碍：无可见标题时用于提供屏幕阅读器标题 */
export function DialogHiddenTitle({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Title className="sr-only">{children}</DialogPrimitive.Title>
  )
}
