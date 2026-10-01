import { useState, type ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentApiKeyCreateDialog } from './AgentApiKeyCreateDialog'
import type { CreatedAgentApiKey } from '../types'
import type * as ClientModule from '@/shared/api/client'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { post: mocks.post },
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

const createdKey: CreatedAgentApiKey = {
  id: 'key-1',
  agentDefinitionId: 'agent-1',
  name: 'CRM 客服机器人',
  keyPrefix: 'alak_1a2b3c4d',
  rateLimitPerMinute: null,
  maxConcurrentRuns: 5,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  key: 'alak_1a2b3c4d9f8e7d6c5b4a39281706f5e4',
}

/** 对话框由父级控制开合，用它复现「关闭 → 重开」的真实流程 */
function Harness() {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        重新打开
      </button>
      <AgentApiKeyCreateDialog agentId="agent-1" open={open} onOpenChange={setOpen} />
    </>
  )
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('AgentApiKeyCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.post.mockReturnValue({
      json: () => Promise.resolve({ data: createdKey }),
    })
  })

  it('按 snake_case 提交到当前 Agent，并默认最大并发 5', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <AgentApiKeyCreateDialog agentId="agent-1" open onOpenChange={vi.fn()} />,
    )

    await user.type(await screen.findByLabelText('名称'), 'CRM 客服机器人')
    await user.type(screen.getByLabelText(/每分钟请求上限/), '60')
    fireEvent.change(screen.getByLabelText(/过期时间/), {
      target: { value: '2099-12-31T10:00' },
    })
    await user.click(screen.getByRole('button', { name: '创建 Key' }))

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('agent-definitions/agent-1/api-keys', {
        json: {
          name: 'CRM 客服机器人',
          rate_limit_per_minute: 60,
          max_concurrent_runs: 5,
          expires_at: new Date('2099-12-31T10:00').toISOString(),
        },
      })
    })
  })

  it('超出服务端范围的限额在本地拦截，不发请求', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <AgentApiKeyCreateDialog agentId="agent-1" open onOpenChange={vi.fn()} />,
    )

    await user.type(await screen.findByLabelText('名称'), 'CRM 客服机器人')
    await user.type(screen.getByLabelText(/每分钟请求上限/), '6001')
    const concurrency = screen.getByLabelText('最大并发 run 数')
    await user.clear(concurrency)
    await user.type(concurrency, '51')
    await user.click(screen.getByRole('button', { name: '创建 Key' }))

    expect(await screen.findByText('请输入 1 到 6000 之间的整数')).toBeInTheDocument()
    expect(screen.getByText('请输入 1 到 50 之间的整数')).toBeInTheDocument()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('明文 Key 只展示一次，关闭后重开回到空表单', async () => {
    const user = userEvent.setup()
    renderWithClient(<Harness />)

    await user.type(await screen.findByLabelText('名称'), 'CRM 客服机器人')
    await user.click(screen.getByRole('button', { name: '创建 Key' }))

    expect(await screen.findByTestId('agent-api-key-plaintext')).toHaveTextContent(
      createdKey.key,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('遗失只能吊销后重新创建')

    await user.click(screen.getByRole('button', { name: '我已保存' }))
    await waitFor(() => {
      expect(screen.queryByTestId('agent-api-key-plaintext')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '重新打开' }))

    expect(await screen.findByLabelText('名称')).toHaveValue('')
    expect(screen.getByLabelText('最大并发 run 数')).toHaveValue(5)
    expect(screen.queryByText(createdKey.key)).not.toBeInTheDocument()
  })
})
