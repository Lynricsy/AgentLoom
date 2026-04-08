import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/utils'
import { useCanvasActions } from '../stores/canvasStore'
import type { CanvasContextMenuState } from '../types'

interface CanvasContextMenuProps {
  state: CanvasContextMenuState | null
  onClose: () => void
  onEncapsulate: () => void
  selectedNodeCount: number
}

export function CanvasContextMenu({
  state,
  onClose,
  onEncapsulate,
  selectedNodeCount,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { deleteSelectedNode, deleteSelectedNodes } = useCanvasActions()

  const handleDelete = useCallback(() => {
    if (selectedNodeCount > 1) {
      deleteSelectedNodes()
    } else {
      deleteSelectedNode()
    }

    onClose()
  }, [deleteSelectedNode, deleteSelectedNodes, onClose, selectedNodeCount])

  const handleEncapsulate = useCallback(() => {
    onEncapsulate()
    onClose()
  }, [onClose, onEncapsulate])

  useEffect(() => {
    if (!state) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (menuRef.current?.contains(target)) {
        return
      }

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose, state])

  if (!state || typeof document === 'undefined') {
    return null
  }

  const canDelete = selectedNodeCount > 0

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="画布上下文菜单"
      data-testid="canvas-context-menu"
      className="z-[1000] min-w-48 overflow-hidden rounded-xl border border-border bg-surface-elevated/95 p-1 shadow-2xl backdrop-blur"
      style={{
        position: 'fixed',
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
    >
      <button
        type="button"
        role="menuitem"
        data-testid="canvas-context-menu-delete"
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors',
          canDelete ? 'hover:bg-muted focus:bg-muted' : 'cursor-not-allowed opacity-50',
        )}
        onClick={handleDelete}
        disabled={!canDelete}
      >
        <span>删除</span>
      </button>

      {selectedNodeCount >= 2 ? (
        <button
          type="button"
          role="menuitem"
          data-testid="canvas-context-menu-encapsulate"
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted"
          onClick={handleEncapsulate}
        >
          <span>封装为可复用块</span>
        </button>
      ) : null}
    </div>,
    document.body,
  )
}
