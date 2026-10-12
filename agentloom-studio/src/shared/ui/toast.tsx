import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { panelSlideRight } from '@/shared/lib/motion'
import { Button } from './button'

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

interface ToastOptions {
  title?: string
  description: string
  variant?: ToastVariant
  duration?: number
}

interface ToastRecord extends ToastOptions {
  id: string
  /** 关闭后先置 false 播放退场，退场结束再从列表移除 */
  open: boolean
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-info/50',
  success: 'border-success/50',
  warning: 'border-warning/60',
  error: 'border-error/60',
}

const variantIcons: Record<ToastVariant, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-info' },
  success: { icon: CheckCircle2, className: 'text-success' },
  warning: { icon: AlertTriangle, className: 'text-warning' },
  error: { icon: AlertCircle, className: 'text-error' },
}

function createToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, open: false } : toast)),
    )
  }, [])

  const removeClosed = useCallback(() => {
    setToasts((current) => current.filter((toast) => toast.open))
  }, [])

  const notify = useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { id: createToastId(), open: true, ...options }])
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitives.Provider swipeDirection="right">
        {children}

        <AnimatePresence initial={false} onExitComplete={removeClosed}>
          {toasts.map((toast) => {
            if (!toast.open) return null

            const variant = toast.variant ?? 'info'
            const { icon: Icon, className: iconClassName } = variantIcons[variant]

            return (
              <ToastPrimitives.Root
                key={toast.id}
                asChild
                forceMount
                open
                duration={toast.duration ?? 4000}
                onOpenChange={(open) => {
                  if (!open) {
                    dismiss(toast.id)
                  }
                }}
              >
                <motion.li
                  layout
                  {...panelSlideRight}
                  className={cn(
                    'relative flex w-full gap-2.5 break-words rounded-lg border border-border bg-popover px-4 py-3 pr-10 text-foreground shadow-lg',
                    variantStyles[variant],
                  )}
                >
                  <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', iconClassName)} />

                  <div className="grid min-w-0 flex-1 gap-1">
                    {toast.title ? (
                      <ToastPrimitives.Title className="text-sm font-semibold">
                        {toast.title}
                      </ToastPrimitives.Title>
                    ) : null}

                    <ToastPrimitives.Description className="break-words text-sm text-muted-foreground">
                      {toast.description}
                    </ToastPrimitives.Description>
                  </div>

                  <ToastPrimitives.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="关闭"
                      className="absolute right-2 top-2 text-muted-foreground"
                    >
                      <X />
                    </Button>
                  </ToastPrimitives.Close>
                </motion.li>
              </ToastPrimitives.Root>
            )
          })}
        </AnimatePresence>

        <ToastPrimitives.Viewport className="fixed right-4 top-4 z-60 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 outline-none sm:right-6 sm:top-6" />
      </ToastPrimitives.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return context
}
