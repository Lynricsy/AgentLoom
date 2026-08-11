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
    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute(
      'data-execution-status',
      'not-enabled',
    )
    expect(
      within(statusBlock).getByText('Workflow 执行未启用。'),
    ).toBeInTheDocument()
    expect(within(statusBlock).getByText('未启用')).toBeInTheDocument()
    expect(detail.queryByText('token-snapshot')).not.toBeInTheDocument()
  })

  it('uses report handoff before result handoff for terminal status', async () => {
    const user = userEvent.setup()
    const resultExecutionId = '11111111-1111-4111-8111-111111111111'
    const reportExecutionId = '22222222-2222-4222-8222-222222222222'
    detailQuery.data = makeSubmission({
      status: 'completed',
      result: {
        title: '旧的 result handoff',
        workflowExecution: true,
        executionId: resultExecutionId,
        executionStatus: 'running',
        workflowExecutionNotice: 'Result handoff 仍在运行。',
      },
      report: {
        title: '最终 report handoff',
        workflowExecution: true,
        executionId: reportExecutionId,
        executionStatus: 'completed',
        workflowExecutionNotice: 'Report handoff 已完成。',
        workflowExecutionSummary: {
          summary: 'Report 终态优先生效。',
          completedSteps: 2,
          totalSteps: 2,
        },
      },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-1 详情',
      }),
    )

    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute('data-execution-status', 'completed')
    expect(within(statusBlock).getByText('已完成')).toBeInTheDocument()
    expect(
      within(statusBlock).getByText('Report handoff 已完成。'),
    ).toBeInTheDocument()
    expect(
      within(statusBlock).getByText(/Report 终态优先生效。/),
    ).toBeInTheDocument()
    expect(statusBlock).not.toHaveTextContent('Result handoff 仍在运行。')
    expect(statusBlock).not.toHaveTextContent(resultExecutionId)
    expect(statusBlock).not.toHaveTextContent(reportExecutionId)
  })

  it('renders running workflow handoff status without internal ids or token values', async () => {
    const user = userEvent.setup()
    const executionId = '77777777-7777-4777-8777-777777777777'
    detailQuery.data = makeSubmission({
      status: 'running',
      result: {
        summary: '已接收提交。',
        workflowExecution: true,
        executionId: 'result-execution-id',
        executionStatus: 'pending',
        workflowDefinitionId: 'result-workflow-definition-id',
      },
      report: {
        title: '后台执行中',
        workflowExecution: true,
        executionId,
        executionStatus: 'running',
        workflowDefinitionId: '88888888-8888-4888-8888-888888888888',
        publicShareToken: 'token-snapshot',
        sourceArtifactUrl: 'https://internal.example/source.zip',
        testReportUrl: 'https://internal.example/test-report.json',
        gateResults: [{ id: 'gate-7', status: 'passed' }],
        workflowExecutionNotice: 'Workflow execution 仍在执行中。',
        workflowExecutionUpdatedAt: '2026-04-25T02:08:00.000Z',
        workflowExecutionSummary: {
          completedSteps: 1,
          failedSteps: 0,
          cancelledSteps: 0,
          totalSteps: 4,
          latestStepCompletedAt: '2026-04-25T02:07:00.000Z',
        },
      },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-1 详情',
      }),
    )

    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute('data-execution-status', 'running')
    expect(
      within(statusBlock).getByText('Workflow 执行状态'),
    ).toBeInTheDocument()
    expect(within(statusBlock).getByText('正在执行')).toBeInTheDocument()
    expect(
      within(statusBlock).getByText(
        'Workflow 正在执行，提交详情会自动刷新状态。',
      ),
    ).toBeInTheDocument()
    expect(
      within(statusBlock).getByText('Workflow execution 仍在执行中。'),
    ).toBeInTheDocument()
    expect(within(statusBlock).getByText('完成步骤')).toBeInTheDocument()
    expect(within(statusBlock).getByText('总步骤')).toBeInTheDocument()
    expect(statusBlock).not.toHaveTextContent(executionId)
    expect(statusBlock).not.toHaveTextContent('result-execution-id')
    expect(statusBlock).not.toHaveTextContent('88888888-8888')
    expect(statusBlock).not.toHaveTextContent('token-snapshot')
    expect(statusBlock).not.toHaveTextContent('sourceArtifactUrl')
    expect(statusBlock).not.toHaveTextContent('testReportUrl')
    expect(statusBlock).not.toHaveTextContent('gateResults')
  })

  it('keeps selected submission detail visible while workflow handoff polling refreshes', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      status: 'running',
      report: {
        title: '后台暂停中',
        workflowExecution: true,
        executionId: '77777777-7777-4777-8777-777777777777',
        executionStatus: 'paused',
        workflowDefinitionId: '88888888-8888-4888-8888-888888888888',
        workflowExecutionNotice: 'Workflow execution 暂停等待继续。',
        workflowExecutionUpdatedAt: '2026-04-25T02:08:00.000Z',
        workflowExecutionSummary: {
          completedSteps: 1,
          failedSteps: 0,
          cancelledSteps: 0,
          totalSteps: 4,
        },
      },
    })
    detailQuery.isFetching = true

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-1 详情',
      }),
    )

    const detail = screen.getByTestId('generated-app-submission-detail')
    expect(within(detail).getByText('正在刷新')).toBeInTheDocument()
    expect(screen.queryByText('正在加载提交详情...')).not.toBeInTheDocument()

    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute('data-execution-status', 'paused')
    expect(within(statusBlock).getByText('已暂停')).toBeInTheDocument()
    expect(
      within(statusBlock).getByText(
        'Workflow 已暂停，提交详情会继续自动刷新状态，并保留安全状态摘要。',
      ),
    ).toBeInTheDocument()
    expect(
      within(statusBlock).getByText('Workflow execution 暂停等待继续。'),
    ).toBeInTheDocument()
    expect(statusBlock).not.toHaveTextContent('77777777-7777')
    expect(statusBlock).not.toHaveTextContent('88888888-8888')
  })

  it('renders completed workflow handoff summary without exposing execution ids', async () => {
    const user = userEvent.setup()
    const executionId = '99999999-9999-4999-8999-999999999999'
    detailQuery.data = makeSubmission({
      report: {
        title: '执行完成',
        workflowExecution: true,
        executionId,
        executionStatus: 'completed',
        workflowDefinitionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        publicShareToken: 'token-snapshot',
        gateEvidence: [{ kind: 'browser', label: 'internal evidence' }],
        workflowExecutionUpdatedAt: '2026-04-25T02:12:00.000Z',
        workflowExecutionCompletedAt: '2026-04-25T02:12:30.000Z',
        workflowExecutionSummary: {
          summary: 'Workflow execution 已完成。',
          completedSteps: 3,
          failedSteps: 0,
          cancelledSteps: 0,
          totalSteps: 3,
          latestStepCompletedAt: '2026-04-25T02:12:20.000Z',
        },
      },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-1 详情',
      }),
    )

    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute('data-execution-status', 'completed')
    expect(within(statusBlock).getByText('已完成')).toBeInTheDocument()
    expect(
      within(statusBlock).getByText(/Workflow execution 已完成。/),
    ).toBeInTheDocument()
    expect(within(statusBlock).getByText('完成步骤')).toBeInTheDocument()
    expect(within(statusBlock).getByText('失败步骤')).toBeInTheDocument()
    expect(within(statusBlock).getByText('取消步骤')).toBeInTheDocument()
    expect(within(statusBlock).getByText('总步骤')).toBeInTheDocument()
    expect(within(statusBlock).getByText('最新步骤完成')).toBeInTheDocument()
    expect(statusBlock).not.toHaveTextContent(executionId)
    expect(statusBlock).not.toHaveTextContent('aaaaaaaa-aaaa')
    expect(statusBlock).not.toHaveTextContent('token-snapshot')
    expect(statusBlock).not.toHaveTextContent('gateEvidence')
    expect(statusBlock).not.toHaveTextContent('internal evidence')
  })

  it('renders unavailable workflow handoff reason and notice', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      report: {
        title: '未启动后台执行',
        workflowExecution: false,
        workflowExecutionNotStartedReason: '绑定 Workflow 尚未发布，未启动执行。',
        workflowExecutionNotice: '当前仅展示公开应用本地报告。',
      },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', {
        name: '查看提交记录 submission-1 详情',
      }),
    )

    const statusBlock = screen.getByTestId('creator-workflow-execution-status')
    expect(statusBlock).toHaveAttribute('data-execution-status', 'not-started')
    expect(within(statusBlock).getByText('未启动')).toBeInTheDocument()
    expect(
      within(statusBlock).getByText('绑定 Workflow 尚未发布，未启动执行。'),
    ).toBeInTheDocument()
    expect(
      within(statusBlock).getByText('当前仅展示公开应用本地报告。'),
    ).toBeInTheDocument()
  })

  it('updates status filter and pagination query params', async () => {
    const user = userEvent.setup()
    submissionsQuery.data = {
      data: [makeSubmission()],
      meta: { page: 1, pageSize: 10, total: 21, totalPages: 3 },
    }

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(screen.getByRole('combobox', { name: '状态筛选' }))
    await user.click(await screen.findByRole('option', { name: '失败' }))

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
