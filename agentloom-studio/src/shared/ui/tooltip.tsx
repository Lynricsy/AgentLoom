import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { scaleIn } from '@/shared/lib/motion'
import {
  useControllableOpen,
  type ControllableOpenProps,
} from './use-controllable-open'

/** 标记外层是否已有 TooltipProvider；没有时 Tooltip 自带一个，避免调用方必须记得包 Provider */
const TooltipProviderPresentContext = createContext(false)

export function TooltipProvider(
  props: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>,
) {
  return (
    <TooltipProviderPresentContext.Provider value>
      <TooltipPrimitive.Provider {...props} />
    </TooltipProviderPresentContext.Provider>
  )
}

const TooltipOpenContext = createContext(false)

export type TooltipProps = PropsWithChildren<
  ControllableOpenProps & { delayDuration?: number }
>

export function Tooltip({ children, delayDuration, ...openProps }: TooltipProps) {
  const [open, setOpen] = useControllableOpen(openProps)
  const hasProvider = useContext(TooltipProviderPresentContext)

  const root = (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      delayDuration={delayDuration}
    >
      <TooltipOpenContext.Provider value={open}>
        {children}
      </TooltipOpenContext.Provider>
    </TooltipPrimitive.Root>
  )

  return hasProvider ? (
    root
  ) : (
    <TooltipPrimitive.Provider delayDuration={300}>{root}</TooltipPrimitive.Provider>
  )
}

export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent(
  { className, children, sideOffset = 6, ...props },
  ref,
) {
  const open = useContext(TooltipOpenContext)

  return (
    <AnimatePresence>
      {open ? (
        <TooltipPrimitive.Portal forceMount>
          <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            asChild
            forceMount
            {...props}
          >
            <motion.div
              {...scaleIn}
              className={cn(
                'z-50 max-w-xs break-words rounded-sm border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md',
                className,
              )}
            >
              {children}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
})

/** 常用组合：图标按钮 + 文字提示 */
export function TooltipHint({
  label,
  children,
  side = 'top',
}: {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
