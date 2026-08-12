import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import {
  useExecutionId,
  useIsExecutionActive,
  useNodeExecutionState,
} from '@/features/execution/stores/executionStore'
import { ToolCallList } from '@/features/execution/components/ToolCallList'
import type { StepStatus } from '@/features/execution/types'
import { cn } from '@/shared/lib/utils'
import { panelSlideRight } from '@/shared/lib/motion'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import type { CanvasNode } from '../../types'
import { getResolvedNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { useCanvasActions, useCanvasStore } from '../../stores/canvasStore'
import { getOutputContentFormat } from '../../lib/outputContent'
import {
  getNodeAccentToken,
  resolveNodeIcon,
} from '../node/nodeVisualMeta'
import { CUSTOM_PANEL_REGISTRY } from './customPanelRegistry'
import { InterventionPanel } from './InterventionPanel'
import { DynamicConfigForm } from './DynamicConfigForm'
import { OutputContentRenderer } from '../output/OutputContentRenderer'

interface NodeConfigPanelProps {
  className?: string
}

/** 面板宽度持久化键；min/max 与拖拽夹取范围共用同一组常量 */
const PANEL_WIDTH_STORAGE_KEY = 'agentloom-config-panel-width'
const PANEL_MIN_WIDTH = 320
const PANEL_MAX_WIDTH = 560
const PANEL_DEFAULT_WIDTH = 360
/** 键盘微调步长：方向键每次 16px，与 4px 网格对齐 */
const PANEL_WIDTH_KEYBOARD_STEP = 16

type NodeConfigTab = 'config' | 'output' | 'intervention'

const EXECUTION_STATUS_META: Record<
  StepStatus,
  { label: string; badgeClassName: string }
> = {
  pending: {
    label: '等待中',
    badgeClassName: 'border-border bg-muted/60 text-muted-foreground',
  },
  queued: {
    label: '排队中',
    badgeClassName: 'border-border bg-muted/60 text-muted-foreground',
  },
  running: {
    label: '执行中',
    badgeClassName: 'border-primary/30 bg-primary/10 text-primary',
  },
  completed: {
    label: '已完成',
    badgeClassName: 'border-success/30 bg-success/10 text-success',
  },
  failed: {
    label: '失败',
    badgeClassName: 'border-error/30 bg-error/10 text-error',
  },
  skipped: {
    label: '已跳过',
    badgeClassName: 'border-border bg-muted/60 text-muted-foreground',
  },
  cancelled: {
    label: '已取消',
    badgeClassName: 'border-border bg-muted/60 text-muted-foreground',
  },
  waiting_intervention: {
    label: '等待干预',
    badgeClassName: 'border-warning/30 bg-warning/10 text-warning',
  },
}

const EXECUTION_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatExecutionTimestamp(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return EXECUTION_TIME_FORMATTER.format(parsed)
}

function getOutputPlaceholder(
  status?: StepStatus,
  isStreaming?: boolean,
  isExecutionActive?: boolean,
): string {
  if (isStreaming) {
    return '正在接收实时输出...'
  }

  if (!status && isExecutionActive) {
    return '节点尚未开始运行，输出会在执行后显示。'
  }

  switch (status) {
    case 'failed':
      return '节点执行失败，暂无可展示的输出内容。'
    case 'completed':
      return '该节点已完成，但这次运行没有文本输出。'
    case 'queued':
    case 'pending':
      return '节点尚未开始运行，输出会在执行后显示。'
    case 'waiting_intervention':
      return '节点正在等待人工干预，恢复后会继续写入输出。'
    case 'skipped':
      return '该节点在本次执行中被跳过，没有产生输出。'
    case 'cancelled':
      return '该节点执行已取消，没有产生输出。'
    default:
      return '选择节点后，这里会显示最近一次执行输出。'
  }
}

function clampPanelWidth(value: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(value)))
}

function readStoredPanelWidth(): number {
  if (typeof window === 'undefined') {
    return PANEL_DEFAULT_WIDTH
  }

  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
    if (!raw) {
      return PANEL_DEFAULT_WIDTH
    }

    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? clampPanelWidth(parsed) : PANEL_DEFAULT_WIDTH
  } catch {
    // 隐私模式或存储配额异常时静默回退默认宽度
    return PANEL_DEFAULT_WIDTH
  }
}

function persistPanelWidth(width: number): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // 写入失败不影响本次会话内的宽度体验
  }
}

/**
 * 左缘拖拽调宽 + 持久化。
 * 面板贴右侧，因此「向左拖」= 变宽，位移取 `startX - clientX`。
 */
function usePanelWidth() {
  const [width, setWidth] = useState(readStoredPanelWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthRef = useRef(width)
  const dragOriginRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const applyWidth = useCallback((next: number) => {
    const clamped = clampPanelWidth(next)
    widthRef.current = clamped
    setWidth(clamped)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragOriginRef.current = { startX: event.clientX, startWidth: widthRef.current }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setIsResizing(true)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current
      if (!origin) return

      applyWidth(origin.startWidth + (origin.startX - event.clientX))
    },
    [applyWidth],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragOriginRef.current) return

      dragOriginRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      setIsResizing(false)
      persistPanelWidth(widthRef.current)
    },
    [],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

      event.preventDefault()
      const delta =
        event.key === 'ArrowLeft'
          ? PANEL_WIDTH_KEYBOARD_STEP
          : -PANEL_WIDTH_KEYBOARD_STEP
      applyWidth(widthRef.current + delta)
      persistPanelWidth(widthRef.current)
    },
    [applyWidth],
  )

  return {
    width,
    isResizing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
  }
}

export const NodeConfigPanel = memo(function NodeConfigPanel({
  className,
}: NodeConfigPanelProps) {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const node = useCanvasStore((s) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) ?? null : null
  )

  const { selectNode, updateNodeData, setNodeValidationError } = useCanvasActions()
  const nodeState = useNodeExecutionState(selectedNodeId ?? '')
  const isWaitingIntervention = nodeState?.status === 'waiting_intervention'

  const {
    width,
    isResizing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
  } = usePanelWidth()

  const [activeTab, setActiveTab] = useState<NodeConfigTab>('config')

  // 进入等待干预时自动切到「介入」tab，保持与改版前「干预面板自动出现」一致的语义；
  // 干预结束后该 tab 消失，需要退回「配置」避免停在空 tab 上。
  useEffect(() => {
    if (isWaitingIntervention) {
      setActiveTab('intervention')
      return
    }

    setActiveTab((current) => (current === 'intervention' ? 'config' : current))
  }, [isWaitingIntervention])

  const handleTabChange = useCallback((value: string) => {
    if (value === 'config' || value === 'output' || value === 'intervention') {
      setActiveTab(value)
    }
  }, [])

  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const handleConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, patch)
    },
    [selectedNodeId, updateNodeData],
  )

  const handleLabelChange = useCallback(
    (label: string) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, { label })
    },
    [selectedNodeId, updateNodeData],
  )

  const handleValidationChange = useCallback(
    (hasErrors: boolean) => {
      if (!selectedNodeId) return
      setNodeValidationError(selectedNodeId, hasErrors)
    },
    [selectedNodeId, setNodeValidationError],
  )

  const nodeType = node?.data.nodeType
  const nodeConfig = node
    ? getResolvedNodeTypeConfig(node.data.nodeType, {
        category: node.data.category,
        inputPorts: Array.isArray(node.data.inputPorts)
          ? node.data.inputPorts
          : undefined,
        outputPorts: Array.isArray(node.data.outputPorts)
          ? node.data.outputPorts
          : undefined,
      })
    : null

  const accentToken =
    nodeConfig && nodeType
      ? getNodeAccentToken(nodeType, nodeConfig.category)
      : 'var(--color-node-control)'
  const NodeIcon = resolveNodeIcon(nodeConfig?.icon)

  return (
    <AnimatePresence>
      {node && nodeConfig ? (
        <motion.aside
          key="node-config-panel"
          data-testid="node-config-panel"
          initial={panelSlideRight.initial}
          animate={panelSlideRight.animate}
          exit={panelSlideRight.exit}
          transition={panelSlideRight.transition}
          style={{ width }}
          className={cn(
            'relative m-2 flex shrink-0 flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-panel',
            className,
          )}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整配置面板宽度"
            aria-valuenow={width}
            aria-valuemin={PANEL_MIN_WIDTH}
            aria-valuemax={PANEL_MAX_WIDTH}
            tabIndex={0}
            data-testid="node-config-panel-resize-handle"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className={cn(
              'absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/70 focus-visible:bg-primary focus-visible:outline-none',
              isResizing && 'bg-primary',
            )}
          />

          <header className="flex items-start gap-3 border-b border-border px-4 py-3 pl-5">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card"
              style={{
                backgroundColor: `color-mix(in srgb, ${accentToken} 14%, transparent)`,
                color: accentToken,
              }}
            >
              <NodeIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <input
                aria-label="节点名称"
                data-testid="node-config-panel-title"
                value={node.data.label}
                onChange={(event) => handleLabelChange(event.target.value)}
                className="w-full rounded-md bg-transparent px-1.5 py-0.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <p className="mt-0.5 truncate px-1.5 text-xs text-muted-foreground">
                {nodeConfig.isKnownType
                  ? `${nodeConfig.label} 配置`
                  : `未知节点类型（${nodeConfig.type}）`}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="关闭配置面板"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <Tabs
            value={activeTab}
            defaultValue={activeTab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col space-y-0"
          >
            <div className="px-4 pt-3">
              <TabsList>
                <TabsTrigger value="config" data-testid="node-config-tab-config">
                  配置
                </TabsTrigger>
                <TabsTrigger value="output" data-testid="node-config-tab-output">
                  输出
                </TabsTrigger>
                {isWaitingIntervention && (
                  <TabsTrigger
                    value="intervention"
                    data-testid="node-config-tab-intervention"
                  >
                    介入
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* tab 内容常驻挂载、仅切换可见性：自定义面板持有 Monaco / 草稿等本地状态，卸载会丢编辑上下文 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className={cn(activeTab !== 'config' && 'hidden')}
                data-testid="node-config-tab-panel-config"
                data-active={activeTab === 'config'}
              >
                <NodeConfigDispatch
                  node={node}
                  onConfigChange={handleConfigChange}
                  onValidationChange={handleValidationChange}
                />
              </div>

              <div
                className={cn(activeTab !== 'output' && 'hidden')}
                data-testid="node-config-tab-panel-output"
                data-active={activeTab === 'output'}
              >
                <NodeExecutionSection
                  nodeId={node.id}
                  nodeType={node.data.nodeType}
                />
              </div>

              {isWaitingIntervention && (
                <div
                  className={cn('px-4 py-4', activeTab !== 'intervention' && 'hidden')}
                  data-testid="node-config-tab-panel-intervention"
                  data-active={activeTab === 'intervention'}
                >
                  <InterventionPanel nodeId={node.id} />
                </div>
              )}
            </div>
          </Tabs>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
})

interface NodeConfigDispatchProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

const NodeConfigDispatch = memo(function NodeConfigDispatch({
  node,
  onConfigChange,
  onValidationChange,
}: NodeConfigDispatchProps) {
  const nodeType = node.data.nodeType

  const nodeConfig = getResolvedNodeTypeConfig(nodeType, {
    category: node.data.category,
    inputPorts: Array.isArray(node.data.inputPorts)
      ? node.data.inputPorts
      : undefined,
    outputPorts: Array.isArray(node.data.outputPorts)
      ? node.data.outputPorts
      : undefined,
  })
  // 用归一化后的类型查表：只有这样 legacy 别名（例如已废除的 llm-agent）
  // 才能命中它 canonical 对应的自定义面板，而不是掉到 DynamicConfigForm
  const customPanel = CUSTOM_PANEL_REGISTRY[nodeConfig.type]
  const hasDynamicConfigFields =
    Object.keys(nodeConfig.configSchema.properties).length > 0

  useEffect(() => {
    if (!nodeConfig.isKnownType) {
      onValidationChange(false)
      return
    }

    if ((!customPanel || !customPanel.handlesValidation) && !hasDynamicConfigFields) {
      onValidationChange(false)
      return
    }

    if (customPanel && !customPanel.handlesValidation) {
      onValidationChange(false)
    }
  }, [customPanel, hasDynamicConfigFields, nodeConfig.isKnownType, onValidationChange])

  if (!nodeConfig.isKnownType) {
    return (
      <div className="space-y-2 px-4 py-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">当前节点类型暂不受支持</p>
        <p>
          已检测到未知节点类型 <code>{nodeConfig.type}</code>。为避免整页崩溃，Studio
          会保留原始配置和端口数据，但不会尝试渲染专用配置面板。
        </p>
      </div>
    )
  }

  if (customPanel) {
    return customPanel.render({
      node,
      onConfigChange,
      onValidationChange,
    })
  }

  if (hasDynamicConfigFields) {
    return (
      <DynamicConfigForm
        configSchema={nodeConfig.configSchema}
        values={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    )
  }

  return (
    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
      该节点无需额外配置
    </div>
  )
})

interface NodeExecutionSectionProps {
  nodeId: string
  nodeType: CanvasNode['data']['nodeType']
}

const NodeExecutionSection = memo(function NodeExecutionSection({
  nodeId,
  nodeType,
}: NodeExecutionSectionProps) {
  const nodeState = useNodeExecutionState(nodeId)
  const isExecutionActive = useIsExecutionActive()
  const executionId = useExecutionId()

  const startedAt = formatExecutionTimestamp(nodeState?.startedAt)
  const completedAt = formatExecutionTimestamp(nodeState?.completedAt)
  const statusMeta = nodeState
    ? EXECUTION_STATUS_META[nodeState.status]
    : null
  const outputPlaceholder = getOutputPlaceholder(
    nodeState?.status,
    nodeState?.isStreaming,
    isExecutionActive,
  )

  return (
    <section className="px-4 py-4" data-testid="node-execution-section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">实时执行</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {nodeState
              ? '节点状态、重试信息与输出流会在这里持续刷新。'
              : isExecutionActive
                ? '当前工作流正在执行，等待该节点开始运行。'
                : '当前没有运行中的节点，保留最近一次执行结果供排查。'}
          </p>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
            statusMeta?.badgeClassName ??
              'border-border bg-muted/60 text-muted-foreground',
          )}
          data-testid="node-execution-status"
        >
          {statusMeta?.label ?? (isExecutionActive ? '待运行' : '空闲')}
        </span>
      </div>

      {nodeState && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-card border border-border bg-surface-elevated p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">步骤 ID</dt>
            <dd className="mt-1 break-all font-mono text-foreground">
              {nodeState.stepId}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">流式状态</dt>
            <dd className="mt-1 text-foreground">
              {nodeState.isStreaming ? '接收中' : '已停止'}
            </dd>
          </div>

          {nodeState.retryAttempt != null && nodeState.retryMaxAttempts != null && (
            <div>
              <dt className="text-muted-foreground">重试进度</dt>
              <dd className="mt-1 text-foreground">
                {nodeState.retryAttempt}/{nodeState.retryMaxAttempts}
              </dd>
            </div>
          )}

          {startedAt && (
            <div>
              <dt className="text-muted-foreground">开始时间</dt>
              <dd className="mt-1 text-foreground">{startedAt}</dd>
            </div>
          )}

          {completedAt && (
            <div>
              <dt className="text-muted-foreground">完成时间</dt>
              <dd className="mt-1 text-foreground">{completedAt}</dd>
            </div>
          )}
        </dl>
      )}

      {executionId && nodeState?.stepId && (
        <ToolCallList
          nodeId={nodeId}
          executionId={executionId}
          stepId={nodeState.stepId}
        />
      )}

      {nodeState?.errorMessage && (
        <div
          className="mt-4 rounded-card border border-error/40 bg-error/10 px-3 py-2"
          data-testid="node-execution-error"
        >
          <p className="text-xs font-medium text-error">执行错误</p>
          <p className="mt-1 text-xs leading-5 text-foreground">
            {nodeState.errorMessage}
          </p>
        </div>
      )}

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            输出流
          </h4>

          {nodeState?.isStreaming && (
            <span className="text-[11px] font-medium text-primary">
              流式输出中
            </span>
          )}
        </div>

        <OutputContentRenderer
          format={getOutputContentFormat(nodeType)}
          output={nodeState?.output}
          isStreaming={nodeState?.isStreaming}
          placeholder={outputPlaceholder}
          dataTestId="node-execution-output"
        />
      </div>
    </section>
  )
})
