import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { CANVAS_PANEL_HEADER_CLASS } from './canvasChrome'

export interface CanvasPanelHeaderProps {
  icon?: LucideIcon
  /** 图标芯片的语气色（CSS 颜色值，如 `var(--color-node-agent)`），默认主色 */
  tone?: string
  /** 标题；可传 ReactNode（如属性面板里的可编辑名称输入框） */
  title: ReactNode
  description?: ReactNode
  /** 关闭按钮左侧的额外操作 */
  actions?: ReactNode
  onClose?: () => void
  /** 关闭按钮的无障碍名称，默认「关闭」 */
  closeLabel?: string
  closeTestId?: string
  className?: string
}

/**
 * 画布侧面板统一头部：图标芯片 + 标题/描述 + 操作 + 关闭。
 * 属性面板、工作流设置、Agent 节点配置、字段映射共用，保证四处几何一致。
 */
export function CanvasPanelHeader({
  icon: Icon,
  tone = 'var(--color-primary)',
  title,
  description,
  actions,
  onClose,
  closeLabel = '关闭',
  closeTestId,
  className,
}: CanvasPanelHeaderProps) {
  return (
    <div className={cn(CANVAS_PANEL_HEADER_CLASS, className)}>
      {Icon ? (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {title}
          </h2>
        ) : (
          title
        )}
        {description ? (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={closeLabel}
          data-testid={closeTestId}
          className="shrink-0 text-muted-foreground"
          onClick={onClose}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}
