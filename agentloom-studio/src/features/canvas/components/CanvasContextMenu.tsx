import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PackagePlus, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { CANVAS_FLOATING_CLASS } from './canvasChrome'
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
      className={cn(CANVAS_FLOATING_CLASS, 'z-40 min-w-48 overflow-hidden p-1')}
      style={{
        position: 'fixed',
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        role="menuitem"
        data-testid="canvas-context-menu-delete"
        className="w-full justify-start rounded-sm px-2.5 font-normal hover:bg-error/10 hover:text-error focus-visible:bg-error/10 focus-visible:text-error"
        onClick={handleDelete}
        disabled={!canDelete}
      >
        <Trash2 aria-hidden />
        <span>删除</span>
      </Button>

      {selectedNodeCount >= 2 ? (
        <Button
          variant="ghost"
          size="sm"
          role="menuitem"
          data-testid="canvas-context-menu-encapsulate"
          className="w-full justify-start rounded-sm px-2.5 font-normal"
          onClick={handleEncapsulate}
        >
          <PackagePlus aria-hidden />
          <span>封装为可复用块</span>
        </Button>
      ) : null}
    </div>,
    document.body,
  )
}
