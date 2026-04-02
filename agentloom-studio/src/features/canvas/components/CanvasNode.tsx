import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  AlertTriangle,
  ArrowRightFromLine,
  Bot,
  BookOpenText,
  Brain,
  BrainCircuit,
  Braces,
  CircleOff,
  Clock,
  Code,
  Container,
  Database,
  ChevronDown,
  ChevronRight,
  FileText,
  FastForward,
  Filter,
  GitBranch,
  GitFork,
  GitMerge,
  Globe,
  MessageSquare,
  Package,
  Play,
  Plug,
  Puzzle,
  Radio,
  RefreshCcw,
  Repeat,
  Repeat2,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import { Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import {
  getLlmConfigState,
  getProviderInfo,
  parseLlmModelConfig,
  ProviderIcon,
  useLlmApiKeys,
} from '@/features/llm'
import { useNodeExecutionState } from '@/features/execution/stores/executionStore'
import type { StepStatus } from '@/features/execution/types'
import type { CanvasNode, PluginNodeData, SmartRoutingNodeData } from '../types'
import type { AgentNodeData as WorkflowAgentNodeData } from '@/features/agent/types'
import { getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { useLevelOfDetail } from '../hooks/useLevelOfDetail'
import {
  useCanvasActions,
  useCanvasStore,
  useNodeHasValidationError,
} from '../stores/canvasStore'
import { NODE_CATEGORIES } from './nodeCategories'
import { NodeExecutionOverlay } from './NodeExecutionOverlay'
import { TypedPort } from './TypedPort'
import { KnowledgeBaseNodeBody } from './nodes/KnowledgeBaseNodeBody'
import { LlmModelNodeBody } from './nodes/LlmModelNodeBody'
import { McpToolNodeBody } from './nodes/McpToolNodeBody'
import { ReusableBlockBody } from './nodes/ReusableBlockBody'
import { SandboxNodeBody } from './nodes/SandboxNodeBody'
import { SmartRoutingNodeBody } from './nodes/SmartRoutingNodeBody'
import { PluginNodeBody } from './nodes/PluginNodeBody'
import { AgentNodeBody } from './nodes/AgentNodeBody'
import { MemoryNodeBody } from './nodes/MemoryNodeBody'
import { WorkspaceNodeBody } from './nodes/WorkspaceNodeBody'
import { InputPreprocessorNodeBody } from './nodes/InputPreprocessorNodeBody'
import { ConditionNodeBody } from './nodes/ConditionNodeBody'
import { ControlFlowSpecialNodeBody } from './nodes/ControlFlowSpecialNodeBody'
import { IterationNodeBody } from './nodes/IterationNodeBody'
import { LoopNodeBody } from './nodes/LoopNodeBody'
import { MergeNodeBody } from './nodes/MergeNodeBody'
import { HttpToolNodeBody } from './nodes/HttpToolNodeBody'
import { CodeToolNodeBody } from './nodes/CodeToolNodeBody'
import { ManualTriggerNodeBody } from './nodes/ManualTriggerNodeBody'
import { ScheduleTriggerNodeBody } from './nodes/ScheduleTriggerNodeBody'
import { WebhookTriggerNodeBody } from './nodes/WebhookTriggerNodeBody'
import { ApiEventTriggerNodeBody } from './nodes/ApiEventTriggerNodeBody'
import { SkillBody } from '../../agent-canvas/components/nodes/SkillBody'
import { SubAgentNodeBody } from '../../agent-canvas/components/nodes/SubAgentNodeBody'
import {
  isCompoundContainerNodeType,
  isCompoundSpecialNodeType,
} from '../types/controlFlow.types'
import {
  getCompoundFrameInsets,
  resolveCompoundContainerSize,
  computeChildrenBoundingBox,
  computeMinResizeSize,
} from '../lib/compoundLayout'

const NODE_TYPE_ICONS: Record<string, LucideIcon> = {
  Bot,
  BookOpenText,
  Brain,
  MessageSquare,
  Globe,
  Code,
  Plug,
  Container,
  Play,
  Clock,
  Database,
  FileText,
  Braces,
  GitBranch,
  GitFork,
  GitMerge,
  Repeat,
  Repeat2,
  Package,
  Puzzle,
  Radio,
  BrainCircuit,
  Webhook,
  Filter,
  RefreshCcw,
  ArrowRightFromLine,
  CircleOff,
  FastForward,
}

type NodeShellStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_intervention'

const COMPACT_STATUS_META: Record<StepStatus | 'idle', { label: string; className: string }> = {
  idle: {
    label: '空闲',
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
  pending: {
    label: '等待中',
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
  queued: {
    label: '排队中',
    className: 'border-slate-400/30 bg-slate-500/10 text-slate-300',
  },
  running: {
    label: '运行中',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  completed: {
    label: '已完成',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  failed: {
    label: '失败',
    className: 'border-error/30 bg-error/10 text-error',
  },
  waiting_intervention: {
    label: '待干预',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  skipped: {
    label: '已跳过',
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
  cancelled: {
    label: '已取消',
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
}


function getNodeColorToken(
  nodeType: CanvasNode['data']['nodeType'],
  rawConfig: Record<string, unknown>,
  fallback: string,
  hasProviderDefaultKey = false,
) {
  if (nodeType !== 'llm-model') {
    return fallback
  }

  const state = getLlmConfigState(rawConfig, hasProviderDefaultKey)

  switch (state) {
    case 'unconfigured':
      return 'var(--color-muted)'
    case 'warning':
      return 'var(--color-warning)'
    default:
      return 'var(--color-type-model)'
  }
}

function getShellStatus(
  status: StepStatus | undefined,
  showCompletedAccent: boolean,
): NodeShellStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'queued':
      return 'queued'
    case 'failed':
      return 'failed'
    case 'waiting_intervention':
      return 'waiting_intervention'
    case 'completed':
      return showCompletedAccent ? 'completed' : 'idle'
    default:
      return 'idle'
  }
}

function getShellAccentVisual(status: NodeShellStatus): {
  className: string
  style?: CSSProperties
} | null {
  switch (status) {
    case 'running':
      return {
        className: 'bg-primary animate-pulse',
      }
    case 'completed':
      return {
        className: '',
        style: { backgroundColor: 'var(--color-success, #22c55e)' },
      }
    case 'failed':
      return {
        className: 'bg-error',
      }
    case 'waiting_intervention':
      return {
        className: 'animate-pulse',
        style: { backgroundColor: 'var(--color-warning, #f59e0b)' },
      }
    case 'queued':
      return {
        className: 'bg-slate-400/80',
      }
    default:
      return null
  }
}

function getMinimalHandleOffsets(count: number): string[] {
  if (count <= 0) {
    return []
  }

  if (count === 1) {
    return ['50%']
  }

  return Array.from(
    { length: count },
    (_, index) => `${((index + 1) / (count + 1)) * 100}%`,
  )
}

export const CanvasNodeShell = memo(function CanvasNodeShell({
  id,
  data,
  selected,
  isConnectable = true,
}: NodeProps<CanvasNode>) {
  const config = getNodeTypeConfig(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[data.category]
  const NodeTypeIcon = NODE_TYPE_ICONS[config.icon] ?? Bot
  const { data: activeApiKeys = [] } = useLlmApiKeys()
  const nodeExecutionState = useNodeExecutionState(id)
  const hasValidationError = useNodeHasValidationError(id)
  const lod = useLevelOfDetail()
  const llmConfig = data.nodeType === 'llm-model' ? parseLlmModelConfig(data) : null
  const hasProviderDefaultKey = useMemo(() => {
    if (!llmConfig) {
      return false
    }

    return activeApiKeys.some((apiKey) => apiKey.provider === llmConfig.provider && apiKey.isDefault)
  }, [activeApiKeys, llmConfig])
  const llmState = data.nodeType === 'llm-model'
    ? getLlmConfigState(data, hasProviderDefaultKey)
    : null
  const providerInfo = llmConfig ? getProviderInfo(llmConfig.provider) : null
  const colorToken = getNodeColorToken(
    data.nodeType,
    data.config,
    config.colorToken ?? categoryMeta.color,
    hasProviderDefaultKey,
  )
  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : config.inputPorts
  const outputPorts = Array.isArray(data.outputPorts) ? data.outputPorts : config.outputPorts
  const isCompoundContainer = isCompoundContainerNodeType(data.nodeType)
  const isCompoundCollapsed =
    isCompoundContainer && data.config?.isCollapsed === true
  const compoundMinimumSize = useMemo(
    () =>
      isCompoundContainer
        ? resolveCompoundContainerSize({
            inputPortCount: inputPorts.length,
            outputPortCount: outputPorts.length,
            isCollapsed: isCompoundCollapsed,
          })
        : null,
    [inputPorts.length, isCompoundCollapsed, isCompoundContainer, outputPorts.length],
  )
  const compoundFrameInsets = useMemo(
    () =>
      isCompoundContainer && !isCompoundCollapsed
        ? getCompoundFrameInsets(inputPorts.length, outputPorts.length)
        : null,
    [inputPorts.length, isCompoundCollapsed, isCompoundContainer, outputPorts.length],
  )
  const compoundMinResizeSize = useCanvasStore(
    useCallback(
      (s) => {
        if (!isCompoundContainer || isCompoundCollapsed) {
          return null
        }

        const frameInsets = getCompoundFrameInsets(inputPorts.length, outputPorts.length)
        const children = s.nodes.filter((n) => n.parentId === id)
        const bbox = computeChildrenBoundingBox(children)
        const minSize = computeMinResizeSize(bbox, frameInsets)
        return `${minSize.width},${minSize.height}`
      },
      [id, inputPorts.length, isCompoundCollapsed, isCompoundContainer, outputPorts.length],
    ),
  )
  const parsedMinResize = useMemo(() => {
    if (!compoundMinResizeSize) {
      return null
    }

    const [w, h] = compoundMinResizeSize.split(',').map(Number)
    return { width: w!, height: h! }
  }, [compoundMinResizeSize])
  const compoundBodyLabel = data.nodeType === 'loop' ? '循环体' : data.nodeType === 'iteration' ? '迭代体' : '容器体'
  const subtitle = data.nodeType === 'llm-model'
    ? llmConfig
      ? `${providerInfo?.name ?? llmConfig.provider} · ${llmConfig.name}`
      : '点击配置模型'
    : data.description ?? data.nodeType
  const title = data.nodeType === 'llm-model'
    ? llmConfig?.modelName ?? data.label
    : data.label
  const compactStatusMeta = COMPACT_STATUS_META[nodeExecutionState?.status ?? 'idle']
  const canvasEdges = useCanvasStore((s) => s.edges)
  const [showCompletedAccent, setShowCompletedAccent] = useState(
    nodeExecutionState?.status === 'completed',
  )
  const shellStatus = getShellStatus(nodeExecutionState?.status, showCompletedAccent)
  const shellAccentVisual = getShellAccentVisual(shellStatus)
  const isMinimal = lod === 'minimal'
  const inputHandleOffsets = useMemo(
    () => getMinimalHandleOffsets(inputPorts.length),
    [inputPorts.length],
  )
  const outputHandleOffsets = useMemo(
    () => getMinimalHandleOffsets(outputPorts.length),
    [outputPorts.length],
  )
  const connectedSmartRoutingModelCount = useMemo(() => {
    if (data.nodeType !== 'smart-routing') {
      return undefined
    }

    const modelInputIds = new Set(
      inputPorts.filter((port) => port.dataType === 'model').map((port) => port.id),
    )

    return canvasEdges.filter(
      (edge) => edge.target === id && (!edge.targetHandle || modelInputIds.has(edge.targetHandle)),
    ).length
  }, [canvasEdges, data.nodeType, id, inputPorts])

  const hasSchemaConnection = useMemo(() => {
    if (data.nodeType !== 'agent') {
      return false
    }

    return canvasEdges.some(
      (edge) => edge.target === id && edge.targetHandle === 'schema-in',
    )
  }, [canvasEdges, data.nodeType, id])

  const { setHoveredNodeId, updateNodeData } = useCanvasActions()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSearchActive = useCanvasStore((s) => s.isSearchOpen && s.searchQuery.length > 0)
  const isMatch = useCanvasStore((s) => s.searchMatchIds.includes(id))
  const isCurrent = useCanvasStore((s) => s.searchMatchIds[s.currentSearchIndex] === id)

  const onMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredNodeId(id)
    }, 300)
  }, [id, setHoveredNodeId])

  const onMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoveredNodeId(null)
  }, [setHoveredNodeId])

  const onToggleCompoundCollapse = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (!isCompoundContainer) {
        return
      }

      updateNodeData(id, {
        config: {
          ...data.config,
          isCollapsed: !isCompoundCollapsed,
        },
      })
    },
    [data.config, id, isCompoundCollapsed, isCompoundContainer, updateNodeData],
  )

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (nodeExecutionState?.status !== 'completed') {
      setShowCompletedAccent(false)
      return
    }

    setShowCompletedAccent(true)
    const timer = window.setTimeout(() => {
      setShowCompletedAccent(false)
    }, 2000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [nodeExecutionState?.status])

  return (
    <article
      data-lod={lod}
      data-shell-status={shellStatus}
      data-testid={`canvas-node-${id}`}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'canvas-node-shell relative rounded-lg border bg-card text-card-foreground transition-[width,box-shadow,border-color,transform] duration-200',
        isCompoundContainer && 'h-full w-full',
        lod === 'full' && !isCompoundContainer && 'min-w-[180px] max-w-[260px]',
        lod === 'full' &&
          isCompoundContainer &&
          !isCompoundCollapsed &&
          'max-w-none overflow-hidden',
        lod === 'full' &&
          isCompoundContainer &&
          isCompoundCollapsed &&
          'max-w-[360px] overflow-hidden',
        lod === 'compact' && 'min-w-[156px] max-w-[180px]',
        lod === 'minimal' && 'h-[80px] min-w-[80px] max-w-[80px]',
        selected && 'ring-0',
        data.nodeType === 'llm-model' && llmState === 'unconfigured' && 'border-border/80 bg-muted/10',
        data.nodeType === 'llm-model' && llmState === 'warning' && 'border-warning/40 bg-warning/5',
        isSearchActive && isMatch && !isCurrent && 'search-match',
        isSearchActive && isCurrent && 'search-current',
        isSearchActive && !isMatch && 'search-dimmed',
      )}
      style={
        {
          '--node-color': colorToken,
          ...(compoundMinimumSize
            ? {
                minWidth: compoundMinimumSize.width,
                minHeight: compoundMinimumSize.height,
              }
            : {}),
        } as CSSProperties
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {shellAccentVisual ? (
        <div
          data-testid={`canvas-node-shell-accent-${id}`}
          data-shell-status={shellStatus}
          className={cn(
            'pointer-events-none absolute inset-y-2 left-0 z-[1] w-1 rounded-full',
            shellAccentVisual.className,
          )}
          style={shellAccentVisual.style}
        />
      ) : null}

      {!isMinimal ? <NodeExecutionOverlay nodeId={id} /> : null}

      {isCompoundContainer && !isCompoundCollapsed && compoundFrameInsets ? (
        <NodeResizer
          isVisible={!!selected}
          minWidth={parsedMinResize?.width ?? compoundMinimumSize?.width ?? 800}
          minHeight={parsedMinResize?.height ?? compoundMinimumSize?.height ?? 600}
          lineClassName="!border-primary/30"
          handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-primary/50 !bg-background"
        />
      ) : null}

      {isCompoundContainer && lod === 'full' && compoundFrameInsets ? (
        <div
          className="pointer-events-none absolute flex flex-col overflow-hidden rounded-xl border border-border/40 bg-muted/[0.06]"
          style={{
            top: compoundFrameInsets.top,
            right: compoundFrameInsets.right,
            bottom: compoundFrameInsets.bottom,
            left: compoundFrameInsets.left,
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-border/25 px-3 py-1">
            {data.nodeType === 'iteration' ? (
              <Repeat2 className="h-3 w-3 text-muted-foreground/50" />
            ) : (
              <Repeat className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
              {compoundBodyLabel}
            </span>
          </div>
        </div>
      ) : null}

      {hasValidationError && lod !== 'minimal' ? (
        <div
          data-testid={`canvas-node-validation-badge-${id}`}
          className="absolute right-10 top-2 z-10 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-[11px] font-medium text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
      ) : null}

      {isMinimal ? (
        <div
          data-slot="icon-only"
          className="flex h-full items-center justify-center px-2 py-2"
        >
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/25"
            style={{ color: colorToken }}
          >
            <NodeTypeIcon
              className="h-4 w-4"
              data-testid={`canvas-node-icon-${id}`}
              aria-hidden="true"
            />
          </span>
        </div>
      ) : lod === 'compact' ? (
        <header data-slot="header" className="border-b border-border/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/20"
              style={{ color: colorToken }}
            >
              <NodeTypeIcon
                className="h-4 w-4"
                data-testid={`canvas-node-icon-${id}`}
                aria-hidden="true"
              />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">{title}</h3>
            <span
              data-testid={`canvas-node-status-badge-${id}`}
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                compactStatusMeta.className,
              )}
            >
              {compactStatusMeta.label}
            </span>
          </div>
        </header>
      ) : (
        <header data-slot="header" className="border-b border-border/50 px-3 py-2">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorToken }}
            />
            <span
              className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              style={{ borderColor: colorToken }}
            >
              {categoryMeta.label}
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {data.nodeType}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {data.nodeType === 'llm-model' ? (
                llmConfig ? (
                  <ProviderIcon provider={llmConfig.provider} size={15} className="shrink-0 text-foreground" />
                ) : (
                  <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
                )
              ) : null}
              <h3 className="truncate text-sm font-medium leading-tight">{title}</h3>
              {data.nodeType === 'llm-model' && llmState === 'warning' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              ) : null}
              {isCompoundContainer ? (
                <button
                  type="button"
                  onClick={onToggleCompoundCollapse}
                  className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  aria-label={isCompoundCollapsed ? '展开容器' : '收起容器'}
                  data-testid={`compound-toggle-${id}`}
                >
                  {isCompoundCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </header>
      )}

      {isMinimal && inputPorts.length > 0 ? (
        <div className="absolute inset-y-2 left-0 z-[2] w-0">
          {inputPorts.map((port, index) => (
            <div
              key={port.id}
              className="minimal-port-anchor absolute left-0 h-4 w-0"
              style={{ top: inputHandleOffsets[index], transform: 'translateY(-50%)' }}
            >
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Left}
                isConnectable={isConnectable}
              />
            </div>
          ))}
        </div>
      ) : null}

      {!isMinimal && inputPorts.length > 0 ? (
        <section data-slot="inputs" className="py-1">
          {inputPorts.map((port) => (
            <div
              key={port.id}
              className={cn(
                'port-row relative flex items-center pl-0 pr-3',
                lod === 'full' ? 'h-6' : 'h-4',
              )}
            >
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Left}
                isConnectable={isConnectable}
              />
              {lod === 'full' ? (
                port.description ? (
                  <Tooltip.Provider delayDuration={400}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className="ml-3 truncate text-xs text-muted-foreground">{port.label}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="bottom"
                          sideOffset={4}
                          className="z-50 max-w-56 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
                        >
                          {port.description}
                          <Tooltip.Arrow className="fill-popover" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                ) : (
                  <span className="ml-3 truncate text-xs text-muted-foreground">{port.label}</span>
                )
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {lod === 'full' ? (
        <div data-slot="body" className="px-3 py-2 text-xs text-muted-foreground">
          {data.nodeType === 'llm-model' ? (
            <LlmModelNodeBody source={data} state={llmState ?? 'unconfigured'} />
          ) : data.nodeType === 'mcp-tool' ? (
            <McpToolNodeBody data={data} />
          ) : data.nodeType === 'knowledge-base' ? (
            <KnowledgeBaseNodeBody config={data.config} />
          ) : data.nodeType === 'sandbox' ? (
            <SandboxNodeBody data={data} />
          ) : data.nodeType === 'reusable-block' ? (
            <ReusableBlockBody nodeId={id} data={data} />
          ) : data.nodeType === 'smart-routing' ? (
            <SmartRoutingNodeBody
              data={data as SmartRoutingNodeData}
              connectedModelCount={connectedSmartRoutingModelCount}
            />
          ) : data.nodeType === 'plugin' ? (
            <PluginNodeBody data={data as PluginNodeData} />
          ) : data.nodeType === 'memory' ? (
            <MemoryNodeBody config={data.config} />
          ) : data.nodeType === 'workspace' ? (
            <WorkspaceNodeBody config={data.config} />
          ) : data.nodeType === 'agent' ? (
            <AgentNodeBody data={data as WorkflowAgentNodeData} hasSchemaConnection={hasSchemaConnection} />
          ) : data.nodeType === 'skill' ? (
            <SkillBody data={data} />
          ) : (data.nodeType as string) === 'sub-agent' ? (
            <SubAgentNodeBody data={data} />
          ) : data.nodeType === 'input-preprocessor' ? (
            <InputPreprocessorNodeBody config={data.config} />
          ) : data.nodeType === 'condition' ? (
            <ConditionNodeBody config={data.config} />
          ) : data.nodeType === 'loop' ? (
            <LoopNodeBody config={data.config} />
          ) : data.nodeType === 'iteration' ? (
            <IterationNodeBody config={data.config} />
          ) : isCompoundSpecialNodeType(data.nodeType) ? (
            <ControlFlowSpecialNodeBody nodeType={data.nodeType} config={data.config} />
          ) : data.nodeType === 'merge' ? (
            <MergeNodeBody config={data.config} />
          ) : data.nodeType === 'http-tool' ? (
            <HttpToolNodeBody config={data.config} />
          ) : data.nodeType === 'code-tool' ? (
            <CodeToolNodeBody config={data.config} />
          ) : data.nodeType === 'manual-trigger' ? (
            <ManualTriggerNodeBody />
          ) : data.nodeType === 'schedule-trigger' ? (
            <ScheduleTriggerNodeBody config={data.config} />
          ) : data.nodeType === 'webhook-trigger' ? (
            <WebhookTriggerNodeBody config={data.config} />
          ) : data.nodeType === 'api-event-trigger' ? (
            <ApiEventTriggerNodeBody config={data.config} />
          ) : (
            config.description
          )}
        </div>
      ) : null}

      {isMinimal && outputPorts.length > 0 ? (
        <div className="absolute inset-y-2 right-0 z-[2] w-0">
          {outputPorts.map((port, index) => (
            <div
              key={port.id}
              className="minimal-port-anchor absolute right-0 h-4 w-0"
              style={{ top: outputHandleOffsets[index], transform: 'translateY(-50%)' }}
            >
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Right}
                isConnectable={isConnectable}
              />
            </div>
          ))}
        </div>
      ) : null}

      {!isMinimal && outputPorts.length > 0 ? (
        <section data-slot="outputs" className="py-1">
          {outputPorts.map((port) => (
            <div
              key={port.id}
              className={cn(
                'port-row relative flex items-center justify-end pl-3 pr-0',
                lod === 'full' ? 'h-6' : 'h-4',
              )}
            >
              {lod === 'full' ? (
                port.description ? (
                  <Tooltip.Provider delayDuration={400}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className="mr-3 truncate text-xs text-muted-foreground">{port.label}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="bottom"
                          sideOffset={4}
                          className="z-50 max-w-56 rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
                        >
                          {port.description}
                          <Tooltip.Arrow className="fill-popover" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                ) : (
                  <span className="mr-3 truncate text-xs text-muted-foreground">{port.label}</span>
                )
              ) : null}
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Right}
                isConnectable={isConnectable}
              />
            </div>
          ))}
        </section>
      ) : null}

      <div data-slot="state" data-state={llmState ?? 'idle'} className="sr-only">
        {llmState ?? 'idle'}
      </div>
    </article>
  )
})
