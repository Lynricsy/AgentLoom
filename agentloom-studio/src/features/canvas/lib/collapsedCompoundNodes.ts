import type { CanvasNode } from '../types'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'

function isCollapsedCompoundNode(node: CanvasNode): boolean {
  return (
    isCompoundContainerNodeType(node.data.nodeType) &&
    node.data.config?.isCollapsed === true
  )
}

/** 收起的 compound 容器内的全部后代 id（含嵌套），用于隐藏节点与相连边 */
export function collectCollapsedCompoundDescendantIds(
  nodes: readonly CanvasNode[],
): Set<string> {
  const collapsedContainerIds = new Set(
    nodes.filter(isCollapsedCompoundNode).map((node) => node.id),
  )

  if (collapsedContainerIds.size === 0) {
    return new Set()
  }

  const hiddenIds = new Set<string>()
  let changed = true

  while (changed) {
    changed = false
    for (const node of nodes) {
      const parentId = node.parentId
      if (!parentId) {
        continue
      }

      if (
        (collapsedContainerIds.has(parentId) || hiddenIds.has(parentId)) &&
        !hiddenIds.has(node.id)
      ) {
        hiddenIds.add(node.id)
        changed = true
      }
    }
  }

  return hiddenIds
}
