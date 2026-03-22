import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { Loader2, AlertCircle, Network } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useMemoryGraph } from './api'
import { MemoryGraphNode } from './MemoryGraphNode'
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
} from './types'

const NODE_WIDTH = 220
const NODE_HEIGHT = 120

// ReactFlow v12 NodeTypes/EdgeTypes 泛型约束需要 any 桥接自定义节点类型
const nodeTypes: NodeTypes = {
  memoryGraphNode: MemoryGraphNode as NodeTypes[string],
}

const edgeTypes: EdgeTypes = {
  memoryGraphEdge: MemoryGraphEdge as EdgeTypes[string],
}

/** 截取内容摘要 */
function snippetize(content: string | null, maxLen = 50): string {
  if (!content) return ''
  const trimmed = content.trim()
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed
}

/** 使用 dagre 对记忆图进行层次布局 */
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
  const { data, isLoading, isError, error, refetch } =
    useMemoryGraph(instanceId)
  const { fitView } = useReactFlow()

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

  // -- 加载态 --
  if (isLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="memory-graph-loading"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // -- 错误态 --
  if (isError) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 text-destructive',
        )}
        data-testid="memory-graph-error"
      >
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error?.message ?? '加载记忆图失败'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              重试中...
            </>
          ) : (
            '重试加载'
          )}
        </Button>
      </div>
    )
  }

  // -- 空态 --
  if (!data || data.nodes.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
        data-testid="memory-graph-empty"
      >
        <Network className="h-8 w-8" />
        <p className="text-sm">暂无记忆节点</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full" data-testid="memory-graph-view">
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
        <Background />
      </ReactFlow>

      {/* 搜索栏 */}
      <div className="absolute left-4 top-4 z-10 w-64">
        <GraphSearchBar onSearch={setSearchQuery} />
        {searchQuery.trim() && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            匹配 {matchCount} 个节点
          </p>
        )}
      </div>

      {/* 节点详情面板 */}
      {selectedNodeId && (
        <NodeDetailPanel
          instanceId={instanceId}
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  )
})
