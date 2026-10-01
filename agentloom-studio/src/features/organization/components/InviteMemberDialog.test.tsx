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
    await user.click(screen.getByRole('button', { name: '生成邀请链接' }))

    expect(await screen.findByText('请输入有效的邮箱地址。')).toBeInTheDocument()
    expect(mocks.invite).not.toHaveBeenCalled()
  })

  it('邀请创建后展示可复制的邀请链接，提示「邀请已创建」且不再声称已发送邮件', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    mocks.invite.mockResolvedValue({ id: 'inv-1', token: 'tok-abc' })

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

    await user.click(screen.getByRole('button', { name: '生成邀请链接' }))

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith({
        email: 'new@acme.dev',
        role: 'admin',
      }),
    )
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '邀请已创建', variant: 'success' }),
    )
    expect(mocks.notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: '邀请已发送' }),
    )

    const link = `${window.location.origin}/invitations/tok-abc`
    expect(await screen.findByLabelText('邀请链接')).toHaveValue(link)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: '复制链接' }))
    expect(writeText).toHaveBeenCalledWith(link)
  })

  it('默认角色为访客', async () => {
    const user = userEvent.setup()
    mocks.invite.mockResolvedValue({ id: 'inv-2', token: 'tok-2' })

    render(
      <InviteMemberDialog organizationId="org-1" open onOpenChange={vi.fn()} />,
    )

    expect(screen.getByLabelText('邀请角色')).toHaveTextContent('访客')

    await user.type(screen.getByLabelText('邮箱'), 'viewer@acme.dev')
    await user.click(screen.getByRole('button', { name: '生成邀请链接' }))

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
    await user.click(screen.getByRole('button', { name: '生成邀请链接' }))

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
