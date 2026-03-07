import type { CanvasEdge, CanvasNode } from '../types'

export interface DagValidationError {
  type: 'cycle' | 'no-start-node' | 'multiple-input-edges'
  message: string
  nodeIds?: string[]
  edgeIds?: string[]
}

export interface DagValidationWarning {
  type: 'parallel-limit-exceeded'
  message: string
  nodeId: string
  currentCount: number
  limit: number
}

export interface DagValidationResult {
  isValid: boolean
  errors: DagValidationError[]
  warnings: DagValidationWarning[]
}

const DEFAULT_PARALLEL_LIMIT = 10

function formatPortKey(targetHandle: string | undefined, nodeLabel: string): string {
  return targetHandle ? `"${targetHandle}"` : `"${nodeLabel}"`
}

export function validateDag(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  parallelLimit: number = DEFAULT_PARALLEL_LIMIT,
): DagValidationResult {
  const errors: DagValidationError[] = []
  const warnings: DagValidationWarning[] = []

  if (nodes.length === 0) {
    return { isValid: true, errors, warnings }
  }

  // Kahn's Algorithm — 环检测
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    const current = inDegree.get(edge.target) ?? 0
    inDegree.set(edge.target, current + 1)
    adjacency.get(edge.source)?.push(edge.target)
  }

  const incomingHandleGroups = new Map<string, CanvasEdge[]>()
  for (const edge of edges) {
    if (!edge.targetHandle) {
      continue
    }

    const groupKey = `${edge.target}:${edge.targetHandle ?? '__default__'}`
    const group = incomingHandleGroups.get(groupKey) ?? []
    group.push(edge)
    incomingHandleGroups.set(groupKey, group)
  }

  for (const groupedEdges of incomingHandleGroups.values()) {
    if (groupedEdges.length <= 1) {
      continue
    }

    const targetNodeId = groupedEdges[0]?.target
    const targetHandle = groupedEdges[0]?.targetHandle
    if (!targetNodeId || !targetHandle) {
      continue
    }

    const targetNode = nodes.find((node) => node.id === targetNodeId)
    const portKey = formatPortKey(targetHandle, targetNode?.data.label ?? targetNodeId)

    errors.push({
      type: 'multiple-input-edges',
      message: `输入端口 ${portKey} 不能同时接收多条入边`,
      nodeIds: [targetNodeId],
      edgeIds: groupedEdges.map((edge) => edge.id),
    })
  }

  // 起始节点检查（入度为 0 的节点）
  const startNodes = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
  if (startNodes.length === 0) {
    errors.push({
      type: 'no-start-node',
      message: '工作流中没有起始节点（所有节点都有入边）',
    })
  }

  // Kahn's Algorithm 拓扑排序
  const queue = startNodes.map((n) => n.id)
  let processed = 0

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    processed++

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, deg)
      if (deg === 0) {
        queue.push(neighbor)
      }
    }
  }

  if (processed < nodes.length) {
    const cycleNodeIds = nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) > 0)
      .map((n) => n.id)
    errors.push({
      type: 'cycle',
      message: '工作流中存在循环依赖',
      nodeIds: cycleNodeIds,
    })
  }

  // 并行路径限制检查
  for (const node of nodes) {
    const outEdges = edges.filter((e) => e.source === node.id)
    if (outEdges.length > parallelLimit) {
      warnings.push({
        type: 'parallel-limit-exceeded',
        message: `并行路径数量（${outEdges.length}）超过建议上限（${parallelLimit}），可能影响执行性能`,
        nodeId: node.id,
        currentCount: outEdges.length,
        limit: parallelLimit,
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
