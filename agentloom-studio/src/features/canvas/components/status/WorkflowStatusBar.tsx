import { memo, useEffect, useState } from 'react'
import { useOnViewportChange } from '@xyflow/react'
import { Loader2, Check, Circle, Play, CheckCircle2, XCircle, Pause } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  useExecutionStatus,
  useExecutionProgress,
  useIsExecutionActive,
} from '@/features/execution/stores/executionStore'
import {
  useCanvasEdges,
  useCanvasSaveStatus,
  useCanvasStore,
} from '../../stores/canvasStore'
import { formatRelativeTime } from '../../lib/formatRelativeTime'

type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

const executionStatusConfig: Record<ExecutionStatus, { label: string; icon: typeof Play; className: string }> = {
  pending: { label: '等待中', icon: Loader2, className: 'text-muted-foreground' },
  running: { label: '执行中', icon: Play, className: 'text-sky-500' },
  paused: { label: '已暂停', icon: Pause, className: 'text-amber-500' },
  completed: { label: '已完成', icon: CheckCircle2, className: 'text-emerald-500' },
  failed: { label: '失败', icon: XCircle, className: 'text-red-500' },
  cancelled: { label: '已取消', icon: XCircle, className: 'text-muted-foreground' },
}

export const WorkflowStatusBar = memo(function WorkflowStatusBar() {
  const nodeCount = useCanvasStore((state) => state.nodes.length)
  const edgeCount = useCanvasEdges().length
  const viewportZoom = useCanvasStore((state) => state.viewport.zoom)
  const { isDirty, isSaving, lastSavedAt } = useCanvasSaveStatus()
  const [zoomPercent, setZoomPercent] = useState(() => Math.round(viewportZoom * 100))

  const executionStatus = useExecutionStatus()
  const { completedSteps, totalSteps } = useExecutionProgress()
  const isActive = useIsExecutionActive()

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

      {executionStatus && (
        <>
          <span className="text-border">|</span>
          <ExecutionStatusIndicator
            status={executionStatus}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            isActive={isActive}
          />
        </>
      )}
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
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!lastSavedAt || isDirty || isSaving) {
      return
    }

    setNow(new Date())

    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 60_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [isDirty, isSaving, lastSavedAt])

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
        已保存 · {formatRelativeTime(lastSavedAt, now)}
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

const ExecutionStatusIndicator = memo(function ExecutionStatusIndicator({
  status,
  completedSteps,
  totalSteps,
  isActive,
}: {
  status: ExecutionStatus
  completedSteps: number
  totalSteps: number
  isActive: boolean
}) {
  const config = executionStatusConfig[status]
  const Icon = config.icon
  const showProgress = isActive && totalSteps > 0

  return (
    <span
      className={cn('flex items-center gap-1', config.className)}
      data-testid="execution-status-indicator"
    >
      <Icon className={cn('h-3 w-3', status === 'pending' && 'animate-spin')} />
      {config.label}
      {showProgress && (
        <span className="text-muted-foreground">
          ({completedSteps}/{totalSteps})
        </span>
      )}
    </span>
  )
})
