import { useCallback, useState } from 'react'
import type { CanvasContextMenuState, CanvasNode } from '../types'

export interface UseCanvasContextMenuOptions {
  isEditingDisabled: boolean
  selectedNodeIds: ReadonlySet<string>
  selectNode: (nodeId: string) => void
}

export interface UseCanvasContextMenuResult {
  contextMenuState: CanvasContextMenuState | null
  closeContextMenu: () => void
  onNodeContextMenu: (event: React.MouseEvent, node: CanvasNode) => void
  onPaneContextMenu: (
    event: MouseEvent | React.MouseEvent<Element, MouseEvent>,
  ) => void
}

/** 画布右键菜单位置与开合状态；只读态一律关闭菜单 */
export function useCanvasContextMenu({
  isEditingDisabled,
  selectedNodeIds,
  selectNode,
}: UseCanvasContextMenuOptions): UseCanvasContextMenuResult {
  const [contextMenuState, setContextMenuState] =
    useState<CanvasContextMenuState | null>(null)

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null)
  }, [])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CanvasNode) => {
      event.preventDefault()

      if (isEditingDisabled) {
        closeContextMenu()
        return
      }

      if (!selectedNodeIds.has(node.id)) {
        selectNode(node.id)
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      })
    },
    [closeContextMenu, isEditingDisabled, selectNode, selectedNodeIds],
  )

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      event.preventDefault()

      if (isEditingDisabled) {
        closeContextMenu()
        return
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
      })
    },
    [closeContextMenu, isEditingDisabled],
  )

  return {
    contextMenuState,
    closeContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
  }
}
