import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { useCanvasStore } from '../stores/canvasStore'
import { createDefaultEdgeData } from '../types'
import type { CanvasEdge, CanvasNode } from '../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { AUTOSAVE_DEBOUNCE_MS, useAutoSave } from './useAutoSave'

const llmAgentConfig = getNodeTypeConfig('agent')

const mutateMock = vi.fn()

vi.mock('@/features/workflow', () => ({
  useUpdateWorkflow: () => ({ mutate: mutateMock }),
}))

const mockNode: CanvasNode = {
  id: 'node-1',
  type: 'agent',
  position: { x: 120, y: 240 },
  data: {
    label: 'Agent',
    nodeType: 'agent',
    category: 'agent',
    description: llmAgentConfig.description,
    config: {},
    inputPorts: clonePortDefinitions(llmAgentConfig.inputPorts),
    outputPorts: clonePortDefinitions(llmAgentConfig.outputPorts),
  },
}

const mockEdge: CanvasEdge = {
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  sourceHandle: 'final-output',
  targetHandle: 'content',
  data: createDefaultEdgeData(),
}

function AutoSaveHarness({
  workflowId,
  workflowStatus,
}: {
  workflowId: string
  workflowStatus?: 'draft' | 'published' | 'archived'
}) {
  useAutoSave(workflowId, workflowStatus)
  return null
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mutateMock.mockReset()
    useCanvasStore.getState().actions.reset()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
  })

  it('自动保存失败时应保留脏状态并显示 Toast', () => {
    mutateMock.mockImplementation(
      (_payload, options: { onError?: () => void }) => options.onError?.()
    )

    render(
      <ToastProvider>
        <AutoSaveHarness workflowId="wf-001" />
      </ToastProvider>
    )

    act(() => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isDirty: true,
        version: 1,
      })
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(useCanvasStore.getState().isDirty).toBe(true)
    expect(useCanvasStore.getState().isSaving).toBe(false)
    expect(screen.getByText('自动保存失败，修改已保留在本地')).toBeInTheDocument()
  })

  it('旧请求成功时不应覆盖较新的本地修改', () => {
    render(
      <ToastProvider>
        <AutoSaveHarness workflowId="wf-001" />
      </ToastProvider>
    )

    act(() => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isDirty: true,
        version: 1,
      })
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    const firstRequest = mutateMock.mock.calls[0]?.[1] as {
      onSuccess?: (data: { version: number }) => void
    }

    act(() => {
      useCanvasStore.setState({
        nodes: [{ ...mockNode, position: { x: 300, y: 420 } }],
        isDirty: true,
      })
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    const secondRequest = mutateMock.mock.calls[1]?.[1] as {
      onSuccess?: (data: { version: number }) => void
    }

    act(() => {
      firstRequest.onSuccess?.({ version: 2 })
    })

    expect(useCanvasStore.getState().isDirty).toBe(true)
    expect(useCanvasStore.getState().version).toBe(2)

    act(() => {
      secondRequest.onSuccess?.({ version: 3 })
    })

    expect(useCanvasStore.getState().isDirty).toBe(false)
    expect(useCanvasStore.getState().version).toBe(3)
  })

  it('归档工作流不应触发自动保存', () => {
    render(
      <ToastProvider>
        <AutoSaveHarness workflowId="wf-001" workflowStatus="archived" />
      </ToastProvider>
    )

    act(() => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isDirty: true,
        version: 1,
      })
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    expect(mutateMock).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().isDirty).toBe(true)
  })

  it('达到 2 秒前不应触发自动保存', () => {
    render(
      <ToastProvider>
        <AutoSaveHarness workflowId="wf-001" />
      </ToastProvider>
    )

    act(() => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isDirty: true,
        version: 1,
      })
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1)
    })

    expect(mutateMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
  })

  it('边兼容性刷新后的 edge.data 会进入自动保存 payload', () => {
    render(
      <ToastProvider>
        <AutoSaveHarness workflowId="wf-001" />
      </ToastProvider>
    )

    act(() => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [mockEdge],
        viewport: { x: 0, y: 0, zoom: 1 },
        isDirty: false,
        version: 1,
      })
    })

    act(() => {
      useCanvasStore.getState().actions.refreshEdgeCompatibility([
        {
          edgeId: 'edge-1',
          edgeData: {
            ...createDefaultEdgeData(),
            rawCompatibilityLevel: 'INCOMPATIBLE',
            visualLevel: 'error',
            reasonKey: 'type_mismatch_no_transform',
          },
        },
      ])
    })

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateMock.mock.calls[0]?.[0]).toMatchObject({
      edges: [
        expect.objectContaining({
          id: 'edge-1',
          data: expect.objectContaining({
            rawCompatibilityLevel: 'INCOMPATIBLE',
            visualLevel: 'error',
            reasonKey: 'type_mismatch_no_transform',
          }),
        }),
      ],
    })
  })
})
