import { memo } from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface ReadOnlyCanvasBannerProps {
  /** 提示文案；工作流与 Agent 画布各自传入对应措辞 */
  message: string
  className?: string
}

/**
 * 小屏只读浏览提示条。
 *
 * 常驻画布顶部但 `pointer-events-none`，不拦截平移 / 缩放手势。
 */
export const ReadOnlyCanvasBanner = memo(function ReadOnlyCanvasBanner({
  message,
  className,
}: ReadOnlyCanvasBannerProps) {
  return (
    <div
      role="status"
      data-testid="canvas-readonly-banner"
      className={cn(
        'pointer-events-none flex items-center gap-2 rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning shadow-popover backdrop-blur-sm',
        className,
      )}
    >
      <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="leading-5">{message}</span>
    </div>
  )
})
