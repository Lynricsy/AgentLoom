import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseNodeSuggestions = vi.fn()
const mockUseApplySuggestion = vi.fn()
const mockUseDismissSuggestion = vi.fn()
const mockNotify = vi.fn()
const canvasState = {
  workflowId: 'wf-1' as string | null,
  isDirty: false,
}

vi.mock('../api/optimization-suggestion-queries', () => ({
  useNodeSuggestions: (...args: unknown[]) => mockUseNodeSuggestions(...args),
  useApplySuggestion: () => mockUseApplySuggestion(),
  useDismissSuggestion: () => mockUseDismissSuggestion(),
}))

vi.mock('@/features/canvas/stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: typeof canvasState) => unknown) =>
    selector(canvasState),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}))

import { OptimizationSuggestionsPanel } from '../components/OptimizationSuggestionsPanel'
import type { OptimizationSuggestion } from '../types/optimization-suggestion.types'

function makeSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: 'sug-1',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-1',
    nodeId: 'node-1',
    suggestionType: 'model_downgrade',
    status: 'pending',
    confidence: 0.85,
    currentValue: { model: 'gpt-4' },
    suggestedValue: { model: 'gpt-3.5-turbo' },
    rationale: '可使用低成本模型',
    impactEstimate: null,
    analysisPeriodStart: '2026-03-01T00:00:00Z',
    analysisPeriodEnd: '2026-03-15T00:00:00Z',
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:00:00Z',
    ...overrides,
  }
}

describe('OptimizationSuggestionsPanel', () => {
  const applyMutateFn = vi.fn()
  const dismissMutateFn = vi.fn()

  beforeEach(() => {
    canvasState.workflowId = 'wf-1'
    canvasState.isDirty = false
    mockNotify.mockReset()
    applyMutateFn.mockReset()
    dismissMutateFn.mockReset()
    mockUseApplySuggestion.mockReturnValue({ mutate: applyMutateFn })
    mockUseDismissSuggestion.mockReturnValue({ mutate: dismissMutateFn })
  })

  it('shows loading skeleton', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    const panel = screen.getByTestId('optimization-suggestions-panel')
    expect(panel.querySelectorAll('.animate-pulse')).toHaveLength(2)
  })

  it('shows empty state when no suggestions', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText('暂无优化建议')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText(/加载优化建议失败/)).toBeInTheDocument()
    expect(screen.getByText(/Network error/)).toBeInTheDocument()
  })

  it('renders suggestion cards when data available', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion({ id: 'sug-1' }), makeSuggestion({ id: 'sug-2' })],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText('优化建议')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getAllByTestId('optimization-suggestion-card')).toHaveLength(2)
  })

  it('在画布有未保存修改时阻止采纳并提示用户先保存', async () => {
    const user = userEvent.setup()
    canvasState.isDirty = true
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion()],
      isLoading: false,
      isError: false,
      error: null,
    })

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    expect(screen.getByText(/画布存在未保存修改/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '采纳' }))

    expect(applyMutateFn).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '请先保存当前画布',
        variant: 'warning',
      }),
    )
  })

  it('采纳成功时显示成功提示', async () => {
    const user = userEvent.setup()
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion()],
      isLoading: false,
      isError: false,
      error: null,
    })
    applyMutateFn.mockImplementation(
      (_id: string, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      },
    )

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    await user.click(screen.getByRole('button', { name: '采纳' }))

    expect(applyMutateFn).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '优化建议已采纳',
        variant: 'success',
      }),
    )
  })

  it('忽略成功时显示成功提示', async () => {
    const user = userEvent.setup()
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion()],
      isLoading: false,
      isError: false,
      error: null,
    })
    dismissMutateFn.mockImplementation(
      (_id: string, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      },
    )

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    await user.click(screen.getByRole('button', { name: '忽略' }))

    expect(dismissMutateFn).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '优化建议已忽略',
        variant: 'success',
      }),
    )
  })
})
