import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiTokenCreateDialog } from './ApiTokenCreateDialog'

const mocks = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('../api/platformApiTokenQueries', () => ({
  useCreatePlatformApiToken: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

const createdToken = {
  id: 'tok-1',
  name: 'CI 部署流水线',
  tokenPrefix: 'al_9f31c02a',
  scopes: null,
  lastUsedAt: null,
  expiresAt: null,
  isRevoked: false,
  createdAt: '2026-08-11T09:00:00.000Z',
  token: 'al_9f31c02a7e5b4d1c8a3f6021bd47ee90',
}

/** 对话框由父级控制开合，用它复现「关闭 → 重开」的真实流程 */
function Harness() {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        重新打开
      </button>
      <ApiTokenCreateDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
    writable: true,
  })
}

describe('ApiTokenCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMutateAsync.mockResolvedValue(createdToken)
  })

  it('名称为空时阻止提交并给出行内错误', async () => {
    const user = userEvent.setup()
    render(<ApiTokenCreateDialog open onOpenChange={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: '创建 Token' }))

    expect(await screen.findByText('请填写 Token 名称')).toBeInTheDocument()
    expect(mocks.createMutateAsync).not.toHaveBeenCalled()
  })

  it('把过期时间提交为 ISO 字符串，空作用域不下发', async () => {
    const user = userEvent.setup()
    render(<ApiTokenCreateDialog open onOpenChange={vi.fn()} />)

    await user.type(await screen.findByLabelText('名称'), 'CI 部署流水线')
    fireEvent.change(screen.getByLabelText(/过期时间/), {
      target: { value: '2026-12-31T10:00' },
    })
    await user.click(screen.getByRole('button', { name: '创建 Token' }))

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({
        name: 'CI 部署流水线',
        scopes: undefined,
        expiresAt: new Date('2026-12-31T10:00').toISOString(),
      })
    })
  })

  it('创建成功后展示明文 Token 并警示不会再次显示', async () => {
    const user = userEvent.setup()
    render(<ApiTokenCreateDialog open onOpenChange={vi.fn()} />)

    await user.type(await screen.findByLabelText('名称'), 'CI 部署流水线')
    await user.click(screen.getByRole('button', { name: '创建 Token' }))

    expect(await screen.findByTestId('api-token-plaintext')).toHaveTextContent(
      createdToken.token,
    )
    expect(
      screen.getByText(/关闭后不会再次显示，遗失只能撤销后重新创建/),
    ).toBeInTheDocument()
  })

  it('明文 Token 只展示一次，关闭后重开回到表单', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(await screen.findByLabelText('名称'), 'CI 部署流水线')
    await user.click(screen.getByRole('button', { name: '创建 Token' }))
    await screen.findByTestId('api-token-plaintext')

    await user.click(screen.getByRole('button', { name: '我已保存' }))
    await waitFor(() => {
      expect(screen.queryByTestId('api-token-plaintext')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '重新打开' }))

    expect(await screen.findByLabelText('名称')).toHaveValue('')
    expect(screen.queryByTestId('api-token-plaintext')).not.toBeInTheDocument()
    expect(screen.queryByText(createdToken.token)).not.toBeInTheDocument()
  })

  it('复制按钮写入剪贴板', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    render(<ApiTokenCreateDialog open onOpenChange={vi.fn()} />)

    await user.type(await screen.findByLabelText('名称'), 'CI 部署流水线')
    await user.click(screen.getByRole('button', { name: '创建 Token' }))
    await screen.findByTestId('api-token-plaintext')

    await user.click(screen.getByRole('button', { name: '复制 Token' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(createdToken.token)
    })
  })

  it('剪贴板不可用时降级为选中文本并提示手动复制', async () => {
    const user = userEvent.setup()
    render(<ApiTokenCreateDialog open onOpenChange={vi.fn()} />)

    await user.type(await screen.findByLabelText('名称'), 'CI 部署流水线')
    await user.click(screen.getByRole('button', { name: '创建 Token' }))
    await screen.findByTestId('api-token-plaintext')

    // userEvent.setup() 会注入 clipboard stub，这里在点击前移除以复现不可用环境
    stubClipboard(undefined)
    await user.click(screen.getByRole('button', { name: '复制 Token' }))

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'warning', title: '无法自动复制' }),
      )
    })
  })
})
