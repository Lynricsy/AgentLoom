import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHttpError } from '../testing/makeHttpError'
import type { Organization, OrganizationMember } from '../types'

const mocks = vi.hoisted(() => ({
  authToken: vi.fn<() => string | undefined>(() => 'token'),
  role: vi.fn<() => string | null>(() => 'owner'),
  useCurrentOrganization: vi.fn(),
  useOrganizationMembers: vi.fn(),
  useInviteOrganizationMember: vi.fn(),
  useUpdateOrganizationMemberRole: vi.fn(),
  useRemoveOrganizationMember: vi.fn(),
  invite: vi.fn(),
  updateRole: vi.fn(),
  remove: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: () => mocks.authToken(),
}))

vi.mock('@/features/intervention-policy', () => ({
  getInterventionPolicyRoleFromToken: () => mocks.role(),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

// 组织 id 现在来自服务端响应，测试要能看到各 hook 实际收到的 id
vi.mock('../api/organizationQueries', () => ({
  useCurrentOrganization: () => mocks.useCurrentOrganization(),
  useOrganizationMembers: (organizationId?: string, options?: unknown) =>
    mocks.useOrganizationMembers(organizationId, options),
  useInviteOrganizationMember: (organizationId?: string) => {
    mocks.useInviteOrganizationMember(organizationId)
    return { mutateAsync: mocks.invite, isPending: false }
  },
  useUpdateOrganizationMemberRole: (organizationId?: string) => {
    mocks.useUpdateOrganizationMemberRole(organizationId)
    return { mutateAsync: mocks.updateRole, isPending: false }
  },
  useRemoveOrganizationMember: (organizationId?: string) => {
    mocks.useRemoveOrganizationMember(organizationId)
    return { mutateAsync: mocks.remove, isPending: false }
  },
}))

import { OrganizationSettingsPage } from './OrganizationSettingsPage'

const organization: Organization = {
  id: 'org-1',
  name: 'Acme 智能体',
  slug: 'acme',
  description: '内部自动化团队',
  ownerId: 'user-1',
  isActive: true,
  createdAt: '2026-01-05T03:00:00.000Z',
  updatedAt: '2026-02-05T03:00:00.000Z',
  memberCount: 2,
}

const members: OrganizationMember[] = [
  {
    userId: 'user-1',
    email: 'owner@acme.dev',
    displayName: '组织所有者',
    role: 'owner',
    createdAt: '2026-01-05T03:00:00.000Z',
  },
  {
    userId: 'user-2',
    email: 'dev@acme.dev',
    displayName: null,
    role: 'creator',
    createdAt: '2026-02-11T08:30:00.000Z',
  },
]

function organizationQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: organization,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function membersQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: members,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('OrganizationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authToken.mockReturnValue('token')
    mocks.role.mockReturnValue('owner')
    mocks.useCurrentOrganization.mockReturnValue(organizationQuery())
    mocks.useOrganizationMembers.mockReturnValue(membersQuery())
  })

  it('用 organizations/current 返回的组织 id 拉取成员名册', () => {
    render(<OrganizationSettingsPage />)

    expect(screen.getByText('Acme 智能体')).toBeInTheDocument()
    expect(mocks.useOrganizationMembers).toHaveBeenCalledWith('org-1', {
      enabled: true,
    })
  })

  it('当前组织加载失败时展示错误态且不请求成员名册', () => {
    mocks.useCurrentOrganization.mockReturnValue(
      organizationQuery({
        data: undefined,
        isError: true,
        error: new Error('network down'),
      }),
    )

    render(<OrganizationSettingsPage />)

    expect(screen.getByText('组织信息加载失败')).toBeInTheDocument()
    // 名册区块整体不渲染，且成员 hook 拿不到 id，自然不会发请求
    expect(screen.queryByText('成员名册')).not.toBeInTheDocument()
    expect(mocks.useOrganizationMembers).toHaveBeenCalledWith(undefined, {
      enabled: true,
    })
  })

  it('服务端未找到当前租户对应组织时提示未归属组织', () => {
    mocks.useCurrentOrganization.mockReturnValue(
      organizationQuery({
        data: undefined,
        isError: true,
        error: makeHttpError(404, { detail: '组织不存在或无权限' }),
      }),
    )

    render(<OrganizationSettingsPage />)

    expect(screen.getByText('当前账号未归属任何组织')).toBeInTheDocument()
    expect(screen.queryByText('组织信息加载失败')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /邀请成员/ })).not.toBeInTheDocument()
  })

  it('邀请与成员管理都使用服务端返回的真实组织 id', () => {
    render(<OrganizationSettingsPage />)

    expect(mocks.useInviteOrganizationMember).toHaveBeenCalledWith('org-1')
    expect(mocks.useUpdateOrganizationMemberRole).toHaveBeenCalledWith('org-1')
    expect(mocks.useRemoveOrganizationMember).toHaveBeenCalledWith('org-1')
  })

  it('渲染组织信息卡与成员名册', () => {
    render(<OrganizationSettingsPage />)

    expect(screen.getByText('Acme 智能体')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.getByText('内部自动化团队')).toBeInTheDocument()
    expect(screen.getByText('共 2 人')).toBeInTheDocument()

    expect(screen.getByText('owner@acme.dev')).toBeInTheDocument()
    expect(screen.getByText('组织所有者')).toBeInTheDocument()
    // displayName 为 null 时回落到占位文案
    expect(screen.getByText('未设置')).toBeInTheDocument()
  })

  it('名册加载中渲染骨架行而非成员数据', () => {
    mocks.useOrganizationMembers.mockReturnValue(
      membersQuery({ data: undefined, isLoading: true }),
    )

    render(<OrganizationSettingsPage />)

    expect(screen.queryByText('owner@acme.dev')).not.toBeInTheDocument()
    // 表头 1 行 + DataTable 默认 5 行骨架
    expect(screen.getAllByRole('row')).toHaveLength(6)
  })

  it('名册为空时展示空态', () => {
    mocks.useOrganizationMembers.mockReturnValue(membersQuery({ data: [] }))

    render(<OrganizationSettingsPage />)

    expect(screen.getByText('暂无成员')).toBeInTheDocument()
  })

  it('名册加载失败时展示错误态并可重试', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    mocks.useOrganizationMembers.mockReturnValue(
      membersQuery({ data: undefined, isError: true, refetch }),
    )

    render(<OrganizationSettingsPage />)

    expect(screen.getByText('成员名册加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('非 owner/admin 隐藏邀请入口与成员名册', () => {
    mocks.role.mockReturnValue('creator')

    render(<OrganizationSettingsPage />)

    expect(screen.queryByRole('button', { name: /邀请成员/ })).not.toBeInTheDocument()
    expect(screen.getByText('无权查看成员名册')).toBeInTheDocument()
    expect(screen.queryByText('owner@acme.dev')).not.toBeInTheDocument()
  })

  it('点击邀请成员打开邀请对话框', async () => {
    const user = userEvent.setup()

    render(<OrganizationSettingsPage />)

    await user.click(screen.getByRole('button', { name: /邀请成员/ }))

    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent('邀请成员'),
    )
  })
})
