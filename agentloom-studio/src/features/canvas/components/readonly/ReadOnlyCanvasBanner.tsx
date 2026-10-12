import { memo } from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { CANVAS_FLOATING_CLASS } from '../canvasChrome'

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
        CANVAS_FLOATING_CLASS,
        // 浮层自带实底 bg-surface/90，再叠警示色描边与淡色底，保证压在点阵/节点上仍可读
        'pointer-events-none flex items-center gap-2 border-warning/30 px-3 py-2 text-xs font-medium text-warning ring-1 ring-warning/20',
        className,
      )}
    >
      <Eye aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 break-words leading-5">{message}</span>
    </div>
  )
})
