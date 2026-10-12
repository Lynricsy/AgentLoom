import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { DUR, EASE, fadeIn } from '@/shared/lib/motion'

interface TabsContextValue {
  /** 激活指示器 layoutId 前缀，保证同页多组 Tabs 互不串动 */
  id: string
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

  const id = useId()

  const contextValue = useMemo<TabsContextValue>(
    () => ({ id, value: currentValue, setValue }),
    [id, currentValue, setValue],
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
      role="tablist"
      className={cn(
        'inline-flex w-full gap-1 overflow-x-auto rounded-md bg-muted p-1',
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
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? 'active' : 'inactive'}
      {...props}
      className={cn(
        'relative flex-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={(event) => {
        props.onClick?.(event)
        context.setValue(value)
      }}
    >
      {isActive ? (
        <motion.span
          aria-hidden
          layoutId={`${context.id}-pill`}
          transition={{ duration: DUR.base, ease: EASE }}
          className="absolute inset-0 rounded-[inherit] bg-surface shadow-xs"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </button>
  )
}

interface TabsContentProps extends HTMLMotionProps<'div'> {
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

  // 仅入场淡入，不做退场（避免切换时两块内容叠高）
  return (
    <motion.div
      key={value}
      initial={fadeIn.initial}
      animate={fadeIn.animate}
      transition={fadeIn.transition}
      role="tabpanel"
      className={cn('space-y-4', className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}
