import { memo, useState, type ReactNode } from 'react'
import {
  useIsExecutionActive,
  useNodeExecutionState,
} from '@/features/execution'
import { cn } from '@/shared/lib/utils'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import type { CanvasNode } from '../../types'
import {
  getResolvedNodeTypeConfig,
  type NodeConfigFieldSchema,
} from '../../types/nodeTypeRegistry'
import { getOutputContentFormat } from '../../lib/outputContent'
import { getNodeAccentToken, resolveNodeIcon } from '../node/nodeVisualMeta'
import { OutputContentRenderer } from '../output/OutputContentRenderer'

/**
 * workflow 与 agent 两套画布的节点泛型参数不同（`CanvasNode` 固定 `NodeCategory`，
 * agent 画布只用 `Node<CanvasNodeData>`），这里只取真正读到的字段做结构约束。
 */
type ReadOnlyCanvasNode = Pick<CanvasNode, 'id' | 'data'>

interface ReadOnlyNodeSheetProps {
  /** 当前选中的节点；为空时不渲染弹层 */
  node: ReadOnlyCanvasNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 是否附带「实时输出」区块。
   * workflow 画布有执行态，agent 画布没有，因此默认关闭。
   */
  showOutput?: boolean
}

interface ConfigEntry {
  key: string
  label: string
  value: unknown
}

/**
 * 按注册表 schema 顺序列出配置项，schema 之外的历史字段追加在末尾，
 * 保证坏快照 / 动态节点的配置也不会在只读视图里凭空消失。
 */
function collectConfigEntries(
  config: Record<string, unknown>,
  properties: Record<string, NodeConfigFieldSchema>,
): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  const seen = new Set<string>()

  for (const [key, field] of Object.entries(properties)) {
    seen.add(key)
    entries.push({ key, label: field.title || key, value: config[key] })
  }

  for (const [key, value] of Object.entries(config)) {
    if (seen.has(key)) continue
    entries.push({ key, label: key, value })
  }

  return entries
}

function renderConfigValue(value: unknown): ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className="text-muted-foreground">未配置</span>
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return (
      <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {String(value)}
      </span>
    )
  }

  return (
    <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 font-mono text-2xs leading-5 text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/**
 * 小屏节点详情底部弹层：只读展示节点配置与实时输出。
 *
 * 与 `NodeConfigPanel` 的差别是刻意的——这里不渲染任何可编辑表单，
 * 小屏用户只能浏览，编辑一律引导回桌面端。
 */
export const ReadOnlyNodeSheet = memo(function ReadOnlyNodeSheet({
  node: nodeProp,
  open,
  onOpenChange,
  showOutput = false,
}: ReadOnlyNodeSheetProps) {
  // 关闭时调用方会在同一帧把 node 置空；缓存最后一个节点继续渲染，让 Sheet 的退场动画播完
  const [lastNode, setLastNode] = useState(nodeProp)
  if (nodeProp && nodeProp !== lastNode) {
    setLastNode(nodeProp)
  }
  const displayNode = nodeProp ?? lastNode

  const nodeConfig = displayNode
    ? getResolvedNodeTypeConfig(displayNode.data.nodeType, {
        category: displayNode.data.category,
        inputPorts: Array.isArray(displayNode.data.inputPorts)
          ? displayNode.data.inputPorts
          : undefined,
        outputPorts: Array.isArray(displayNode.data.outputPorts)
          ? displayNode.data.outputPorts
          : undefined,
      })
    : null

  if (!displayNode || !nodeConfig) {
    return null
  }
  const node = displayNode

  const accentToken = getNodeAccentToken(node.data.nodeType, nodeConfig.category)
  const NodeIcon = resolveNodeIcon(nodeConfig.icon)
  const rawConfig =
    node.data.config && typeof node.data.config === 'object'
      ? (node.data.config as Record<string, unknown>)
      : {}
  const entries = collectConfigEntries(
    rawConfig,
    nodeConfig.configSchema.properties,
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[78dvh]"
        data-testid="readonly-node-sheet"
      >
        <SheetHeader className="flex-row items-start gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `color-mix(in srgb, ${accentToken} 14%, transparent)`,
              color: accentToken,
            }}
          >
            <NodeIcon className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-sm">
              {node.data.label}
            </SheetTitle>
            <SheetDescription className="truncate text-xs">
              {nodeConfig.isKnownType
                ? `${nodeConfig.label} · 只读浏览`
                : `未知节点类型（${nodeConfig.type}） · 只读浏览`}
            </SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <section data-testid="readonly-node-config">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground">
              配置
            </h3>

            {entries.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                该节点无需额外配置。
              </p>
            ) : (
              <dl className="mt-2 divide-y divide-border rounded-lg border border-border bg-muted">
                {entries.map((entry) => (
                  <div
                    key={entry.key}
                    className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(6rem,34%)_1fr] sm:gap-3"
                  >
                    <dt className="truncate text-muted-foreground">
                      {entry.label}
                    </dt>
                    <dd className="min-w-0 text-foreground">
                      {renderConfigValue(entry.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {showOutput && (
            <ReadOnlyNodeOutput nodeId={node.id} nodeType={node.data.nodeType} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
})

interface ReadOnlyNodeOutputProps {
  nodeId: string
  nodeType: string
}

const ReadOnlyNodeOutput = memo(function ReadOnlyNodeOutput({
  nodeId,
  nodeType,
}: ReadOnlyNodeOutputProps) {
  const nodeState = useNodeExecutionState(nodeId)
  const isExecutionActive = useIsExecutionActive()

  const placeholder = nodeState
    ? '该节点本次执行没有产生输出。'
    : isExecutionActive
      ? '当前工作流正在执行，等待该节点开始运行。'
      : '暂无执行输出。'

  return (
    <section data-testid="readonly-node-output-section">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground">
          输出
        </h3>

        {nodeState?.isStreaming && (
          <span className={cn('text-2xs font-medium text-primary')}>
            流式输出中
          </span>
        )}
      </div>

      <OutputContentRenderer
        className="mt-2"
        format={getOutputContentFormat(nodeType)}
        output={nodeState?.output}
        isStreaming={nodeState?.isStreaming}
        placeholder={placeholder}
        dataTestId="readonly-node-output"
      />
    </section>
  )
})
