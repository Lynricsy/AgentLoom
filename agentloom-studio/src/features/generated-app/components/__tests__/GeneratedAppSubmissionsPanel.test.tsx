import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedAppSubmission } from '../../types'

const {
  bulkDeleteMutation,
  deleteMutation,
  detailQuery,
  notifyMock,
  submissionsQuery,
  useGeneratedAppSubmissionMock,
  useGeneratedAppSubmissionsMock,
} = vi.hoisted(() => ({
  bulkDeleteMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  detailQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  notifyMock: vi.fn(),
  submissionsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  useGeneratedAppSubmissionMock: vi.fn(),
  useGeneratedAppSubmissionsMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useDeleteGeneratedAppSubmission: () => deleteMutation,
  useDeleteGeneratedAppSubmissions: () => bulkDeleteMutation,
  useGeneratedAppSubmission: (
    appId: string | undefined,
    submissionId: string | undefined,
  ) => {
    useGeneratedAppSubmissionMock(appId, submissionId)
    return detailQuery
  },
  useGeneratedAppSubmissions: (appId: string | undefined, params: unknown) => {
    useGeneratedAppSubmissionsMock(appId, params)
    return submissionsQuery
  },
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

function makeSubmission(
  overrides: Partial<GeneratedAppSubmission> = {},
): GeneratedAppSubmission {
  return {
    id: 'submission-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    appSpecVersion: 1,
    publicShareToken: 'token-snapshot',
    anonymousSessionId: 'anon-1',
    status: 'completed',
    input: { name: '张三', symptom: '头痛' },
    result: { pattern: '阴虚', score: 0.82 },
    report: { title: '问诊报告', suggestion: '建议休息并复查。' },
    errorMessage: null,
    createdAt: '2026-04-25T02:00:00.000Z',
    updatedAt: '2026-04-25T02:05:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeListData(submissions: GeneratedAppSubmission[] = []) {
  return {
    data: submissions,
    meta: {
      page: 1,
      pageSize: 10,
      total: submissions.length,
      totalPages: 1,
    },
  }
}

const { GeneratedAppSubmissionsPanel } = await import(
  '../GeneratedAppSubmissionsPanel'
)

describe('GeneratedAppSubmissionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submissionsQuery.data = makeListData([
      makeSubmission(),
      makeSubmission({
        id: 'submission-2',
        anonymousSessionId: 'anon-2',
        status: 'failed',
        input: { name: '李四', symptom: '咳嗽' },
        result: null,
        report: null,
        errorMessage: '模型运行超时',
      }),
    ])
    submissionsQuery.isError = false
    submissionsQuery.isFetching = false
    submissionsQuery.isLoading = false
    submissionsQuery.refetch = vi.fn()
    detailQuery.data = undefined
    detailQuery.isError = false
    detailQuery.isFetching = false
    detailQuery.isLoading = false
    detailQuery.refetch = vi.fn()
    deleteMutation.mutateAsync = vi.fn()
    deleteMutation.isPending = false
    bulkDeleteMutation.mutateAsync = vi.fn()
    bulkDeleteMutation.isPending = false
  })

  it('renders submission list rows with status, session, input, report, and error summaries', () => {
    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('共 2 条提交记录')).toBeInTheDocument()
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
    expect(screen.getAllByText('失败').length).toBeGreaterThan(0)
    expect(screen.getByText('anon-1')).toBeInTheDocument()
    expect(screen.getByText(/头痛/)).toBeInTheDocument()
    expect(screen.getByText(/阴虚/)).toBeInTheDocument()
    expect(screen.getByText(/问诊报告/)).toBeInTheDocument()
    expect(screen.getByText('模型运行超时')).toBeInTheDocument()
    expect(screen.queryByText('token-snapshot')).not.toBeInTheDocument()
  })

  it('loads selected submission detail and shows input, report, and error panels', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      id: 'submission-2',
      anonymousSessionId: 'anon-2',
      status: 'failed',
      input: { name: '李四', symptom: '咳嗽' },
      report: { title: '失败报告', reason: '运行中断' },
      errorMessage: '模型运行超时',
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-2 详情',
      }),
    )

    const detail = within(
      screen.getByTestId('generated-app-submission-detail'),
    )
    expect(detail.getByText('anon-2')).toBeInTheDocument()
    expect(detail.getByText(/李四/)).toBeInTheDocument()
    expect(detail.getByText(/失败报告/)).toBeInTheDocument()
    expect(detail.getByText(/模型运行超时/)).toBeInTheDocument()
    expect(detail.queryByText('token-snapshot')).not.toBeInTheDocument()
  })

  it('updates status filter and pagination query params', async () => {
    const user = userEvent.setup()
    submissionsQuery.data = {
      data: [makeSubmission()],
      meta: { page: 1, pageSize: 10, total: 21, totalPages: 3 },
    }

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.selectOptions(screen.getByLabelText('状态筛选'), 'failed')

    await waitFor(() => {
      const lastCall =
        useGeneratedAppSubmissionsMock.mock.calls[
          useGeneratedAppSubmissionsMock.mock.calls.length - 1
        ]
      expect(lastCall).toEqual([
        'app-1',
        { page: 1, pageSize: 10, status: 'failed' },
      ])
    })

    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      const lastCall =
        useGeneratedAppSubmissionsMock.mock.calls[
          useGeneratedAppSubmissionsMock.mock.calls.length - 1
        ]
      expect(lastCall).toEqual([
        'app-1',
        { page: 2, pageSize: 10, status: 'failed' },
      ])
    })
  })

  it('confirms and deletes a single submission', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteMutation.mutateAsync.mockResolvedValue({ deletedCount: 1 })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '删除提交记录 submission-1' }),
    )

    expect(confirmSpy).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith('submission-1')
      expect(notifyMock).toHaveBeenCalledWith({
        title: '提交记录已删除',
        description: '已删除 1 条提交记录。',
        variant: 'success',
      })
    })
  })

  it('confirms and bulk deletes selected submissions', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    bulkDeleteMutation.mutateAsync.mockResolvedValue({ deletedCount: 2 })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('checkbox', { name: '选择提交记录 submission-1' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: '选择提交记录 submission-2' }),
    )
    await user.click(screen.getByRole('button', { name: '删除所选 (2)' }))

    expect(confirmSpy).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(bulkDeleteMutation.mutateAsync).toHaveBeenCalledWith([
        'submission-1',
        'submission-2',
      ])
      expect(notifyMock).toHaveBeenCalledWith({
        title: '提交记录已批量删除',
        description: '已删除 2 条提交记录。',
        variant: 'success',
      })
    })
  })

  it('renders empty and error states', () => {
    submissionsQuery.data = makeListData([])

    const { rerender } = render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('暂无提交记录')).toBeInTheDocument()

    submissionsQuery.isError = true
    rerender(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('提交记录加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})
