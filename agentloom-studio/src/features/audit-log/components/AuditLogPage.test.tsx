import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuditLogPage } from './AuditLogPage'

const mocks = vi.hoisted(() => ({
  useAuthToken: vi.fn(),
  useAuditLogs: vi.fn(),
  useAuditLogDetail: vi.fn(),
  useAuditLogResourceSequence: vi.fn(),
  refetchSequence: vi.fn(),
  refetchExportJob: vi.fn(),
  createExportMutate: vi.fn(),
  refreshDownloadMutate: vi.fn(),
  useCreateEvidenceExport: vi.fn(),
  useEvidenceExportJob: vi.fn(),
  useEvidenceExportDownloadDetail: vi.fn(),
  useRefreshEvidenceExportDownloadDetail: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('../hooks/useAuditLogs', () => ({
  useAuditLogs: mocks.useAuditLogs,
  useAuditLogDetail: mocks.useAuditLogDetail,
  useAuditLogResourceSequence: mocks.useAuditLogResourceSequence,
}))

vi.mock('@/features/evidence', () => ({
  useCreateEvidenceExport: mocks.useCreateEvidenceExport,
  useEvidenceExportJob: mocks.useEvidenceExportJob,
  useEvidenceExportDownloadDetail: mocks.useEvidenceExportDownloadDetail,
  useRefreshEvidenceExportDownloadDetail: mocks.useRefreshEvidenceExportDownloadDetail,
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

const adminToken = createToken({ tenantRole: 'admin' })
const creatorToken = createToken({ tenant_role: 'creator' })
const exportJob = {
  id: 'export-1',
  status: 'completed' as const,
  matchedExecutionCount: 2,
  requestedAt: '2026-03-17T09:15:00.000Z',
  expiresAt: '2026-03-18T09:15:00.000Z',
  fileName: 'evidence-export-1.zip',
  mimeType: 'application/zip',
  lastError: null,
}
const exportDownloadDetail = {
  url: 'https://download.example/export-1',
  fileName: 'evidence-export-1.zip',
  mimeType: 'application/zip',
  expiresAt: '2026-03-17T12:30:00.000Z',
  expiresIn: 600,
}

let createExportError: Error | null = null
let refreshDownloadError: Error | null = null

const auditRecords = [
  {
    id: 'log-1',
    actorId: 'user-1',
    actorType: 'user' as const,
    eventType: 'workflow.updated',
    resourceType: 'workflow_definition',
    resourceId: 'wf-1',
    executionId: 'exec-1',
    summary: '第一条变更摘要',
    before: { name: '旧名称' },
    after: { name: '新名称' },
    metadata: { source: 'settings' },
    createdAt: '2026-03-17T08:00:00.000Z',
  },
  {
    id: 'log-2',
    actorId: 'svc-1',
    actorType: 'service' as const,
    eventType: 'permission.changed',
    resourceType: 'tool_permission',
    resourceId: 'perm-2',
    executionId: null,
    summary: '第二条变更摘要',
    before: { enabled: false },
    after: { enabled: true },
    metadata: { source: 'automation' },
    createdAt: '2026-03-17T09:00:00.000Z',
  },
]

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createExportError = null
    refreshDownloadError = null
    mocks.useAuthToken.mockReturnValue(adminToken)
    mocks.useAuditLogs.mockReturnValue({
      data: {
        data: auditRecords,
        meta: {
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })
    mocks.useAuditLogDetail.mockImplementation((id: string | null) => ({
      data: auditRecords.find((record) => record.id === id) ?? null,
      isLoading: false,
      error: null,
    }))
    mocks.refetchSequence.mockResolvedValue(undefined)
    mocks.refetchExportJob.mockResolvedValue(undefined)
    mocks.useAuditLogResourceSequence.mockReturnValue({
      data: [auditRecords[0]],
      isFetching: false,
      error: null,
      refetch: mocks.refetchSequence,
    })
    mocks.createExportMutate.mockImplementation((_request, options) => {
      options?.onSuccess?.({ data: exportJob })
    })
    mocks.refreshDownloadMutate.mockImplementation(() => undefined)
    mocks.useCreateEvidenceExport.mockImplementation(() => ({
      mutate: mocks.createExportMutate,
      isPending: false,
      error: createExportError,
    }))
    mocks.useEvidenceExportJob.mockImplementation((exportId?: string | null) => ({
      data: exportId === exportJob.id ? { data: exportJob } : undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: mocks.refetchExportJob,
    }))
    mocks.useEvidenceExportDownloadDetail.mockImplementation((exportId?: string | null) => ({
      data: exportId === exportJob.id ? { data: exportDownloadDetail } : undefined,
      isLoading: false,
      isFetching: false,
      error: null,
    }))
    mocks.useRefreshEvidenceExportDownloadDetail.mockImplementation(() => ({
      mutate: mocks.refreshDownloadMutate,
      isPending: false,
      error: refreshDownloadError,
    }))
  })

  it('shows a forbidden state for creator direct access', () => {
    mocks.useAuthToken.mockReturnValue(creatorToken)

    render(<AuditLogPage />)

    expect(screen.getByTestId('audit-log-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问审计日志')).toBeInTheDocument()
    expect(screen.getByText(/当前租户角色为 creator/)).toBeInTheDocument()
  })

  it('renders loading and empty states from the audit log query', () => {
    mocks.useAuditLogs.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isFetching: false,
      error: null,
    })

    const { rerender } = render(<AuditLogPage />)
    expect(screen.getByText('加载审计日志中…')).toBeInTheDocument()

    mocks.useAuditLogs.mockReturnValueOnce({
      data: {
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })

    rerender(<AuditLogPage />)
    expect(screen.getByText('还没有匹配的审计记录')).toBeInTheDocument()
  })

  it('supports selecting records and loading the resource sequence', async () => {
    const user = userEvent.setup()

    render(<AuditLogPage />)

    expect(screen.getByTestId('audit-log-detail')).toHaveTextContent('第一条变更摘要')

    await user.click(screen.getByTestId('audit-log-row-log-2'))

    expect(screen.getByTestId('audit-log-detail')).toHaveTextContent('第二条变更摘要')
    expect(screen.getByTestId('audit-log-metadata')).toHaveTextContent('automation')

    await user.click(screen.getByRole('button', { name: '查看资源时序' }))

    await waitFor(() => {
      expect(mocks.refetchSequence).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('audit-log-sequence')).toBeInTheDocument()
  })

  it('creates an evidence export from the current applied filters instead of unsaved draft edits', async () => {
    const user = userEvent.setup()

    render(<AuditLogPage />)

    await user.type(screen.getByLabelText('事件类型'), 'workflow.updated')
    await user.type(screen.getByLabelText('资源类型'), 'workflow_definition')
    await user.type(screen.getByLabelText('资源 ID'), 'wf-77')
    await user.type(screen.getByLabelText('执行 ID'), 'exec-77')
    await user.click(screen.getByLabelText('操作人类型'))
    await user.click(await screen.findByRole('option', { name: 'user' }))
    await user.type(screen.getByLabelText('操作人 ID'), 'user-77')
    await user.click(screen.getByRole('button', { name: '应用筛选' }))

    const eventTypeInput = screen.getByLabelText('事件类型')
    await user.clear(eventTypeInput)
    await user.type(eventTypeInput, 'workflow.deleted')

    await user.click(screen.getByRole('button', { name: '创建证据导出' }))

    await waitFor(() => {
      expect(mocks.createExportMutate).toHaveBeenCalledWith(
        {
          eventType: 'workflow.updated',
          resourceType: 'workflow_definition',
          resourceId: 'wf-77',
          executionId: 'exec-77',
          actorType: 'user',
          actorId: 'user-77',
          includeAuditMetadata: true,
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
        }),
      )
    })
  })

  it('shows mutation error feedback when creating an evidence export fails', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AuditLogPage />)

    mocks.createExportMutate.mockImplementation(() => {
      createExportError = new Error('创建导出失败，请稍后重试')
    })

    await user.click(screen.getByRole('button', { name: '创建证据导出' }))

    await waitFor(() => {
      expect(mocks.createExportMutate).toHaveBeenCalledTimes(1)
    })

    rerender(<AuditLogPage />)

    expect(screen.getByText('创建导出失败，请稍后重试')).toBeInTheDocument()
  })

  it('shows completed export feedback with download and refresh actions inline', async () => {
    const user = userEvent.setup()

    render(<AuditLogPage />)

    await user.click(screen.getByRole('button', { name: '创建证据导出' }))

    expect(await screen.findByText('导出已就绪')).toBeInTheDocument()

    const downloadLink = screen.getByRole('link', { name: '下载导出文件' })
    expect(downloadLink).toHaveAttribute('href', 'https://download.example/export-1')

    await user.click(screen.getByRole('button', { name: '刷新下载链接' }))

    await waitFor(() => {
      expect(mocks.refreshDownloadMutate).toHaveBeenCalledTimes(1)
    })
  })

  it('shows mutation error feedback when refreshing the download link fails', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AuditLogPage />)

    await user.click(screen.getByRole('button', { name: '创建证据导出' }))

    expect(await screen.findByText('导出已就绪')).toBeInTheDocument()

    mocks.refreshDownloadMutate.mockImplementation(() => {
      refreshDownloadError = new Error('刷新下载链接失败，请重新创建导出任务')
    })

    await user.click(screen.getByRole('button', { name: '刷新下载链接' }))

    await waitFor(() => {
      expect(mocks.refreshDownloadMutate).toHaveBeenCalledTimes(1)
    })

    rerender(<AuditLogPage />)

    expect(screen.getByText('刷新下载链接失败，请重新创建导出任务')).toBeInTheDocument()
  })
})
