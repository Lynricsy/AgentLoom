import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const SIZE_CLASS = {
  sm: 'h-3.5 w-3.5',
  default: 'h-4 w-4',
  lg: 'h-6 w-6',
} as const

export interface SpinnerProps {
  size?: keyof typeof SIZE_CLASS
  className?: string
  /** 无障碍标签，默认「加载中」 */
  label?: string
}

export function Spinner({ size = 'default', className, label = '加载中' }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      className={cn('animate-spin text-muted', SIZE_CLASS[size], className)}
    />
  )
}
