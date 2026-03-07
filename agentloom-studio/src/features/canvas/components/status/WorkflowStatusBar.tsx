import { memo, useEffect, useState } from 'react'
import { useOnViewportChange } from '@xyflow/react'
import { Loader2, Check, Circle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  useCanvasEdges,
  useCanvasSaveStatus,
  useCanvasStore,
} from '../../stores/canvasStore'
import { formatRelativeTime } from '../../lib/formatRelativeTime'

export const WorkflowStatusBar = memo(function WorkflowStatusBar() {
  const nodeCount = useCanvasStore((state) => state.nodes.length)
  const edgeCount = useCanvasEdges().length
  const viewportZoom = useCanvasStore((state) => state.viewport.zoom)
  const { isDirty, isSaving, lastSavedAt } = useCanvasSaveStatus()
  const [zoomPercent, setZoomPercent] = useState(() => Math.round(viewportZoom * 100))

  useEffect(() => {
    setZoomPercent(Math.round(viewportZoom * 100))
  }, [viewportZoom])

  useOnViewportChange({
    onChange: (viewport) => {
      setZoomPercent(Math.round(viewport.zoom * 100))
    },
  })

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex h-7 items-center gap-2 border-t border-border/70 bg-surface/90 px-3 text-xs text-muted-foreground backdrop-blur-sm"
      data-testid="workflow-status-bar"
    >
      <span>{nodeCount} 节点</span>
      <span className="text-border">|</span>
      <span>{edgeCount} 连接</span>
      <span className="text-border">|</span>
      <span>{zoomPercent}%</span>
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
        已保存 · {formatRelativeTime(lastSavedAt)}
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 text-emerald-500">
      <Check className="h-3 w-3" />
      已保存
    </span>
  )
})
