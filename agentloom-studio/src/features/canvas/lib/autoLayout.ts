import dagre from '@dagrejs/dagre'
import type { XYPosition } from '@xyflow/react'
import type { CanvasEdge, CanvasNode } from '../types'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'
import { collectCollapsedCompoundDescendantIds } from './collapsedCompoundNodes'
import {
  getCompoundFrameInsets,
  getCompoundInitialChildPosition,
  readCompoundNodeDimension,
  resolveCompoundContainerSize,
  type CompoundLayoutSize,
} from './compoundLayout'
import {
  syncCompoundParentLayout,
  writeCompoundNodeSize,
} from './canvasStoreHelpers'

/** 尚未被 React Flow 测量（如从未渲染过）的节点按完整卡片的典型尺寸估算 */
const NODE_FALLBACK_SIZE: CompoundLayoutSize = { width: 240, height: 120 }
/** 同一层内相邻节点的间距（LR 布局下为纵向） */
const LAYOUT_NODE_SEP = 48
/** 相邻两层之间的间距（LR 布局下为横向），留足边的弯折空间 */
const LAYOUT_RANK_SEP = 120
/** compound 内框到子节点的留白，与 buildCompoundChildExtent 的内边距一致 */
const COMPOUND_CONTENT_PADDING = 16

type NodeGroupKey = string | null

/**
 * 按连线方向（端口左入右出）对画布做分层自动布局，直接改写传入的节点（可为 immer draft）。
 *
 * - 同一父级下的兄弟节点为一组，用 dagre LR 分层；跨组的边提升到本组内的祖先节点参与排序。
 * - 展开的 compound 容器先布局其子节点（容器本地坐标），再按内容包围盒调整容器尺寸，
 *   最后容器作为一个整体参与外层布局；子节点 extent 随新尺寸重建。
 * - 收起的 compound 容器的后代保持原位（画布上不可见），容器按收起尺寸参与布局。
 * - 顶层布局保持原包围盒左上角不动，避免整理后画布内容跳到远处。
 */
export function layoutCanvasNodes(
  nodes: CanvasNode[],
  edges: readonly CanvasEdge[],
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const hiddenIds = collectCollapsedCompoundDescendantIds(nodes)
  /** 父节点不在画布内的子节点按顶层处理 */
  const groupKeyById = new Map<string, NodeGroupKey>(
    nodes.map((node) => [
      node.id,
      node.parentId && nodeById.has(node.parentId) ? node.parentId : null,
    ]),
  )

  const membersByGroup = new Map<NodeGroupKey, CanvasNode[]>()
  for (const node of nodes) {
    if (hiddenIds.has(node.id)) continue
    const key = groupKeyById.get(node.id) ?? null
    const members = membersByGroup.get(key)
    if (members) {
      members.push(node)
    } else {
      membersByGroup.set(key, [node])
    }
  }

  /**
   * 把边端点提升为 groupKey 组内的成员（自身或祖先）；不在该组子树内则返回 null。
   * 步数上限防御外部写入的 parentId 环。
   */
  const resolveGroupMember = (
    nodeId: string,
    groupKey: NodeGroupKey,
  ): string | null => {
    let currentId: string | null = nodeId
    for (let step = 0; currentId && step <= nodes.length; step += 1) {
      const parentKey: NodeGroupKey = groupKeyById.get(currentId) ?? null
      if (parentKey === groupKey) return currentId
      currentId = parentKey
    }
    return null
  }

  const sizeById = new Map<string, CompoundLayoutSize>()

  /** 布局一组兄弟节点，返回其内容包围盒尺寸 */
  const layoutGroup = (
    groupKey: NodeGroupKey,
    members: readonly CanvasNode[],
    origin: XYPosition,
  ): CompoundLayoutSize => {
    for (const member of members) {
      sizeById.set(member.id, layoutMemberSize(member))
    }

    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
    graph.setGraph({
      rankdir: 'LR',
      nodesep: LAYOUT_NODE_SEP,
      ranksep: LAYOUT_RANK_SEP,
    })
    for (const member of members) {
      graph.setNode(member.id, { ...sizeById.get(member.id) })
    }
    for (const edge of edges) {
      const source = resolveGroupMember(edge.source, groupKey)
      const target = resolveGroupMember(edge.target, groupKey)
      if (!source || !target || source === target) continue
      if (!graph.hasNode(source) || !graph.hasNode(target)) continue
      graph.setEdge(source, target)
    }
    dagre.layout(graph)

    const topLefts = members.map((member) => {
      const center = graph.node(member.id)
      const size = sizeById.get(member.id) ?? NODE_FALLBACK_SIZE
      return {
        member,
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
        size,
      }
    })
    const minX = Math.min(...topLefts.map((item) => item.x))
    const minY = Math.min(...topLefts.map((item) => item.y))
    let maxX = 0
    let maxY = 0
    for (const item of topLefts) {
      const x = Math.round(item.x - minX + origin.x)
      const y = Math.round(item.y - minY + origin.y)
      item.member.position = { x, y }
      maxX = Math.max(maxX, x - origin.x + item.size.width)
      maxY = Math.max(maxY, y - origin.y + item.size.height)
    }

    return { width: maxX, height: maxY }
  }

  /**
   * 节点参与外层布局的尺寸；展开且有可见子节点的 compound 先完成内部布局。
   * 收起容器的后代已被过滤，children 为空，按自身（收起）尺寸参与布局。
   */
  const layoutMemberSize = (node: CanvasNode): CompoundLayoutSize => {
    const children = membersByGroup.get(node.id)
    if (!isCompoundContainerNodeType(node.data.nodeType) || !children?.length) {
      return readLayoutSize(node)
    }

    const inputPortCount = node.data.inputPorts.length
    const outputPortCount = node.data.outputPorts.length
    const contentOrigin = getCompoundInitialChildPosition({
      inputPortCount,
      outputPortCount,
    })
    const content = layoutGroup(node.id, children, contentOrigin)
    const insets = getCompoundFrameInsets(inputPortCount, outputPortCount)
    const size = resolveCompoundContainerSize({
      inputPortCount,
      outputPortCount,
      width:
        contentOrigin.x + content.width + COMPOUND_CONTENT_PADDING + insets.right,
      height:
        contentOrigin.y +
        content.height +
        COMPOUND_CONTENT_PADDING +
        insets.bottom,
    })
    writeCompoundNodeSize(node, size)
    // 同步会按子节点包围盒兜底撑开容器，外层布局按最终尺寸留位
    syncCompoundParentLayout(nodes, node.id)
    return readLayoutSize(node)
  }

  const roots = membersByGroup.get(null)
  if (!roots?.length) return

  const origin = {
    x: Math.min(...roots.map((node) => node.position.x)),
    y: Math.min(...roots.map((node) => node.position.y)),
  }
  layoutGroup(null, roots, origin)
}

function readLayoutSize(node: CanvasNode): CompoundLayoutSize {
  return {
    width: readCompoundNodeDimension(node, 'width') ?? NODE_FALLBACK_SIZE.width,
    height: readCompoundNodeDimension(node, 'height') ?? NODE_FALLBACK_SIZE.height,
  }
}

/**
 * 同一父级下的可见节点是否有矩形相交（收起容器内的后代不可见，不参与判断）。
 * 只读预览据此决定是否需要自动布局，避免改动作者手排的布局。
 */
export function hasOverlappingSiblings(nodes: readonly CanvasNode[]): boolean {
  const hiddenIds = collectCollapsedCompoundDescendantIds(nodes)
  const siblingsByParent = new Map<string | null, CanvasNode[]>()
  for (const node of nodes) {
    if (hiddenIds.has(node.id) || node.hidden) continue
    const key = node.parentId ?? null
    const siblings = siblingsByParent.get(key)
    if (siblings) {
      siblings.push(node)
    } else {
      siblingsByParent.set(key, [node])
    }
  }

  for (const siblings of siblingsByParent.values()) {
    const rects = siblings.map((node) => ({
      ...node.position,
      ...readLayoutSize(node),
    }))
    for (let i = 0; i < rects.length; i += 1) {
      const a = rects[i]!
      for (let j = i + 1; j < rects.length; j += 1) {
        const b = rects[j]!
        if (
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height
        ) {
          return true
        }
      }
    }
  }
  return false
}
