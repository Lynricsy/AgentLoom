import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalDetail } from '../api/optimizationProposalApi'
import { OptimizationProposalsBoard } from '../components/OptimizationProposalsBoard'
import { makeProposal } from './fixtures'

const mocks = vi.hoisted(() => ({
  useProposalList: vi.fn(),
}))

vi.mock('../api/optimizationProposalQueries', () => ({
  useProposalList: mocks.useProposalList,
  useAnalyzeWorkflow: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('../components/ProposalDetailSheet', () => ({
  ProposalDetailSheet: ({ proposalId }: { proposalId: string | null }) =>
    proposalId ? <div data-testid="mock-detail-sheet">{proposalId}</div> : null,
}))

vi.mock('@/features/workflow', () => ({
  useWorkflowList: () => ({ data: { data: [] }, isLoading: false }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

function listResult(data: ProposalDetail[]) {
  return {
    data: {
      data,
      meta: { total: data.length, page: 1, limit: 20, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
    error: null,
  }
}

describe('OptimizationProposalsBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列出提案的类型、取值变化、状态与结论', () => {
    mocks.useProposalList.mockReturnValue(
      listResult([
        makeProposal({ id: 'p-1', status: 'evaluated', verdict: 'improved' }),
        makeProposal({
          id: 'p-2',
          proposalType: 'routing_fallback_model',
          configPath: 'strategyConfig.fallbackModelId',
          currentValue: null,
          proposedValue: 'model-b',
          evidence: { ...makeProposal().evidence, modelName: 'GPT 小模型' },
          status: 'proposed',
        }),
      ]),
    )
    render(<OptimizationProposalsBoard />)

    const board = screen.getByTestId('optimization-proposals-board')
    expect(within(board).getByTestId('proposal-row-p-1')).toHaveTextContent('登录修复')
    expect(board).toHaveTextContent('消息数上限')
    expect(board).toHaveTextContent('1→2')
    expect(board).toHaveTextContent('已评测')
    expect(board).toHaveTextContent('优于基线')
    expect(board).toHaveTextContent('路由回退模型')
    expect(board).toHaveTextContent('未配置→GPT 小模型')
    expect(board).toHaveTextContent('待评测')
  })

  it('状态筛选重置到第一页并传给查询', async () => {
    const user = userEvent.setup()
    mocks.useProposalList.mockReturnValue(listResult([]))
    render(<OptimizationProposalsBoard />)

    await user.click(screen.getByTestId('proposal-filter-published'))

    expect(mocks.useProposalList).toHaveBeenLastCalledWith({
      status: 'published',
      page: 1,
      limit: 20,
    })
    expect(screen.getByTestId('optimization-proposals-empty')).toHaveTextContent('暂无优化提案')
  })

  it('点击详情打开提案抽屉', async () => {
    const user = userEvent.setup()
    mocks.useProposalList.mockReturnValue(listResult([makeProposal({ id: 'p-9' })]))
    render(<OptimizationProposalsBoard />)

    await user.click(screen.getByTestId('proposal-open-p-9'))

    expect(screen.getByTestId('mock-detail-sheet')).toHaveTextContent('p-9')
  })
})
