import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHttpError } from '@/features/organization/testing/makeHttpError'
import { OrganizationAutonomyPolicyPage } from './OrganizationAutonomyPolicyPage'

const mocks = vi.hoisted(() => ({
  useAuthToken: vi.fn(),
  useCurrentOrganization: vi.fn(),
  refetchCurrentOrganization: vi.fn(),
  useOrganizationAutonomyPolicy: vi.fn(),
  useUpdateOrganizationAutonomyPolicy: vi.fn(),
  usePreviewOrganizationAutonomyDowngrade: vi.fn(),
  useConfirmOrganizationAutonomyDowngrade: vi.fn(),
  updateMutate: vi.fn(),
  previewMutate: vi.fn(),
  confirmMutate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('@/features/organization/api/organizationQueries', () => ({
  useCurrentOrganization: mocks.useCurrentOrganization,
}))

vi.mock('../hooks/useOrganizationAutonomyPolicy', () => ({
  useOrganizationAutonomyPolicy: mocks.useOrganizationAutonomyPolicy,
  useUpdateOrganizationAutonomyPolicy: mocks.useUpdateOrganizationAutonomyPolicy,
  usePreviewOrganizationAutonomyDowngrade: mocks.usePreviewOrganizationAutonomyDowngrade,
  useConfirmOrganizationAutonomyDowngrade: mocks.useConfirmOrganizationAutonomyDowngrade,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

// 真实部署的 Supabase JWT 里没有任何组织 claim，只有 tenant_role / tenant_id
const ownerToken = createToken({ tenantRole: 'owner', tenantId: 'tenant-1' })
const creatorToken = createToken({ tenantRole: 'creator', tenantId: 'tenant-1' })

const basePolicy = {
  organizationId: 'org-1',
  autonomyCap: 'RULE_BASED' as const,
  version: 3,
  violationSummary: {
    workflowCount: 1,
    nodeCount: 2,
  },
  createdAt: '2026-03-18T01:00:00.000Z',
  updatedAt: '2026-03-18T02:00:00.000Z',
  updatedBy: 'fox@ling.plus',
}

describe('OrganizationAutonomyPolicyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.useAuthToken.mockReturnValue(ownerToken)
    mocks.useOrganizationAutonomyPolicy.mockReturnValue({
      data: basePolicy,
      isLoading: false,
      isError: false,
      error: null,
    })
    mocks.useUpdateOrganizationAutonomyPolicy.mockReturnValue({
      mutate: mocks.updateMutate,
      isPending: false,
    })
    mocks.usePreviewOrganizationAutonomyDowngrade.mockReturnValue({
      mutate: mocks.previewMutate,
      isPending: false,
    })
    mocks.useConfirmOrganizationAutonomyDowngrade.mockReturnValue({
      mutate: mocks.confirmMutate,
      isPending: false,
    })
    mocks.useCurrentOrganization.mockReturnValue({
      data: { id: 'org-1' },
      isLoading: false,
      error: null,
      refetch: mocks.refetchCurrentOrganization,
    })
  })

  it('shows a forbidden state for direct non-owner access', () => {
    mocks.useAuthToken.mockReturnValue(creatorToken)

    render(<OrganizationAutonomyPolicyPage />)

    expect(screen.getByTestId('organization-autonomy-policy-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问组织自治策略')).toBeInTheDocument()
    expect(screen.getByText(/当前租户角色为 creator/)).toBeInTheDocument()
  })

  it('组织解析中只展示骨架，不发起自治策略请求', () => {
    mocks.useCurrentOrganization.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mocks.refetchCurrentOrganization,
    })

    render(<OrganizationAutonomyPolicyPage />)

    expect(
      screen.getByTestId('organization-autonomy-policy-organization-loading'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('organization-autonomy-policy-missing-org'),
    ).not.toBeInTheDocument()
    expect(mocks.useOrganizationAutonomyPolicy).not.toHaveBeenCalled()
  })

  it('当前组织请求失败时展示错误态、可重试，且不发起自治策略请求', async () => {
    const user = userEvent.setup()

    mocks.useCurrentOrganization.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: makeHttpError(404, { detail: '组织未找到' }),
      refetch: mocks.refetchCurrentOrganization,
    })

    render(<OrganizationAutonomyPolicyPage />)

    expect(screen.getByTestId('organization-autonomy-policy-missing-org')).toBeInTheDocument()
    expect(screen.getByText('无法确定当前组织')).toBeInTheDocument()
    expect(screen.getByText(/当前租户还没有关联组织/)).toBeInTheDocument()
    expect(mocks.useOrganizationAutonomyPolicy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(mocks.refetchCurrentOrganization).toHaveBeenCalledTimes(1)
  })

  it('用 organizations/current 返回的组织 id 请求自治策略，而不是租户 id', () => {
    render(<OrganizationAutonomyPolicyPage />)

    expect(mocks.useOrganizationAutonomyPolicy).toHaveBeenCalledWith('org-1')
    expect(mocks.useOrganizationAutonomyPolicy).not.toHaveBeenCalledWith('tenant-1')
  })

  it('renders updatedBy metadata on the current policy card', () => {
    render(<OrganizationAutonomyPolicyPage />)

    expect(screen.getByText('更新人：fox@ling.plus')).toBeInTheDocument()
  })

  it('updates the policy directly when selecting a looser autonomy cap', async () => {
    const user = userEvent.setup()

    mocks.updateMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        ...basePolicy,
        autonomyCap: 'LLM_SUGGEST',
        version: 4,
      })
    })

    render(<OrganizationAutonomyPolicyPage />)

    await user.click(screen.getByLabelText('目标自治上限'))
    await user.click(await screen.findByRole('option', { name: 'LLM 建议' }))
    await user.click(screen.getByRole('button', { name: '保存策略' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { autonomyCap: 'LLM_SUGGEST' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '组织自治策略已更新',
        variant: 'success',
      }),
    )
  })

  it('supports previewing and confirming a tighter downgrade plan', async () => {
    const user = userEvent.setup()

    mocks.previewMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        organizationId: 'org-1',
        autonomyCap: 'MANUAL_CONFIRM',
        violationSummary: {
          workflowCount: 2,
          nodeCount: 3,
        },
        violations: [
          {
            workflowId: 'wf-1',
            workflowName: '客户总结流程',
            nodeId: 'node-1',
            nodeName: '总结 Agent',
            rawMode: 'LLM_SUGGEST',
            canonicalMode: 'LLM_SUGGEST',
            replacementMode: 'MANUAL_CONFIRM',
            source: 'node',
            reasonCode: 'ORG_POLICY_CAP',
            message: '当前节点使用的自治模式超出组织上限。',
          },
        ],
      })
    })

    mocks.confirmMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({
        organizationId: 'org-1',
        autonomyCap: 'MANUAL_CONFIRM',
        downgradedSummary: {
          workflowCount: 2,
          nodeCount: 3,
        },
        downgradedViolations: [],
        policy: {
          ...basePolicy,
          autonomyCap: 'MANUAL_CONFIRM',
          version: 4,
        },
      })
    })

    render(<OrganizationAutonomyPolicyPage />)

    await user.click(screen.getByLabelText('目标自治上限'))
    await user.click(await screen.findByRole('option', { name: '手动确认' }))
    await user.click(screen.getByRole('button', { name: '预览批量降级影响' }))

    await waitFor(() => {
      expect(screen.getByTestId('organization-autonomy-policy-preview')).toBeInTheDocument()
    })

    expect(screen.getByTestId('organization-autonomy-policy-preview')).toHaveTextContent('客户总结流程')
    expect(screen.getByTestId('organization-autonomy-policy-preview')).toHaveTextContent('总结 Agent')

    await user.click(screen.getByRole('button', { name: '确认批量降级并更新策略' }))

    expect(mocks.confirmMutate).toHaveBeenCalledWith(
      { autonomyCap: 'MANUAL_CONFIRM' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '已确认批量降级',
        variant: 'success',
      }),
    )
  })
})
