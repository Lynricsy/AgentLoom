import { memo, type CSSProperties } from 'react'
import {
  Check,
  X,
  AlertTriangle,
  SkipForward,
  Loader2,
  Clock,
  Pause,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  useNodeExecutionState,
  useIsExecutionActive,
} from '@/features/execution/stores/executionStore'
import type { StepStatus } from '@/features/execution/types'

/* ─── 状态 → 视觉映射 ─────────────────────────────────── */

interface StatusVisual {
  icon: React.ReactNode
  color: string
  label: string
  animate?: boolean
  borderClass?: string
}

const STATUS_SIZE = 16

function getStatusVisual(status: StepStatus): StatusVisual {
  switch (status) {
    case 'running':
      return {
        icon: <Loader2 size={STATUS_SIZE} className="exec-overlay__spinner" />,
        color: 'var(--color-primary)',
        label: '运行中',
        animate: true,
        borderClass: 'exec-overlay--running',
      }
    case 'completed':
      return {
        icon: <Check size={STATUS_SIZE} strokeWidth={3} />,
        color: 'var(--color-success, #22c55e)',
        label: '已完成',
      }
    case 'failed':
      return {
        icon: <X size={STATUS_SIZE} strokeWidth={3} />,
        color: 'var(--color-error, #ef4444)',
        label: '执行失败',
      }
    case 'waiting_intervention':
      return {
        icon: <AlertTriangle size={STATUS_SIZE} />,
        color: 'var(--color-warning, #f59e0b)',
        label: '等待干预',
        animate: true,
        borderClass: 'exec-overlay--waiting',
      }
    case 'skipped':
      return {
        icon: <SkipForward size={STATUS_SIZE} />,
        color: 'var(--color-muted-foreground)',
        label: '已跳过',
      }
    case 'cancelled':
      return {
        icon: <X size={STATUS_SIZE} />,
        color: 'var(--color-muted-foreground)',
        label: '已取消',
      }
    case 'queued':
      return {
        icon: <Clock size={STATUS_SIZE} />,
        color: 'var(--color-muted-foreground)',
        label: '排队中',
      }
    case 'pending':
      return {
        icon: <Pause size={STATUS_SIZE} />,
        color: 'var(--color-muted-foreground)',
        label: '等待中',
      }
  }
}

/* ─── 主组件 ────────────────────────────────────────────── */

interface NodeExecutionOverlayProps {
  nodeId: string
}

export const NodeExecutionOverlay = memo(function NodeExecutionOverlay({
  nodeId,
}: NodeExecutionOverlayProps) {
  const nodeState = useNodeExecutionState(nodeId)
  const isExecutionActive = useIsExecutionActive()

  // 没有执行状态或执行未激活且节点未完成 → 不渲染
  if (!nodeState) {
    return null
  }

  // 执行结束后，pending 节点不显示状态
  if (!isExecutionActive && nodeState.status === 'pending') {
    return null
  }

  const visual = getStatusVisual(nodeState.status)

  return (
    <div
      data-testid={`exec-overlay-${nodeId}`}
      data-exec-status={nodeState.status}
      className={cn('exec-overlay', visual.borderClass)}
      style={{ '--exec-color': visual.color } as CSSProperties}
    >
      <span
        className="exec-overlay__badge"
        title={
          nodeState.errorMessage
            ? `${visual.label}: ${nodeState.errorMessage}`
            : visual.label
        }
      >
        {visual.icon}
      </span>

      {nodeState.retryAttempt != null && nodeState.retryMaxAttempts != null && (
        <span
          className="exec-overlay__retry"
          data-testid={`exec-retry-${nodeId}`}
        >
          {nodeState.retryAttempt}/{nodeState.retryMaxAttempts}
        </span>
      )}
    </div>
  )
})
