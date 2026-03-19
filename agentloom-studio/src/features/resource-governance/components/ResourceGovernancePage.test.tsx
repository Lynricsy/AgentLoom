import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceGovernancePage } from './ResourceGovernancePage'

const effectedAtLabel = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date('2026-03-18T04:01:00.000Z'))

const mocks = vi.hoisted(() => ({
  useAuthToken: vi.fn(),
  useResourceGovernance: vi.fn(),
  useUpdateTenantQuota: vi.fn(),
  useUpdateExecutionGovernanceControls: vi.fn(),
  useTerminateGovernedExecution: vi.fn(),
  quotaMutate: vi.fn(),
  controlsMutate: vi.fn(),
  terminateMutate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('../hooks/useResourceGovernance', () => ({
  useResourceGovernance: mocks.useResourceGovernance,
  useUpdateTenantQuota: mocks.useUpdateTenantQuota,
  useUpdateExecutionGovernanceControls: mocks.useUpdateExecutionGovernanceControls,
  useTerminateGovernedExecution: mocks.useTerminateGovernedExecution,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

const ownerToken = createToken({ tenantRole: 'owner', organizationId: 'org-1', tenantId: 'tenant-1' })
const adminToken = createToken({ tenantRole: 'admin', organizationId: 'org-1', tenantId: 'tenant-1' })
const creatorToken = createToken({ tenantRole: 'creator', organizationId: 'org-1' })
const ownerWithoutOrgToken = createToken({ tenantRole: 'owner' })

const baseState = {
  organizationId: 'org-1',
  quota: {
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    apiRateLimitPerMinute: 120,
    maxConcurrentExecutions: 12,
    dailyExecutionLimit: 240,
    dailyApiCallLimit: 800,
    storageQuotaMb: 2048,
    maxSandboxCpuPercent: 75,
    maxSandboxMemoryMb: 4096,
    version: 4,
    updatedBy: 'fox@ling.plus',
    updatedAt: '2026-03-18T02:00:00.000Z',
  },
  governance: {
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    version: 7,
    tenantControl: {
      scope: 'tenant' as const,
      targetId: 'tenant-1',
      status: 'active' as const,
      reason: null,
      updatedAt: '2026-03-18T03:00:00.000Z',
      updatedBy: 'owner@ling.plus',
    },
    workflowControls: [
      {
        scope: 'workflow' as const,
        targetId: '123e4567-e89b-42d3-a456-426614174001',
        status: 'paused' as const,
        reason: '当前工作流存在异常流量。',
        updatedAt: '2026-03-18T03:30:00.000Z',
        updatedBy: 'owner@ling.plus',
      },
    ],
  },
}

describe('ResourceGovernancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.useAuthToken.mockReturnValue(ownerToken)
    mocks.useResourceGovernance.mockReturnValue({
      data: baseState,
      isLoading: false,
      isError: false,
      error: null,
    })
    mocks.useUpdateTenantQuota.mockReturnValue({
      mutate: mocks.quotaMutate,
      isPending: false,
    })
    mocks.useUpdateExecutionGovernanceControls.mockReturnValue({
      mutate: mocks.controlsMutate,
      isPending: false,
    })
    mocks.useTerminateGovernedExecution.mockReturnValue({
      mutate: mocks.terminateMutate,
      isPending: false,
    })
  })

  it('shows a forbidden state for direct non-owner/admin access', () => {
    mocks.useAuthToken.mockReturnValue(creatorToken)

    render(<ResourceGovernancePage />)

    expect(screen.getByTestId('resource-governance-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问资源治理')).toBeInTheDocument()
    expect(screen.getByText(/当前租户角色为 creator/)).toBeInTheDocument()
  })

  it('shows a missing-organization state when the owner token has no org claim', () => {
    mocks.useAuthToken.mockReturnValue(ownerWithoutOrgToken)

    render(<ResourceGovernancePage />)

    expect(screen.getByTestId('resource-governance-missing-org')).toBeInTheDocument()
    expect(screen.getByText('无法识别当前组织')).toBeInTheDocument()
  })

  it('renders content for admin users and distinguishes governance pause wording', () => {
    mocks.useAuthToken.mockReturnValue(adminToken)

    render(<ResourceGovernancePage />)

    expect(screen.getByTestId('resource-governance-page')).toBeInTheDocument()
    expect(screen.getByTestId('resource-governance-metadata')).toHaveTextContent('tenant-1')
    expect(screen.getByTestId('resource-governance-metadata')).toHaveTextContent('配额版本')
    expect(screen.getByTestId('resource-governance-controls-form')).toHaveTextContent(
      '治理暂停只会阻止新的执行进入',
    )
  })

  it('updates quota fields through the quota mutation flow', async () => {
    const user = userEvent.setup()

    mocks.quotaMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        ...baseState.quota,
        dailyExecutionLimit: 480,
        version: 5,
      })
    })

    render(<ResourceGovernancePage />)

    const dailyExecutionInput = screen.getByLabelText('每日执行额度')
    await user.clear(dailyExecutionInput)
    await user.type(dailyExecutionInput, '480')
    await user.click(screen.getByRole('button', { name: '保存配额' }))

    expect(mocks.quotaMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiRateLimitPerMinute: 120,
        dailyExecutionLimit: 480,
        maxConcurrentExecutions: 12,
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '资源配额已更新',
        variant: 'success',
      }),
    )
  })

  it('updates tenant and workflow governance controls', async () => {
    const user = userEvent.setup()

    mocks.controlsMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        organizationId: 'org-1',
        action: 'governance_update',
        scope: 'workflow',
        requestedAt: '2026-03-18T04:00:00.000Z',
        effectedAt: '2026-03-18T04:01:00.000Z',
        operator: 'owner@ling.plus',
        reason: '高峰期先阻止新执行进入。',
        effectiveState: baseState,
        affectedSummary: {
          requested: 2,
          affected: 2,
          skipped: 0,
          workflowTargetIds: ['123e4567-e89b-42d3-a456-426614174001'],
        },
        metadata: {},
      })
    })

    render(<ResourceGovernancePage />)

    await user.selectOptions(screen.getByLabelText('租户治理状态'), 'paused')
    await user.clear(screen.getByLabelText('租户治理原因'))
    await user.type(screen.getByLabelText('租户治理原因'), '高峰期先阻止新执行进入。')
    await user.clear(screen.getByLabelText('工作流治理原因 1'))
    await user.type(screen.getByLabelText('工作流治理原因 1'), '异常流量已经确认。')
    await user.click(screen.getByRole('button', { name: '更新治理控制' }))

    expect(mocks.controlsMutate).toHaveBeenCalledWith(
      {
        tenantControl: {
          status: 'paused',
          reason: '高峰期先阻止新执行进入。',
        },
        workflowControls: [
          {
            scope: 'workflow',
            targetId: '123e4567-e89b-42d3-a456-426614174001',
            status: 'paused',
            reason: '异常流量已经确认。',
          },
        ],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('resource-governance-governance-action')).toBeInTheDocument()
    })
    expect(screen.getByTestId('resource-governance-governance-action')).toHaveTextContent(
      `生效时间：${effectedAtLabel}`,
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '治理控制已更新',
        variant: 'success',
      }),
    )
  })

  it('terminates an anomalous execution by execution ID and reason', async () => {
    const user = userEvent.setup()

    mocks.terminateMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        organizationId: 'org-1',
        action: 'execution_termination',
        scope: 'execution',
        requestedAt: '2026-03-18T05:00:00.000Z',
        effectedAt: '2026-03-18T05:01:00.000Z',
        operator: 'owner@ling.plus',
        reason: '检测到异常循环调用，立即止损。',
        effectiveState: baseState,
        affectedSummary: {
          requested: 1,
          affected: 1,
          skipped: 0,
          executionId: '123e4567-e89b-42d3-a456-426614174099',
          workflowId: '123e4567-e89b-42d3-a456-426614174111',
          finalStatus: 'cancelled',
          timelineUrl: '/executions/123e4567-e89b-42d3-a456-426614174099',
        },
        metadata: {},
        executionId: '123e4567-e89b-42d3-a456-426614174099',
        workflowId: '123e4567-e89b-42d3-a456-426614174111',
        execution: {
          id: '123e4567-e89b-42d3-a456-426614174099',
          workflowId: '123e4567-e89b-42d3-a456-426614174111',
          status: 'cancelled',
          timelineUrl: '/executions/123e4567-e89b-42d3-a456-426614174099',
        },
      })
    })

    render(<ResourceGovernancePage />)

    await user.type(
      screen.getByLabelText('异常执行 ID'),
      '123e4567-e89b-42d3-a456-426614174099',
    )
    await user.type(screen.getByLabelText('终止原因'), '检测到异常循环调用，立即止损。')
    await user.click(screen.getByRole('button', { name: '终止异常执行' }))

    expect(mocks.terminateMutate).toHaveBeenCalledWith(
      {
        executionId: '123e4567-e89b-42d3-a456-426614174099',
        reason: '检测到异常循环调用，立即止损。',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('resource-governance-termination-action')).toBeInTheDocument()
    })
    expect(screen.getByTestId('resource-governance-termination-action')).toHaveTextContent(
      '123e4567-e89b-42d3-a456-426614174099',
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '异常执行已终止',
        variant: 'success',
      }),
    )
  })
})
