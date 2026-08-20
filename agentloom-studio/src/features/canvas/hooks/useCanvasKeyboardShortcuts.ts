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

export interface UseCanvasKeyboardShortcutsOptions {
  isEditingDisabled: boolean
  toggleSearch: () => void
  deleteSelectedNode: () => void
  deleteSelectedNodes: () => void
}

/**
 * 画布级快捷键：Ctrl/Cmd+F 打开搜索、Backspace / Delete 删除选中节点。
 * 搜索快捷键在只读态也可用；删除只在可编辑态生效，且输入类元素内不拦截。
 */
export function useCanvasKeyboardShortcuts({
  isEditingDisabled,
  toggleSearch,
  deleteSelectedNode,
  deleteSelectedNodes,
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

      if (isEditingDisabled) {
        return
      }

      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      handleDeleteSelection()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [handleDeleteSelection, isEditingDisabled, toggleSearch])
}
