import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cn } from '@/shared/lib/utils'

type ToastVariant = 'info' | 'success' | 'error'

interface ToastOptions {
  title?: string
  description: string
  variant?: ToastVariant
  duration?: number
}

interface ToastRecord extends ToastOptions {
  id: string
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-info/50',
  success: 'border-success/50',
  error: 'border-error/60',
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
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { id: createToastId(), ...options }])
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitives.Provider swipeDirection="right">
        {children}

        {toasts.map((toast) => {
          const variant = toast.variant ?? 'info'

          return (
            <ToastPrimitives.Root
              key={toast.id}
              duration={toast.duration ?? 4000}
              onOpenChange={(open) => {
                if (!open) {
                  dismiss(toast.id)
                }
              }}
              className={cn(
                'grid w-full gap-1 rounded-lg border bg-surface-elevated px-4 py-3 text-foreground shadow-xl backdrop-blur-sm',
                variantStyles[variant]
              )}
            >
              {toast.title ? (
                <ToastPrimitives.Title className="text-sm font-semibold">
                  {toast.title}
                </ToastPrimitives.Title>
              ) : null}

              <ToastPrimitives.Description className="text-sm text-muted-foreground">
                {toast.description}
              </ToastPrimitives.Description>
            </ToastPrimitives.Root>
          )
        })}

        <ToastPrimitives.Viewport className="fixed right-4 top-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 outline-none sm:right-6 sm:top-6" />
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
