import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react'
import { cn } from '@/shared/lib/utils'

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

interface TabsProps extends PropsWithChildren {
  value?: string
  defaultValue: string
  onValueChange?: (value: string) => void
  className?: string
}

export function Tabs({
  children,
  value,
  defaultValue,
  onValueChange,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const currentValue = value ?? internalValue

  const setValue = useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue)
      }

      onValueChange?.(nextValue)
    },
    [onValueChange, value],
  )

  const contextValue = useMemo<TabsContextValue>(
    () => ({ value: currentValue, setValue }),
    [currentValue, setValue],
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('space-y-4', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex w-full rounded-md border border-border bg-muted/50 p-1',
        className,
      )}
      {...props}
    />
  )
}

interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string
}

export function TabsTrigger({ className, value, children, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext)

  if (!context) {
    throw new Error('TabsTrigger must be used within Tabs')
  }

  const isActive = context.value === value

  return (
    <button
      type="button"
      className={cn(
        'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={() => context.setValue(value)}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string
}

export function TabsContent({ className, value, children, ...props }: TabsContentProps) {
  const context = useContext(TabsContext)

  if (!context) {
    throw new Error('TabsContent must be used within Tabs')
  }

  if (context.value !== value) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)} {...props}>
      {children}
    </div>
  )
}
