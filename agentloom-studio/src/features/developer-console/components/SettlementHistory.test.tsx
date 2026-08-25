import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettlementHistory } from './SettlementHistory'
import type { PayoutStatus, SettlementRecord } from '../api/developer-earnings.api'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  notify: vi.fn(),
  resolveError: vi.fn(),
}))

vi.mock('../api/developer-earnings.queries', () => ({
  useUpdatePayoutStatus: () => ({ mutateAsync: mocks.mutateAsync }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('../lib/developerKey', () => ({
  resolveDeveloperConsoleErrorMessage: (error: unknown, fallback: string) =>
    mocks.resolveError(error, fallback),
}))

function makeRecord(payoutStatus: PayoutStatus): SettlementRecord {
  return {
    id: `earning-${payoutStatus}`,
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-07-31T23:59:59.999Z',
    pluginId: 'com.example.translate',
    pluginName: '翻译插件',
    totalExecutions: 120,
    totalRevenue: '100.00000000',
    developerShare: '70.00000000',
    platformShare: '30.00000000',
    listingCommission: '10.00000000',
    payoutStatus,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function renderHistory(
  records: SettlementRecord[],
  options: { canManagePayouts?: boolean; isLoading?: boolean } = {},
) {
  const { canManagePayouts = true, isLoading = false } = options

  return render(
    <SettlementHistory
      settlements={{
        data: records,
        meta: { page: 1, pageSize: 10, total: records.length, totalPages: 1 },
      }}
      isLoading={isLoading}
      page={1}
      onPageChange={vi.fn()}
      canManagePayouts={canManagePayouts}
    />,
  )
}

describe('SettlementHistory payout actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutateAsync.mockResolvedValue(makeRecord('processing'))
    mocks.resolveError.mockResolvedValue('该状态迁移不被允许，请刷新后重试。')
  })

  it('pending 只暴露「标记处理中」', () => {
    renderHistory([makeRecord('pending')])

    const row = screen.getByText('翻译插件').closest('tr') as HTMLElement
    expect(
      within(row).getByRole('button', { name: '标记处理中' }),
    ).toBeInTheDocument()
    expect(
      within(row).queryByRole('button', { name: '标记完成' }),
    ).not.toBeInTheDocument()
    expect(
      within(row).queryByRole('button', { name: '标记失败' }),
    ).not.toBeInTheDocument()
  })

  it('processing 暴露「标记完成」与「标记失败」', () => {
    renderHistory([makeRecord('processing')])

    const row = screen.getByText('翻译插件').closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: '标记完成' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '标记失败' })).toBeInTheDocument()
    expect(
      within(row).queryByRole('button', { name: '标记处理中' }),
    ).not.toBeInTheDocument()
  })

  it('failed 只暴露「重试处理」', () => {
    renderHistory([makeRecord('failed')])

    const row = screen.getByText('翻译插件').closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: '重试处理' })).toBeInTheDocument()
  })

  it('completed 是终态，没有任何操作', () => {
    renderHistory([makeRecord('completed')])

    const row = screen.getByText('翻译插件').closest('tr') as HTMLElement
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    expect(within(row).getByText('终态')).toBeInTheDocument()
  })

  it('非 owner/admin 完全看不到打款操作列', () => {
    renderHistory([makeRecord('pending')], { canManagePayouts: false })

    expect(screen.queryByText('打款操作')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '标记处理中' }),
    ).not.toBeInTheDocument()
  })

  it('pending → processing 不带 payoutReference', async () => {
    const user = userEvent.setup()
    renderHistory([makeRecord('pending')])

    await user.click(screen.getByRole('button', { name: '标记处理中' }))

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        earningId: 'earning-pending',
        body: { payoutStatus: 'processing' },
      })
    })
  })

  it('标记完成时收集打款凭证并随请求提交', async () => {
    const user = userEvent.setup()
    renderHistory([makeRecord('processing')])

    await user.click(screen.getByRole('button', { name: '标记完成' }))

    const dialog = await screen.findByTestId('payout-complete-dialog')
    await user.type(
      within(dialog).getByTestId('payout-reference-input'),
      'TRX-20260801',
    )
    await user.click(within(dialog).getByRole('button', { name: '确认完成' }))

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        earningId: 'earning-processing',
        body: { payoutStatus: 'completed', payoutReference: 'TRX-20260801' },
      })
    })
  })

  it('409 时把服务端 detail 展示给用户', async () => {
    const user = userEvent.setup()
    mocks.mutateAsync.mockRejectedValue(new Error('conflict'))
    mocks.resolveError.mockResolvedValue('completed 是终态，不能再次迁移')

    renderHistory([makeRecord('pending')])

    await user.click(screen.getByRole('button', { name: '标记处理中' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '打款状态更新失败',
          description: 'completed 是终态，不能再次迁移',
          variant: 'error',
        }),
      )
    })
  })
})
