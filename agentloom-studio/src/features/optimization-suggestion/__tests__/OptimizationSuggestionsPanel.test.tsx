import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HTTPError, type NormalizedOptions } from 'ky'
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
import type {
  OptimizationSuggestion,
  SuggestionType,
} from '../types/optimization-suggestion.types'

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

// 四类建议在当前 Agent Definition 架构下都没有执行落点，采纳一律禁用
const ALL_SUGGESTION_TYPES: readonly SuggestionType[] = [
  'model_downgrade',
  'timeout_adjustment',
  'tool_pruning',
  'autonomy_upgrade',
]

function createHttpError(payload: Record<string, unknown>, status = 422) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
  const request = new Request(
    'http://localhost/api/v1/optimization-suggestions/sug-1/apply',
    { method: 'POST' },
  )
  const options: NormalizedOptions = {
    method: 'POST',
    retry: { limit: 0 },
    prefixUrl: '',
    onDownloadProgress: undefined,
    onUploadProgress: undefined,
    context: {},
  }

  return new HTTPError(response, request, options)
}

describe('OptimizationSuggestionsPanel', () => {
  const applyMutateFn = vi.fn()
  const dismissMutateFn = vi.fn()

  beforeEach(() => {
    canvasState.workflowId = 'wf-1'
    canvasState.isDirty = false
    mockNotify.mockReset()
    mockUseNodeSuggestions.mockReset()
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

  it('renders blocked suggestions with explicit policy-block details', () => {
    mockUseNodeSuggestions.mockReturnValue({
      data: [
        makeSuggestion({
          suggestionType: 'autonomy_upgrade',
          status: 'blocked',
          currentValue: { autonomyMode: 'RULE_BASED' },
          suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
          analysisMetadata: {
            policyBlock: {
              autonomyCap: 'RULE_BASED',
              rawMode: 'LLM_SUGGEST',
              canonicalMode: 'LLM_SUGGEST',
              replacementMode: 'RULE_BASED',
              source: 'organization_policy',
              reasonCode: 'AUTONOMY_CAP_EXCEEDED',
              message: '组织自治上限禁止升级到 LLM 建议。',
              blockedAt: '2026-03-16T10:00:00Z',
            },
          },
        }),
      ],
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

    expect(screen.getByText('已阻断')).toBeInTheDocument()
    expect(screen.getByText(/组织自治上限禁止升级到 LLM 建议/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '采纳' })).not.toBeInTheDocument()
  })

  it('没有任何可采纳建议时，即便画布有未保存修改也不展示「先保存再采纳」提示', () => {
    canvasState.isDirty = true
    mockUseNodeSuggestions.mockReturnValue({
      data: ALL_SUGGESTION_TYPES.map((suggestionType, index) =>
        makeSuggestion({ id: `sug-${index}`, suggestionType }),
      ),
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

    expect(screen.queryByText(/画布存在未保存修改/)).not.toBeInTheDocument()
  })

  it.each(ALL_SUGGESTION_TYPES)(
    '%s 建议禁用采纳并说明采纳后不会生效',
    (suggestionType) => {
      mockUseNodeSuggestions.mockReturnValue({
        data: [makeSuggestion({ suggestionType })],
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

      expect(screen.getByTestId('optimization-suggestion-apply-disabled')).toBeDisabled()
      expect(screen.getByRole('button', { name: '采纳' })).toBeDisabled()
      expect(screen.getByTestId('optimization-suggestion-no-effect-note')).toHaveTextContent(
        'Agent Definition',
      )
    },
  )

  it.each(ALL_SUGGESTION_TYPES)('%s 建议的忽略按钮保持可用', async (suggestionType) => {
    const user = userEvent.setup()
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion({ suggestionType })],
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

    const dismissButton = screen.getByRole('button', { name: '忽略' })
    expect(dismissButton).toBeEnabled()

    await user.click(dismissButton)

    expect(dismissMutateFn).toHaveBeenCalledWith('sug-1', expect.anything())
  })

  it('点击被禁用的采纳按钮不会发出采纳请求', async () => {
    const user = userEvent.setup()
    mockUseNodeSuggestions.mockReturnValue({
      data: [makeSuggestion({ suggestionType: 'autonomy_upgrade' })],
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

    await user.click(screen.getByRole('button', { name: '采纳' }))

    expect(applyMutateFn).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('忽略失败时把组织策略阻断详情格式化进错误提示', async () => {
    const user = userEvent.setup()
    mockUseNodeSuggestions.mockReturnValue({
      data: [
        makeSuggestion({
          suggestionType: 'autonomy_upgrade',
          currentValue: { autonomyMode: 'RULE_BASED' },
          suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    })
    dismissMutateFn.mockImplementation(
      (_id: string, options?: { onError?: (error: unknown) => void | Promise<void> }) => {
        void options?.onError?.(
          createHttpError({
            type: 'OPTIMIZATION_SUGGESTION_POLICY_BLOCKED',
            title: 'Suggestion Blocked By Organization Policy',
            status: 422,
            detail: '组织自治上限禁止处理该建议。',
            errors: [
              {
                field: 'suggestedValue.autonomyMode',
                message: '组织自治上限禁止处理该建议。',
              },
            ],
            extensions: {
              autonomyCap: 'RULE_BASED',
              replacementMode: 'RULE_BASED',
              reasonCode: 'AUTONOMY_CAP_EXCEEDED',
            },
          }),
        )
      },
    )

    render(
      <OptimizationSuggestionsPanel
        workflowDefinitionId="wf-1"
        nodeId="node-1"
      />,
    )

    await user.click(screen.getByRole('button', { name: '忽略' }))

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '忽略优化建议失败',
          description: expect.stringContaining('组织上限：规则补全'),
          variant: 'error',
        }),
      )
    })

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('建议改为：规则补全'),
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
