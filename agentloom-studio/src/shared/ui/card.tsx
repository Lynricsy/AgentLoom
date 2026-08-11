import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否启用 hover 抬升与边框高亮（用于可点击卡片） */
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card border border-border bg-card text-card-foreground shadow-node',
        interactive &&
          'cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-border-hover hover:shadow-node-selected',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-1 p-4', className)}
        {...props}
      />
    )
  },
)

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn(
        'text-sm font-semibold leading-tight text-foreground',
        className,
      )}
      {...props}
    />
  )
})

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn('text-xs text-muted', className)} {...props} />
  )
})

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
})

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-2 p-4 pt-0', className)}
        {...props}
      />
    )
  },
)
