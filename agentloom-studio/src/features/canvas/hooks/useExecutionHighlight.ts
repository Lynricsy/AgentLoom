import { useEffect, useRef } from 'react'
import { useExecutionStore } from '@/features/execution'
import type { NodeExecutionState } from '@/features/execution'

/**
 * 依赖高亮 CSS 类名。
 * 添加到作为 running 节点直接输入源的节点 shell 上。
 */
const DEP_NODE_CLASS = 'canvas-node-shell--dep-active'

/**
 * 依赖高亮 CSS 类名。
 * 添加到连接 running 节点与其直接输入源的 ReactFlow 边容器上。
 */
const DEP_EDGE_CLASS = 'dep-active'

export interface UseExecutionHighlightOptions {
  /** ReactFlow 容器的 ref */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** 画布 edges 列表，用于构建反向查找表 */
  edges: ReadonlyArray<{ id: string; source: string; target: string }>
}

/**
 * 从 edges 构建 target→(source nodeIds + edge ids) 的反向查找表。
 */
function buildReverseAdjacency(
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): Map<string, Array<{ sourceNodeId: string; edgeId: string }>> {
  const map = new Map<string, Array<{ sourceNodeId: string; edgeId: string }>>()
  for (const edge of edges) {
    let entry = map.get(edge.target)
    if (!entry) {
      entry = []
      map.set(edge.target, entry)
    }
    entry.push({ sourceNodeId: edge.source, edgeId: edge.id })
  }
  return map
}

/**
 * 根据执行节点状态集合计算需要高亮的依赖节点 ID 和边 ID。
 */
function computeHighlightSets(
  nodes: Record<string, NodeExecutionState>,
  reverseAdj: Map<string, Array<{ sourceNodeId: string; edgeId: string }>>,
): { depNodeIds: Set<string>; depEdgeIds: Set<string> } {
  const depNodeIds = new Set<string>()
  const depEdgeIds = new Set<string>()

  for (const node of Object.values(nodes)) {
    if (node.status !== 'running') {
      continue
    }

    const inputs = reverseAdj.get(node.nodeId)
    if (!inputs) {
      continue
    }

    for (const input of inputs) {
      depNodeIds.add(input.sourceNodeId)
      depEdgeIds.add(input.edgeId)
    }
  }

  return { depNodeIds, depEdgeIds }
}

/**
 * 在 DOM 上应用/移除依赖高亮 CSS 类。
 * 采用 diff 策略：只对变化的元素做 DOM 操作。
 */
function applyHighlight(
  container: HTMLElement,
  prevNodeIds: Set<string>,
  prevEdgeIds: Set<string>,
  nextNodeIds: Set<string>,
  nextEdgeIds: Set<string>,
): void {
  // 移除不再需要高亮的节点
  for (const nodeId of prevNodeIds) {
    if (!nextNodeIds.has(nodeId)) {
      const shell = container.querySelector<HTMLElement>(
        `[data-id="${CSS.escape(nodeId)}"] .canvas-node-shell`,
      )
      shell?.classList.remove(DEP_NODE_CLASS)
    }
  }

  // 添加新需要高亮的节点
  for (const nodeId of nextNodeIds) {
    if (!prevNodeIds.has(nodeId)) {
      const shell = container.querySelector<HTMLElement>(
        `[data-id="${CSS.escape(nodeId)}"] .canvas-node-shell`,
      )
      shell?.classList.add(DEP_NODE_CLASS)
    }
  }

  // 移除不再需要高亮的边
  for (const edgeId of prevEdgeIds) {
    if (!nextEdgeIds.has(edgeId)) {
      const edgeEl = container.querySelector<HTMLElement>(
        `.react-flow__edge[data-id="${CSS.escape(edgeId)}"]`,
      )
      edgeEl?.classList.remove(DEP_EDGE_CLASS)
    }
  }

  // 添加新需要高亮的边
  for (const edgeId of nextEdgeIds) {
    if (!prevEdgeIds.has(edgeId)) {
      const edgeEl = container.querySelector<HTMLElement>(
        `.react-flow__edge[data-id="${CSS.escape(edgeId)}"]`,
      )
      edgeEl?.classList.add(DEP_EDGE_CLASS)
    }
  }
}

/**
 * 执行态运行时依赖高亮 hook。
 *
 * 当节点进入 `running` 状态时，自动高亮其所有直接输入节点和对应连线。
 * 使用 CSS 类 DOM 操作方式，与 useConnectionPreview 模式一致。
 * 通过 Zustand subscribeWithSelector 订阅 executionStore.nodes 变化，
 * 仅在 running 节点集合实际变化时才做 DOM 操作。
 */
export function useExecutionHighlight({
  containerRef,
  edges,
}: UseExecutionHighlightOptions): void {
  const prevDepNodeIdsRef = useRef<Set<string>>(new Set())
  const prevDepEdgeIdsRef = useRef<Set<string>>(new Set())
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  useEffect(() => {
    const container = containerRef.current

    // 订阅 executionStore 的 nodes 字段变化
    const unsubscribe = useExecutionStore.subscribe(
      (state) => state.nodes,
      (nodes) => {
        if (!container) {
          return
        }

        const reverseAdj = buildReverseAdjacency(edgesRef.current)
        const { depNodeIds, depEdgeIds } = computeHighlightSets(nodes, reverseAdj)

        applyHighlight(
          container,
          prevDepNodeIdsRef.current,
          prevDepEdgeIdsRef.current,
          depNodeIds,
          depEdgeIds,
        )

        prevDepNodeIdsRef.current = depNodeIds
        prevDepEdgeIdsRef.current = depEdgeIds
      },
    )

    return () => {
      unsubscribe()

      // 卸载时清理所有残留高亮
      if (container) {
        container
          .querySelectorAll<HTMLElement>(`.${DEP_NODE_CLASS}`)
          .forEach((el) => el.classList.remove(DEP_NODE_CLASS))
        container
          .querySelectorAll<HTMLElement>(`.${DEP_EDGE_CLASS}`)
          .forEach((el) => el.classList.remove(DEP_EDGE_CLASS))
      }

      prevDepNodeIdsRef.current = new Set()
      prevDepEdgeIdsRef.current = new Set()
    }
  }, [containerRef])
}
