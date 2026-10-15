import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { RoutingDecisionsPanel } from './RoutingDecisionsPanel'
import type { RoutingDecision } from '../types'

const mocks = vi.hoisted(() => ({
  useDecisionRecords: vi.fn(),
  useProviderHealth: vi.fn(),
  useRoutingDecisions: vi.fn(),
}))

vi.mock('../api/routing-decision-queries', () => ({
  useRoutingDecisions: mocks.useRoutingDecisions,
}))

vi.mock('@/features/decision-record/api/decision-record-queries', () => ({
  useDecisionRecords: mocks.useDecisionRecords,
}))

vi.mock('@/features/smart-routing', () => ({
  useProviderHealth: mocks.useProviderHealth,
}))

function createDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    id: 'decision-1',
    executionStepId: 'step-1',
    conversationId: null,
    tenantId: 'tenant-1',
    routingNodeId: 'router-node-1',
    strategy: 'cost_optimized',
    routerType: 'llm-router',
    modelsEvaluated: [
      {
        modelId: 'model-a',
        modelName: 'GPT-4o mini',
        provider: 'openai',
        score: 0.91,
        reasoning: '成本最低',
      },
    ],
    selectedModelId: 'model-a',
    decisionReasoning: '在成本优先策略下选择了 GPT-4o mini',
    routingLatencyMs: 128,
    fallbackReason: null,
    fallbackSource: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    ...overrides,
  }
}

function listQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <ToastProvider>
      <RoutingDecisionsPanel />
    </ToastProvider>,
  )
}

describe('RoutingDecisionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useProviderHealth.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    })
    mocks.useRoutingDecisions.mockReturnValue(listQuery())
    mocks.useDecisionRecords.mockReturnValue({ data: undefined })
  })

  it('加载中只渲染骨架行，不渲染空态', () => {
    mocks.useRoutingDecisions.mockReturnValue(listQuery({ isLoading: true }))
    renderPanel()

    expect(screen.queryByTestId('routing-decisions-empty')).not.toBeInTheDocument()
    // 表头行 + DataTable 默认 5 行骨架
    expect(screen.getAllByRole('row')).toHaveLength(6)
  })

  it('查询失败时渲染错误卡片并弹出 toast', async () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({ isError: true, error: new Error('routing boom') }),
    )
    renderPanel()

    expect(screen.getByTestId('routing-decisions-error')).toHaveTextContent('routing boom')
    // 错误卡片 + toast 各出现一次标题
    await waitFor(() => {
      expect(screen.getAllByText('加载路由决策失败')).toHaveLength(2)
    })
  })

  it('无记录时渲染空态', () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      }),
    )
    renderPanel()

    expect(screen.getByTestId('routing-decisions-empty')).toBeInTheDocument()
  })

  it('渲染时间、策略、选中模型与延迟', () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [createDecision()],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      }),
    )
    renderPanel()

    expect(screen.getByText('成本优先')).toBeInTheDocument()
    expect(screen.getByText('llm-router')).toBeInTheDocument()
    expect(screen.getByText('GPT-4o mini')).toBeInTheDocument()
    expect(screen.getByText('128 毫秒')).toBeInTheDocument()
    expect(screen.getByText('router-node-1')).toBeInTheDocument()
  })

  it('确定性回退的决策显示回退徽标，非回退决策不显示', () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [
            createDecision({
              id: 'decision-fallback',
              fallbackReason: 'llm_timeout',
              fallbackSource: 'configured_model',
            }),
            createDecision({ id: 'decision-normal' }),
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        },
      }),
    )
    renderPanel()

    const badges = screen.getAllByTestId('routing-decision-fallback')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('回退：LLM 超时')
    expect(badges[0]).toHaveAttribute('title', '回退来源：已配置回退模型')
  })

  it('工作流步骤决策有 Jev 影子记录时显示影子选择，对话决策不查询影子', () => {
    mocks.useDecisionRecords.mockImplementation(({ subjectId }: { subjectId: string }) => ({
      data:
        subjectId === 'decision-step'
          ? {
              data: [
                {
                  id: 'record-shadow',
                  mode: 'shadow',
                  model: 'jev-1.13.0',
                  outcome: {
                    type: 'choice',
                    choice: 'model-a',
                    probabilities: { 'model-a': 0.7 },
                    confidence: 0.64,
                  },
                  error: null,
                },
                { id: 'record-primary', mode: 'primary', outcome: null, error: null },
              ],
            }
          : { data: [] },
    }))
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [
            createDecision({ id: 'decision-step' }),
            createDecision({
              id: 'decision-conversation',
              executionStepId: null,
              conversationId: 'conversation-1',
            }),
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        },
      }),
    )
    renderPanel()

    const badges = screen.getAllByTestId('jev-shadow-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('Jev 影子：GPT-4o mini conf=0.64')
    expect(mocks.useDecisionRecords).toHaveBeenCalledWith({
      subjectType: 'routing_decision',
      subjectId: 'decision-step',
    })
    expect(mocks.useDecisionRecords).not.toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'decision-conversation' }),
    )
  })

  it('selectedModelId 为 null 时展示未选中模型徽章', () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [createDecision({ selectedModelId: null })],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      }),
    )
    renderPanel()

    expect(screen.getByTestId('routing-decision-model-unselected')).toHaveTextContent(
      '未选中模型',
    )
  })

  it('选中模型不在候选列表里时退回短 id', () => {
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [
            createDecision({
              selectedModelId: '9f8b7c6d-1111-2222-3333-444455556666',
              modelsEvaluated: [],
            }),
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      }),
    )
    renderPanel()

    expect(screen.getByText('9f8b7c6d')).toBeInTheDocument()
    expect(
      screen.queryByTestId('routing-decision-model-unselected'),
    ).not.toBeInTheDocument()
  })

  it('翻页时按新页码重新查询', async () => {
    const user = userEvent.setup()
    mocks.useRoutingDecisions.mockReturnValue(
      listQuery({
        data: {
          data: [createDecision()],
          meta: { page: 1, pageSize: 20, total: 45, totalPages: 3 },
        },
      }),
    )
    renderPanel()

    await user.click(screen.getByRole('button', { name: '下一页' }))

    expect(mocks.useRoutingDecisions).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    })
  })
})
