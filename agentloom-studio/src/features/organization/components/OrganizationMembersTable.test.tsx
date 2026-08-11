import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHttpError } from '../testing/makeHttpError'
import type { OrganizationMember } from '../types'

const mocks = vi.hoisted(() => ({
  updateRole: vi.fn(),
  remove: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('../api/organizationQueries', () => ({
  useUpdateOrganizationMemberRole: () => ({
    mutateAsync: mocks.updateRole,
    isPending: false,
  }),
  useRemoveOrganizationMember: () => ({
    mutateAsync: mocks.remove,
    isPending: false,
  }),
}))

import { OrganizationMembersTable } from './OrganizationMembersTable'

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
    displayName: '开发者',
    role: 'creator',
    createdAt: '2026-02-11T08:30:00.000Z',
  },
]

function renderTable(overrides: Partial<Parameters<typeof OrganizationMembersTable>[0]> = {}) {
  return render(
    <OrganizationMembersTable
      organizationId="org-1"
      members={members}
      loading={false}
      isError={false}
      onRetry={vi.fn()}
      canManage
      {...overrides}
    />,
  )
}

describe('OrganizationMembersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('只读模式下角色渲染为徽章且没有移除入口', () => {
    renderTable({ canManage: false })

    expect(screen.getByText('所有者')).toBeInTheDocument()
    expect(screen.queryByLabelText('owner@acme.dev 的角色')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '移除 dev@acme.dev' }),
    ).not.toBeInTheDocument()
  })

  it('切换角色后提交新角色并提示成功', async () => {
    const user = userEvent.setup()
    mocks.updateRole.mockResolvedValue({})

    renderTable()

    await user.click(screen.getByLabelText('dev@acme.dev 的角色'))
    await user.click(await screen.findByRole('option', { name: '操作员' }))

    await waitFor(() =>
      expect(mocks.updateRole).toHaveBeenCalledWith({
        userId: 'user-2',
        role: 'operator',
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '角色已更新', variant: 'success' }),
    )
  })

  it('角色变更失败时透出服务端文案', async () => {
    const user = userEvent.setup()
    mocks.updateRole.mockRejectedValue(
      makeHttpError(409, { detail: '不能移除唯一的所有者' }),
    )

    renderTable()

    await user.click(screen.getByLabelText('owner@acme.dev 的角色'))
    await user.click(await screen.findByRole('option', { name: '访客' }))

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '角色更新失败',
          description: '不能移除唯一的所有者',
          variant: 'error',
        }),
      ),
    )
  })

  it('移除成员需二次确认后才发请求', async () => {
    const user = userEvent.setup()
    mocks.remove.mockResolvedValue(undefined)

    renderTable()

    await user.click(screen.getByRole('button', { name: '移除 dev@acme.dev' }))

    expect(await screen.findByText('移除成员')).toBeInTheDocument()
    expect(mocks.remove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '移除' }))

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('user-2'))
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '成员已移除', variant: 'success' }),
    )
  })

  it('唯一所有者不可移除的 409 以 toast 呈现', async () => {
    const user = userEvent.setup()
    mocks.remove.mockRejectedValue(
      makeHttpError(409, { detail: '不能移除唯一的所有者' }),
    )

    renderTable()

    await user.click(screen.getByRole('button', { name: '移除 owner@acme.dev' }))
    await user.click(await screen.findByRole('button', { name: '移除' }))

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '移除失败',
          description: '不能移除唯一的所有者',
          variant: 'error',
        }),
      ),
    )
  })

  it('加载失败时展示错误态并可重试', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    renderTable({ members: [], isError: true, onRetry })

    expect(screen.getByText('成员名册加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
