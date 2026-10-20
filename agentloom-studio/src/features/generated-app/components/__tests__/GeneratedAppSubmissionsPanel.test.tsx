import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedAppSubmission } from '../../types'
import { GeneratedAppSubmissionsPanel } from '../GeneratedAppSubmissionsPanel'

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

const EXECUTION_ID = '77777777-7777-4777-8777-777777777777'
const WORKFLOW_ID = '88888888-8888-4888-8888-888888888888'
const VERSION_ID = '99999999-9999-4999-8999-999999999999'

function makeSubmission(
  overrides: Partial<GeneratedAppSubmission> = {},
): GeneratedAppSubmission {
  return {
    id: 'submission-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    appSpecVersion: 2,
    publicShareToken: 'token-snapshot',
    origin: 'public',
    generationRunId: null,
    anonymousSessionId: 'anon-1',
    status: 'completed',
    input: { question: '工作流有哪几种状态？' },
    result: {
      status: 'completed',
      sections: [
        {
          sectionId: 'answer',
          label: '答案',
          format: 'text',
          value: '草稿与已发布',
        },
      ],
      publicError: null,
    },
    report: {
      kind: 'generated-app-runtime-execution',
      workflowDefinitionId: WORKFLOW_ID,
      workflowVersionId: VERSION_ID,
      executionId: EXECUTION_ID,
      notStartedReason: null,
    },
    errorMessage: null,
    createdAt: '2026-10-20T02:00:00.000Z',
    updatedAt: '2026-10-20T02:05:00.000Z',
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

function lastListParams() {
  return useGeneratedAppSubmissionsMock.mock.calls[
    useGeneratedAppSubmissionsMock.mock.calls.length - 1
  ]
}

describe('GeneratedAppSubmissionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submissionsQuery.data = makeListData([
      makeSubmission(),
      makeSubmission({
        id: 'submission-2',
        anonymousSessionId: 'anon-2',
        status: 'failed',
        input: { question: '最多能同时运行几个子 Agent？' },
        result: {
          status: 'failed',
          sections: [],
          publicError: '执行记录不可用，无法取得结果，请重新提交。',
        },
        errorMessage: '执行记录不可用，无法取得结果，请重新提交。',
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

  it('列表行展示状态、来源、会话、输入、结果与错误摘要，不展示公开令牌', () => {
    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('共 2 条提交记录')).toBeInTheDocument()
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
    expect(screen.getAllByText('失败').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: '来源' })).toBeInTheDocument()
    expect(screen.getAllByText('终端用户').length).toBeGreaterThan(0)
    expect(screen.getByText('anon-1')).toBeInTheDocument()
    expect(screen.getByText(/最多能同时运行几个子 Agent/)).toBeInTheDocument()
    expect(screen.getByText(/草稿与已发布/)).toBeInTheDocument()
    expect(
      screen.getAllByText(/执行记录不可用/).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('token-snapshot')).not.toBeInTheDocument()
  })

  it('默认只请求终端用户提交（origin=public）', () => {
    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(lastListParams()).toEqual([
      'app-1',
      { page: 1, pageSize: 10, origin: 'public', status: undefined },
    ])
  })

  it('切换来源到 Gate 5 验收后按 origin=gate-acceptance 查询并回到第一页', async () => {
    const user = userEvent.setup()
    submissionsQuery.data = {
      data: [makeSubmission()],
      meta: { page: 1, pageSize: 10, total: 21, totalPages: 3 },
    }

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await user.click(screen.getByRole('combobox', { name: '来源筛选' }))
    await user.click(await screen.findByRole('option', { name: 'Gate 5 验收' }))

    await waitFor(() => {
      expect(lastListParams()).toEqual([
        'app-1',
        { page: 1, pageSize: 10, origin: 'gate-acceptance', status: undefined },
      ])
    })
  })

  it('详情展示来源、所属生成运行与执行引用', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      origin: 'gate-acceptance',
      generationRunId: 'run-42',
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '查看提交记录 submission-1 详情' }),
    )

    const detail = within(screen.getByTestId('generated-app-submission-detail'))
    expect(detail.getByText('Gate 5 验收')).toBeInTheDocument()
    expect(detail.getByText('run-42')).toBeInTheDocument()
    expect(detail.getByText('v2')).toBeInTheDocument()

    const reference = within(screen.getByTestId('creator-execution-reference'))
    expect(reference.getByText(EXECUTION_ID)).toBeInTheDocument()
    expect(reference.getByText(WORKFLOW_ID)).toBeInTheDocument()
    expect(reference.getByText(VERSION_ID)).toBeInTheDocument()
    expect(detail.queryByText('token-snapshot')).not.toBeInTheDocument()
  })

  it('未启动执行时显示原因', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      status: 'failed',
      report: {
        kind: 'generated-app-runtime-execution',
        workflowDefinitionId: WORKFLOW_ID,
        workflowVersionId: null,
        executionId: null,
        notStartedReason: 'workflow_not_published',
      },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '查看提交记录 submission-1 详情' }),
    )

    const reference = within(screen.getByTestId('creator-execution-reference'))
    expect(
      reference.getByText('未启动执行：workflow_not_published'),
    ).toBeInTheDocument()
    expect(reference.getAllByText('无').length).toBe(2)
  })

  it('没有执行引用的历史提交给出说明', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      appSpecVersion: 1,
      report: { title: '问诊报告' },
    })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '查看提交记录 submission-1 详情' }),
    )

    expect(
      within(screen.getByTestId('creator-execution-reference')).getByText(
        '这条提交没有执行引用（AppSpec v2 之前的历史提交）。',
      ),
    ).toBeInTheDocument()
  })

  it('轮询刷新时保留已选详情', async () => {
    const user = userEvent.setup()
    detailQuery.data = makeSubmission({
      status: 'running',
      result: { status: 'running', sections: [], publicError: null },
    })
    detailQuery.isFetching = true

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '查看提交记录 submission-1 详情' }),
    )

    const detail = screen.getByTestId('generated-app-submission-detail')
    expect(within(detail).getByText('正在刷新')).toBeInTheDocument()
    expect(screen.queryByText('正在加载提交详情…')).not.toBeInTheDocument()
  })

  it('状态筛选与翻页保留来源参数', async () => {
    const user = userEvent.setup()
    submissionsQuery.data = {
      data: [makeSubmission()],
      meta: { page: 1, pageSize: 10, total: 21, totalPages: 3 },
    }

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(screen.getByRole('combobox', { name: '状态筛选' }))
    await user.click(await screen.findByRole('option', { name: '失败' }))

    await waitFor(() => {
      expect(lastListParams()).toEqual([
        'app-1',
        { page: 1, pageSize: 10, origin: 'public', status: 'failed' },
      ])
    })

    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      expect(lastListParams()).toEqual([
        'app-1',
        { page: 2, pageSize: 10, origin: 'public', status: 'failed' },
      ])
    })
  })

  it('确认后删除单条提交', async () => {
    const user = userEvent.setup()
    deleteMutation.mutateAsync.mockResolvedValue({ deletedCount: 1 })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('button', { name: '删除提交记录 submission-1' }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/submission-1/)).toBeInTheDocument()
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }))
    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith('submission-1')
      expect(notifyMock).toHaveBeenCalledWith({
        title: '提交记录已删除',
        description: '已删除 1 条提交记录。',
        variant: 'success',
      })
    })
  })

  it('确认后批量删除所选提交', async () => {
    const user = userEvent.setup()
    bulkDeleteMutation.mutateAsync.mockResolvedValue({ deletedCount: 2 })

    render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    await user.click(
      screen.getByRole('checkbox', { name: '选择提交记录 submission-1' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: '选择提交记录 submission-2' }),
    )
    await user.click(screen.getByRole('button', { name: '删除所选 (2)' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/2 条提交记录/)).toBeInTheDocument()
    expect(bulkDeleteMutation.mutateAsync).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }))
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

  it('空列表与加载失败状态', () => {
    submissionsQuery.data = makeListData([])

    const { rerender } = render(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('暂无提交记录')).toBeInTheDocument()

    submissionsQuery.isError = true
    rerender(<GeneratedAppSubmissionsPanel appId="app-1" />)

    expect(screen.getByText('提交记录加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})
