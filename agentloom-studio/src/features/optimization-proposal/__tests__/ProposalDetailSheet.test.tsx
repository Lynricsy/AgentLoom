import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProposalDetailSheet } from '../components/ProposalDetailSheet'
import type { ProposalDetail } from '../api/optimizationProposalApi'
import { makeProposal } from './fixtures'

const mocks = vi.hoisted(() => ({
  detail: null as ProposalDetail | null,
  publish: vi.fn(),
  rollback: vi.fn(),
  evaluate: vi.fn(),
  dismiss: vi.fn(),
}))

const mutation = (mutate: Mock) => ({ mutate, isPending: false })

vi.mock('../api/optimizationProposalQueries', () => ({
  useProposalDetail: () => ({ data: mocks.detail, isLoading: false, isError: false, error: null }),
  usePublishProposal: () => mutation(mocks.publish),
  useRollbackProposal: () => mutation(mocks.rollback),
  useStartEvaluation: () => mutation(mocks.evaluate),
  useDismissProposal: () => mutation(mocks.dismiss),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}))

const evaluatedSummary = (verdict: 'improved' | 'neutral') => ({
  id: 'eval-1',
  proposalId: 'proposal-1',
  status: 'completed' as const,
  baseVersionId: 'v-a',
  candidateVersionId: 'v-c',
  caseCount: 3,
  cases: [],
  summary: {
    baseline: { cases: 3, passed: 0, passRate: 0, meanCostUsd: 0.01, meanDurationMs: 2000, teamFailureReasons: { budget_exhausted: 3 } },
    candidate: { cases: 3, passed: verdict === 'improved' ? 3 : 0, passRate: verdict === 'improved' ? 1 : 0, meanCostUsd: 0.01, meanDurationMs: 2500, teamFailureReasons: {} },
    passRateDelta: verdict === 'improved' ? 1 : 0,
    costDeltaRatio: 0,
    verdict,
  },
  failureReason: null,
  deadlineAt: '2026-01-29T01:00:00.000Z',
  startedAt: '2026-01-29T00:00:00.000Z',
  completedAt: '2026-01-29T00:05:00.000Z',
  runs: [],
})

function renderSheet() {
  return render(<ProposalDetailSheet proposalId="proposal-1" onOpenChange={vi.fn()} />)
}

describe('ProposalDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('评测结论优于基线时显示发布按钮与评测对比', () => {
    mocks.detail = makeProposal({
      status: 'evaluated',
      verdict: 'improved',
      candidateVersionId: 'v-c',
      latestEvaluation: evaluatedSummary('improved'),
    })
    renderSheet()

    expect(screen.getByTestId('proposal-publish-button')).toBeInTheDocument()
    expect(screen.getByTestId('proposal-evaluate-button')).toHaveTextContent('重新评测')
    expect(screen.getByTestId('proposal-evaluation-summary')).toHaveTextContent('0%（0/3）')
    expect(screen.getByTestId('proposal-evaluation-summary')).toHaveTextContent('100%（3/3）')
    expect(screen.getByTestId('proposal-patch')).toHaveTextContent('1→2')
  })

  it('评测结论无差异时不提供发布，只能重新评测或忽略', () => {
    mocks.detail = makeProposal({
      status: 'evaluated',
      verdict: 'neutral',
      latestEvaluation: evaluatedSummary('neutral'),
    })
    renderSheet()

    expect(screen.queryByTestId('proposal-publish-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('proposal-evaluate-button')).toBeInTheDocument()
    expect(screen.getByTestId('proposal-dismiss-button')).toBeInTheDocument()
  })

  it('已发布的提案只提供回滚', () => {
    mocks.detail = makeProposal({ status: 'published', verdict: 'improved' })
    renderSheet()

    expect(screen.getByTestId('proposal-rollback-button')).toBeInTheDocument()
    expect(screen.queryByTestId('proposal-publish-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('proposal-evaluate-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('proposal-dismiss-button')).not.toBeInTheDocument()
  })

  it('发布对话框提交标签与说明', async () => {
    const user = userEvent.setup()
    mocks.detail = makeProposal({
      status: 'evaluated',
      verdict: 'improved',
      latestEvaluation: evaluatedSummary('improved'),
    })
    renderSheet()

    await user.click(screen.getByTestId('proposal-publish-button'))
    await user.type(screen.getByTestId('proposal-publish-label'), 'v2 via proposal')
    await user.type(screen.getByTestId('proposal-publish-notes'), '放宽消息预算')
    await user.click(screen.getByTestId('proposal-publish-confirm'))

    expect(mocks.publish).toHaveBeenCalledWith(
      { id: 'proposal-1', label: 'v2 via proposal', releaseNotes: '放宽消息预算' },
      expect.any(Object),
    )
  })

  it('评测对话框按输入的用例数启动评测', async () => {
    const user = userEvent.setup()
    mocks.detail = makeProposal()
    renderSheet()

    await user.click(screen.getByTestId('proposal-evaluate-button'))
    const input = screen.getByTestId('proposal-case-count-input')
    await user.clear(input)
    await user.type(input, '5')
    await user.click(screen.getByTestId('proposal-evaluate-confirm'))

    expect(mocks.evaluate).toHaveBeenCalledWith(
      { id: 'proposal-1', caseCount: 5 },
      expect.any(Object),
    )
  })
})
