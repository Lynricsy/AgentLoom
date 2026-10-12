import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { AnimatePresence } from 'motion/react'
import {
  AlertCircle,
  ArrowLeft,
  Maximize2,
  Network,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { CANVAS_FLOATING_CLASS } from '@/features/canvas'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageContainer } from '@/shared/components/page-container/PageContainer'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import { useMemoryGraph } from './api'
import {
  MemoryGraphNode,
  NODE_TYPE_COLORS,
  NODE_TYPE_LABELS,
} from './MemoryGraphNode'
import { MemoryGraphEdge } from './MemoryGraphEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import { GraphSearchBar } from './GraphSearchBar'
import type {
  MemoryNode,
  MemoryEdge as MemoryEdgeType,
  MemoryGraphFlowNode,
  MemoryGraphFlowEdge,
  MemoryGraphNodeData,
  MemoryGraphEdgeData,
  MemoryNodeType,
} from './types'

const NODE_WIDTH = 220
const NODE_HEIGHT = 120

// ReactFlow v12 NodeTypes/EdgeTypes 泛型约束需要桥接自定义节点类型
const nodeTypes: NodeTypes = {
  memoryGraphNode: MemoryGraphNode as NodeTypes[string],
}

const edgeTypes: EdgeTypes = {
  memoryGraphEdge: MemoryGraphEdge as EdgeTypes[string],
}

const LEGEND_ENTRIES = Object.keys(NODE_TYPE_LABELS) as MemoryNodeType[]

function snippetize(content: string | null, maxLen = 50): string {
  if (!content) return ''
  const trimmed = content.trim()
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed
}

function applyDagreLayout(
  nodes: MemoryNode[],
  edges: MemoryEdgeType[],
  searchQuery: string,
): { flowNodes: MemoryGraphFlowNode[]; flowEdges: MemoryGraphFlowEdge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.parentNodeId, edge.childNodeId)
  }

  dagre.layout(g)

  const lowerQuery = searchQuery.toLowerCase().trim()

  const flowNodes: MemoryGraphFlowNode[] = nodes.map((node) => {
    const pos = g.node(node.id)
    const matchesSearch =
      lowerQuery.length > 0 &&
      (node.name.toLowerCase().includes(lowerQuery) ||
        (node.content?.toLowerCase().includes(lowerQuery) ?? false) ||
        (node.domain?.toLowerCase().includes(lowerQuery) ?? false))

    return {
      id: node.id,
      type: 'memoryGraphNode' as const,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        nodeId: node.id,
        name: node.name,
        nodeType: node.nodeType,
        domain: node.domain,
        contentSnippet: snippetize(node.content),
        disclosureLevel: node.disclosureLevel,
        isHighlighted: matchesSearch,
        isDimmed: lowerQuery.length > 0 && !matchesSearch,
      } satisfies MemoryGraphNodeData,
    }
  })

  const flowEdges: MemoryGraphFlowEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.parentNodeId,
    target: edge.childNodeId,
    type: 'memoryGraphEdge' as const,
    data: {
      edgeName: edge.name,
      priority: edge.priority,
    } satisfies MemoryGraphEdgeData,
  }))

  return { flowNodes, flowEdges }
}

interface MemoryGraphPageProps {
  instanceId: string
}

export const MemoryGraphPage = memo(function MemoryGraphPage({
  instanceId,
}: MemoryGraphPageProps) {
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } =
    useMemoryGraph(instanceId)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<MemoryGraphFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<MemoryGraphFlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const initialFitDone = useRef(false)

  // 应用布局
  const applyLayout = useCallback(
    (memoryNodes: MemoryNode[], memoryEdges: MemoryEdgeType[], query: string) => {
      const { flowNodes, flowEdges } = applyDagreLayout(
        memoryNodes,
        memoryEdges,
        query,
      )
      setNodes(flowNodes)
      setEdges(flowEdges)
    },
    [setNodes, setEdges],
  )

  // 数据变化时重新布局
  useEffect(() => {
    if (!data || data.nodes.length === 0) return
    applyLayout(data.nodes, data.edges, searchQuery)
    initialFitDone.current = false
  }, [data, applyLayout]) // searchQuery 在下面的 effect 中单独处理

  // 搜索变化时仅更新高亮状态（不重建布局）
  useEffect(() => {
    if (!data || data.nodes.length === 0) return
    const lowerQuery = searchQuery.toLowerCase().trim()

    setNodes((nds) =>
      nds.map((n) => {
        const node = data.nodes.find((mn) => mn.id === n.id)
        if (!node) return n
        const matchesSearch =
          lowerQuery.length > 0 &&
          (node.name.toLowerCase().includes(lowerQuery) ||
            (node.content?.toLowerCase().includes(lowerQuery) ?? false) ||
            (node.domain?.toLowerCase().includes(lowerQuery) ?? false))
        return {
          ...n,
          data: {
            ...n.data,
            isHighlighted: matchesSearch,
            isDimmed: lowerQuery.length > 0 && !matchesSearch,
          },
        }
      }),
    )
  }, [searchQuery, data, setNodes])

  // 初始 fitView
  useEffect(() => {
    if (nodes.length > 0 && !initialFitDone.current) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 })
        initialFitDone.current = true
      })
    }
  }, [nodes, fitView])

  // 记忆化 — 搜索匹配数
  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || !data) return 0
    const lq = searchQuery.toLowerCase().trim()
    return data.nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(lq) ||
        (n.content?.toLowerCase().includes(lq) ?? false) ||
        (n.domain?.toLowerCase().includes(lq) ?? false),
    ).length
  }, [searchQuery, data])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: MemoryGraphFlowNode) => {
      setSelectedNodeId(node.data.nodeId)
    },
    [],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }, [refetch])

  const handleBack = useCallback(() => {
    void navigate({ to: '/memory/$id', params: { id: instanceId } })
  }, [navigate, instanceId])

  // -- 加载态 --
  if (isLoading) {
    return (
      <div
        className="relative h-full w-full bg-background"
        data-testid="memory-graph-loading"
      >
        <Skeleton className="absolute left-4 top-4 h-9 w-64 rounded-xl" />
        <div className="grid h-full place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <p className="text-xs text-muted-foreground">正在加载记忆图谱…</p>
          </div>
        </div>
      </div>
    )
  }

  // -- 错误态 --
  if (isError) {
    return (
      <PageContainer data-testid="memory-graph-error">
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载记忆图失败"
          description={error?.message ?? '请检查网络连接后重试。'}
          action={
            <Button
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <Spinner size="sm" />
                  重试中…
                </>
              ) : (
                '重试加载'
              )}
            </Button>
          }
        />
      </PageContainer>
    )
  }

  // -- 空态 --
  if (!data || data.nodes.length === 0) {
    return (
      <PageContainer data-testid="memory-graph-empty">
        <EmptyState
          icon={Network}
          tone="var(--color-node-memory)"
          title="暂无记忆节点"
          description="该实例还没有写入任何记忆节点，Agent 运行后会自动填充图谱。"
          action={
            <Button variant="outline" onClick={handleBack}>
              返回实例详情
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <div
      className="relative h-full w-full bg-background"
      data-testid="memory-graph-view"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border)"
        />
      </ReactFlow>

      {/* 左上：返回 + 搜索 */}
      <div className="absolute left-4 top-4 z-10 flex w-64 flex-col gap-2">
        <div className={cn(CANVAS_FLOATING_CLASS, 'flex items-center gap-1 p-1')}>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleBack}
          >
            <ArrowLeft />
            返回
          </Button>
          <span className="ml-auto pr-1 text-2xs tabular-nums text-muted-foreground">
            {data.nodes.length} 节点 · {data.edges.length} 边
          </span>
        </div>

        <GraphSearchBar onSearch={setSearchQuery} />
        {searchQuery.trim() && (
          <p className="pl-1 text-2xs text-muted-foreground">
            匹配 {matchCount} 个节点
          </p>
        )}
      </div>

      {/* 右上：视图工具条；详情面板打开时左移，避免被面板盖住 */}
      <div
        className={cn(
          CANVAS_FLOATING_CLASS,
          'absolute top-4 z-10 flex items-center gap-0.5 p-1 transition-[right] duration-300 ease-out-expo',
          selectedNodeId
            ? 'right-[calc(var(--spacing-property-panel)+1rem)]'
            : 'right-4',
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => zoomIn({ duration: 200 })}
          aria-label="放大"
        >
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => zoomOut({ duration: 200 })}
          aria-label="缩小"
        >
          <ZoomOut />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          aria-label="适应视图"
        >
          <Maximize2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          aria-label="刷新图谱"
        >
          <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* 左下：类别色图例 */}
      <div
        className={cn(
          CANVAS_FLOATING_CLASS,
          'absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2',
        )}
        data-testid="memory-graph-legend"
      >
        {LEGEND_ENTRIES.map((nodeType) => (
          <span
            key={nodeType}
            className="flex items-center gap-1.5 text-2xs text-muted-foreground"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: NODE_TYPE_COLORS[nodeType] }}
            />
            {NODE_TYPE_LABELS[nodeType]}
          </span>
        ))}
      </div>

      {/* 节点详情面板 */}
      <AnimatePresence>
        {selectedNodeId && (
          <NodeDetailPanel
            key={selectedNodeId}
            instanceId={instanceId}
            nodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
})
