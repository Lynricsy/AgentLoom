import { memo } from 'react'
import { Loader2, Check, Circle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useCanvasNodes, useCanvasEdges, useCanvasSaveStatus } from '../../stores/canvasStore'
import { formatRelativeTime } from '../../lib/formatRelativeTime'

export const WorkflowStatusBar = memo(function WorkflowStatusBar() {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const { isDirty, isSaving, lastSavedAt } = useCanvasSaveStatus()

  const nodeCount = nodes.length
  const edgeCount = edges.length

  return (
    <div
      className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-md border bg-surface/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"
      data-testid="workflow-status-bar"
    >
      <span>{nodeCount}节点</span>
      <span className="text-border">|</span>
      <span>{edgeCount}连接</span>
      <span className="text-border">|</span>
      <StatusIndicator isDirty={isDirty} isSaving={isSaving} lastSavedAt={lastSavedAt} />
    </div>
  )
})

const StatusIndicator = memo(function StatusIndicator({
  isDirty,
  isSaving,
  lastSavedAt,
}: {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
}) {
  if (isSaving) {
    return (
      <span className={cn('flex items-center gap-1 text-muted-foreground')}>
        <Loader2 className="h-3 w-3 animate-spin" />
        保存中...
      </span>
    )
  }

  if (isDirty) {
    return (
      <span className="flex items-center gap-1 text-amber-500">
        <Circle className="h-2 w-2 fill-current" />
        未保存
      </span>
    )
  }

  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1 text-emerald-500">
        <Check className="h-3 w-3" />
        已保存 {formatRelativeTime(lastSavedAt)}
      </span>
    )
  }

  return null
})
