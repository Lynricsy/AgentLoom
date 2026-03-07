import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { useCanvasStore } from '../stores/canvasStore'
import type { CanvasNode } from '../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { useAutoSave } from './useAutoSave'

const llmAgentConfig = getNodeTypeConfig('llm-agent')

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
    nodeType: 'llm-agent',
    category: 'agent',
    description: llmAgentConfig.description,
    config: {},
    inputPorts: clonePortDefinitions(llmAgentConfig.inputPorts),
    outputPorts: clonePortDefinitions(llmAgentConfig.outputPorts),
  },
}

function AutoSaveHarness({ workflowId }: { workflowId: string }) {
  useAutoSave(workflowId)
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
      vi.advanceTimersByTime(500)
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
      vi.advanceTimersByTime(500)
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
      vi.advanceTimersByTime(500)
    })

    const secondRequest = mutateMock.mock.calls[1]?.[1] as {
      onSuccess?: (data: { version: number }) => void
    }

    act(() => {
      firstRequest.onSuccess?.({ version: 2 })
    })

    expect(useCanvasStore.getState().isDirty).toBe(true)
    expect(useCanvasStore.getState().version).toBe(1)

    act(() => {
      secondRequest.onSuccess?.({ version: 3 })
    })

    expect(useCanvasStore.getState().isDirty).toBe(false)
    expect(useCanvasStore.getState().version).toBe(3)
  })
})
