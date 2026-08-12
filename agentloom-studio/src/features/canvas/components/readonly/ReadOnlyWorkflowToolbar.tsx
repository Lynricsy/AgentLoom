import { memo } from 'react'
import { Download, History, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { WorkflowStatus } from '@/features/workflow'

interface ReadOnlyWorkflowToolbarProps {
  workflowStatus: WorkflowStatus
  onOpenVersionHistory: () => void
  onExport?: () => void
  isExporting?: boolean
  hasNodes?: boolean
  className?: string
}

const STATUS_META: Record<
  WorkflowStatus,
  { label: string; variant: NonNullable<BadgeProps['variant']> }
> = {
  draft: { label: '草稿', variant: 'info' },
  published: { label: '已发布', variant: 'success' },
  archived: { label: '已归档', variant: 'secondary' },
}

/**
 * 小屏只读工具条：只保留查看类入口（状态、版本历史、导出快照）。
 *
 * 与 `VersionToolbar` 并存而非复用，是因为后者的保存快照 / 归档 / 发布
 * 三个按钮不受 props 控制且都是写操作，小屏必须整体不出现。
 */
export const ReadOnlyWorkflowToolbar = memo(function ReadOnlyWorkflowToolbar({
  workflowStatus,
  onOpenVersionHistory,
  onExport,
  isExporting = false,
  hasNodes = false,
  className,
}: ReadOnlyWorkflowToolbarProps) {
  const status = STATUS_META[workflowStatus]

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-1 rounded-panel border border-border bg-surface/90 px-2 py-1.5 shadow-popover backdrop-blur-sm',
        className,
      )}
      data-testid="readonly-workflow-toolbar"
    >
      <Badge
        variant={status.variant}
        size="sm"
        className="mx-1"
        data-testid="workflow-status-badge"
      >
        {status.label}
      </Badge>

      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenVersionHistory}
        data-testid="btn-version-history"
      >
        <History className="h-3.5 w-3.5" />
        历史
      </Button>

      {hasNodes && onExport && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          disabled={isExporting}
          data-testid="btn-export-workflow"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          导出
        </Button>
      )}
    </div>
  )
})
