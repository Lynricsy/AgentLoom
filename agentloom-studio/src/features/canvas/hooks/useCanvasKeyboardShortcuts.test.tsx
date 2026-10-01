import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts'

function press(
  target: EventTarget,
  init: KeyboardEventInit & { key: string },
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

describe('useCanvasKeyboardShortcuts 撤销/重做', () => {
  const undo = vi.fn()
  const redo = vi.fn()

  function renderShortcuts(isEditingDisabled = false) {
    return renderHook(() =>
      useCanvasKeyboardShortcuts({
        isEditingDisabled,
        toggleSearch: vi.fn(),
        deleteSelectedNode: vi.fn(),
        deleteSelectedNodes: vi.fn(),
        undo,
        redo,
      }),
    )
  }

  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    undo.mockReset()
    redo.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Ctrl/Cmd+Z 撤销，Shift+Ctrl/Cmd+Z 与 Ctrl+Y 重做', () => {
    renderShortcuts()

    expect(press(document.body, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(true)
    press(document.body, { key: 'z', metaKey: true })
    expect(undo).toHaveBeenCalledTimes(2)

    press(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })
    press(document.body, { key: 'z', metaKey: true, shiftKey: true })
    press(document.body, { key: 'y', ctrlKey: true })
    expect(redo).toHaveBeenCalledTimes(3)
    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('焦点在 input、textarea 或 contenteditable 内时不拦截', () => {
    renderShortcuts()
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const editableChild = document.createElement('span')
    editable.append(editableChild)
    document.body.append(input, textarea, editable)

    for (const target of [input, textarea, editableChild]) {
      const event = press(target, { key: 'z', ctrlKey: true })
      expect(event.defaultPrevented).toBe(false)
      press(target, { key: 'y', ctrlKey: true })
    }

    expect(undo).not.toHaveBeenCalled()
    expect(redo).not.toHaveBeenCalled()

    // 焦点离开输入元素后，同一快捷键恢复为画布撤销
    press(document.body, { key: 'z', ctrlKey: true })
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('只读画布与字段映射面板打开时不触发画布撤销', () => {
    const { unmount } = renderShortcuts(true)
    press(document.body, { key: 'z', ctrlKey: true })
    unmount()

    renderShortcuts()
    useCanvasStore.setState({ mappingPanelEdgeId: 'edge-1' })
    press(document.body, { key: 'z', ctrlKey: true })

    expect(undo).not.toHaveBeenCalled()

    useCanvasStore.setState({ mappingPanelEdgeId: null })
    press(document.body, { key: 'z', ctrlKey: true })
    expect(undo).toHaveBeenCalledTimes(1)
  })
})
