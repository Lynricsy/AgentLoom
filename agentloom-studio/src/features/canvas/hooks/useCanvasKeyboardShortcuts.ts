import { useCallback, useEffect } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"]') !==
        null)
  )
}

type HistoryShortcut = 'undo' | 'redo'

function readHistoryShortcut(event: KeyboardEvent): HistoryShortcut | null {
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    return event.shiftKey ? 'redo' : 'undo'
  }
  if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'y') {
    return 'redo'
  }
  return null
}

export interface UseCanvasKeyboardShortcutsOptions {
  isEditingDisabled: boolean
  toggleSearch: () => void
  deleteSelectedNode: () => void
  deleteSelectedNodes: () => void
  undo: () => void
  redo: () => void
}

/**
 * 画布级快捷键：Ctrl/Cmd+F 打开搜索；Backspace / Delete 删除选中节点；
 * Ctrl/Cmd+Z 撤销，Shift+Ctrl/Cmd+Z 与 Ctrl+Y 重做。
 * 搜索快捷键在只读态也可用；编辑类快捷键只在可编辑态生效，且输入类元素内不拦截。
 * 字段映射面板打开时 Ctrl/Cmd+Z 由 useFieldMappingInteractions 处理映射撤销。
 */
export function useCanvasKeyboardShortcuts({
  isEditingDisabled,
  toggleSearch,
  deleteSelectedNode,
  deleteSelectedNodes,
  undo,
  redo,
}: UseCanvasKeyboardShortcutsOptions) {
  const handleDeleteSelection = useCallback(() => {
    const { selectedNodeIds: currentSelectedNodeIds } =
      useCanvasStore.getState()
    if (currentSelectedNodeIds.size > 1) {
      deleteSelectedNodes()
      return
    }

    deleteSelectedNode()
  }, [deleteSelectedNode, deleteSelectedNodes])

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleSearch()
        return
      }

      if (isEditingDisabled || isEditableTarget(event.target)) {
        return
      }

      const historyShortcut = readHistoryShortcut(event)
      if (historyShortcut) {
        if (useCanvasStore.getState().mappingPanelEdgeId !== null) {
          return
        }
        event.preventDefault()
        if (historyShortcut === 'undo') {
          undo()
        } else {
          redo()
        }
        return
      }

      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      event.preventDefault()
      handleDeleteSelection()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [handleDeleteSelection, isEditingDisabled, redo, toggleSearch, undo])
}
