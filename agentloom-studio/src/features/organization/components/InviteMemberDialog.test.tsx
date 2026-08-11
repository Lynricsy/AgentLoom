import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invite: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('../api/organizationQueries', () => ({
  useInviteOrganizationMember: () => ({
    mutateAsync: mocks.invite,
    isPending: false,
  }),
}))

import { makeHttpError } from '../testing/makeHttpError'
import { InviteMemberDialog } from './InviteMemberDialog'

describe('InviteMemberDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('邮箱格式非法时内联报错且不发请求', async () => {
    const user = userEvent.setup()
    render(
      <InviteMemberDialog
        organizationId="org-1"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('邮箱'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: '发送邀请' }))

    expect(await screen.findByText('请输入有效的邮箱地址。')).toBeInTheDocument()
    expect(mocks.invite).not.toHaveBeenCalled()
  })

  it('邀请成功后提示并关闭对话框', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mocks.invite.mockResolvedValue({ id: 'inv-1' })

    render(
      <InviteMemberDialog
        organizationId="org-1"
        open
        onOpenChange={onOpenChange}
      />,
    )

    await user.type(screen.getByLabelText('邮箱'), 'new@acme.dev')

    await user.click(screen.getByLabelText('邀请角色'))
    await user.click(await screen.findByText('管理员'))

    await user.click(screen.getByRole('button', { name: '发送邀请' }))

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith({
        email: 'new@acme.dev',
        role: 'admin',
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '邀请已发送', variant: 'success' }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('默认角色为访客', async () => {
    const user = userEvent.setup()
    mocks.invite.mockResolvedValue({ id: 'inv-2' })

    render(
      <InviteMemberDialog organizationId="org-1" open onOpenChange={vi.fn()} />,
    )

    expect(screen.getByLabelText('邀请角色')).toHaveTextContent('访客')

    await user.type(screen.getByLabelText('邮箱'), 'viewer@acme.dev')
    await user.click(screen.getByRole('button', { name: '发送邀请' }))

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith({
        email: 'viewer@acme.dev',
        role: 'viewer',
      }),
    )
  })

  it('邀请失败时展示服务端文案且不关闭对话框', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mocks.invite.mockRejectedValue(
      makeHttpError(409, { detail: '该邮箱已有待处理邀请' }),
    )

    render(
      <InviteMemberDialog
        organizationId="org-1"
        open
        onOpenChange={onOpenChange}
      />,
    )

    await user.type(screen.getByLabelText('邮箱'), 'dup@acme.dev')
    await user.click(screen.getByRole('button', { name: '发送邀请' }))

    expect(await screen.findByText('该邮箱已有待处理邀请')).toBeInTheDocument()
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '邀请失败',
        description: '该邮箱已有待处理邀请',
        variant: 'error',
      }),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
