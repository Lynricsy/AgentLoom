import { memo, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import {
  useExecutionId,
  useIsExecutionActive,
  useNodeExecutionState,
} from '@/features/execution/stores/executionStore'
import { ToolCallList } from '@/features/execution/components/ToolCallList'
import type { StepStatus } from '@/features/execution/types'
import { cn } from '@/shared/lib/utils'
import {
  LlmModelConfigPanel,
  parseLlmModelConfig,
  type LlmNodeDataPatch,
} from '@/features/llm'
import type { CanvasNode } from '../../types'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { useCanvasActions, useCanvasStore } from '../../stores/canvasStore'
import { McpToolConfigPanel } from './McpToolConfigPanel'
import { KnowledgeBaseConfigPanel } from './KnowledgeBaseConfigPanel'
import { SandboxConfigPanel } from './SandboxConfigPanel'
import { InterventionPanel } from './InterventionPanel'
import { HttpToolConfigPanel } from './HttpToolConfigPanel'
import { CodeToolConfigPanel } from './CodeToolConfigPanel'
import { ReusableBlockPanel } from './ReusableBlockPanel'
import { SmartRoutingConfigPanel } from './SmartRoutingConfigPanel'
import { PluginConfigPanel } from './PluginConfigPanel'
import { AgentNodeConfigPanel } from './AgentNodeConfigPanel'
import { MemoryConfigPanel } from './MemoryConfigPanel'
import { InputPreprocessorConfigPanel } from './InputPreprocessorConfigPanel'
import { ConditionConfigPanel } from './ConditionConfigPanel'
import { ScheduleTriggerConfigPanel } from './ScheduleTriggerConfigPanel'
import { WebhookTriggerConfigPanel } from './WebhookTriggerConfigPanel'
import { ApiEventTriggerConfigPanel } from './ApiEventTriggerConfigPanel'
import { SkillPanel } from '../../../agent-canvas/components/panels/SkillPanel'
import { DynamicConfigForm } from './DynamicConfigForm'

interface NodeConfigPanelProps {
  className?: string
}

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
    badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
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
    badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
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

export const NodeConfigPanel = memo(function NodeConfigPanel({
  className,
}: NodeConfigPanelProps) {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const node = useCanvasStore((s) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) ?? null : null
  )

  const { selectNode, updateNodeData, setNodeValidationError } = useCanvasActions()

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

  const handleValidationChange = useCallback(
    (hasErrors: boolean) => {
      if (!selectedNodeId) return
      setNodeValidationError(selectedNodeId, hasErrors)
    },
    [selectedNodeId, setNodeValidationError],
  )

  if (!node) return null

  const nodeType = node.data.nodeType
  const nodeConfig = getNodeTypeConfig(nodeType)

  return (
    <aside
      data-testid="node-config-panel"
      className={cn(
        'flex h-full w-80 flex-col border-l border-border bg-background',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{node.data.label}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {nodeConfig.label} 配置
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="关闭配置面板"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <NodeConfigDispatch
          node={node}
          onConfigChange={handleConfigChange}
          onValidationChange={handleValidationChange}
        />

        <NodeExecutionSection nodeId={node.id} />
      </div>
    </aside>
  )
})

interface NodeConfigDispatchProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

interface CustomPanelRendererProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

interface CustomPanelEntry {
  handlesValidation?: boolean
  render: (props: CustomPanelRendererProps) => React.ReactNode
}

const CUSTOM_PANEL_REGISTRY: Partial<Record<CanvasNode['data']['nodeType'], CustomPanelEntry>> = {
  'llm-model': {
    render: ({ node, onConfigChange }) => {
      const handleLlmChange = (patch: LlmNodeDataPatch) => {
        onConfigChange({
          config: patch.config,
          llmConfigId: patch.llmConfigId,
          parameters: patch.parameters,
          label: patch.label,
        })
      }

      return (
        <LlmModelConfigPanel
          config={parseLlmModelConfig(node.data.config ?? null)}
          onApply={handleLlmChange}
        />
      )
    },
  },
  'mcp-tool': {
    render: ({ node }) => <McpToolConfigPanel data={node.data} />,
  },
  'knowledge-base': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <KnowledgeBaseConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  sandbox: {
    render: ({ node, onConfigChange }) => (
      <SandboxConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'http-tool': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <HttpToolConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'code-tool': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <CodeToolConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'reusable-block': {
    render: ({ node, onConfigChange }) => (
      <ReusableBlockPanel data={node.data} onApply={onConfigChange} />
    ),
  },
  'smart-routing': {
    render: ({ node, onConfigChange }) => (
      <SmartRoutingConfigPanel node={node} onConfigChange={onConfigChange} />
    ),
  },
  'plugin': {
    handlesValidation: true,
    render: ({ node, onConfigChange }) => (
      <PluginConfigPanel node={node} onConfigChange={onConfigChange} />
    ),
  },
  'agent': {
    render: ({ node, onConfigChange }) => (
      <AgentNodeConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'memory': {
    handlesValidation: true,
    render: ({ node, onConfigChange, onValidationChange }) => (
      <MemoryConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
        onValidationChange={onValidationChange}
      />
    ),
  },
  'skill': {
    render: ({ node, onConfigChange }) => (
      <SkillPanel
        config={node.data.config}
        onApply={(config) => onConfigChange({ config })}
      />
    ),
  },
  'input-preprocessor': {
    render: ({ node, onConfigChange }) => (
      <InputPreprocessorConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'condition': {
    render: ({ node, onConfigChange }) => (
      <ConditionConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'schedule-trigger': {
    render: ({ node, onConfigChange }) => (
      <ScheduleTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'webhook-trigger': {
    render: ({ node, onConfigChange }) => (
      <WebhookTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
  'api-event-trigger': {
    render: ({ node, onConfigChange }) => (
      <ApiEventTriggerConfigPanel
        config={node.data.config}
        onApply={onConfigChange}
      />
    ),
  },
}

const NodeConfigDispatch = memo(function NodeConfigDispatch({
  node,
  onConfigChange,
  onValidationChange,
}: NodeConfigDispatchProps) {
  const nodeType = node.data.nodeType

  const nodeConfig = getNodeTypeConfig(nodeType)
  const customPanel = CUSTOM_PANEL_REGISTRY[nodeType]
  const hasDynamicConfigFields = Object.keys(nodeConfig.configSchema.properties).length > 0

  useEffect(() => {
    if ((!customPanel || !customPanel.handlesValidation) && !hasDynamicConfigFields) {
      onValidationChange(false)
      return
    }

    if (customPanel && !customPanel.handlesValidation) {
      onValidationChange(false)
    }
  }, [customPanel, hasDynamicConfigFields, onValidationChange])

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
}

const NodeExecutionSection = memo(function NodeExecutionSection({
  nodeId,
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
    <section
      className="border-t border-border px-4 py-4"
      data-testid="node-execution-section"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">实时执行</h3>
          <p className="mt-1 text-xs text-muted-foreground">
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
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
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

      <InterventionPanel nodeId={nodeId} />

      {executionId && nodeState?.stepId && (
        <ToolCallList
          nodeId={nodeId}
          executionId={executionId}
          stepId={nodeState.stepId}
        />
      )}

      {nodeState?.errorMessage && (
        <div
          className="mt-4 rounded-xl border border-error/40 bg-error/10 px-3 py-2"
          data-testid="node-execution-error"
        >
          <p className="text-xs font-medium text-error">执行错误</p>
          <p className="mt-1 text-xs leading-5 text-foreground">
            {nodeState.errorMessage}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
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

        <pre
          className="min-h-40 whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-[#050816] px-3 py-3 font-mono text-xs leading-6 text-slate-100"
          data-testid="node-execution-output"
        >
          {nodeState?.output || outputPlaceholder}
        </pre>
      </div>
    </section>
  )
})
