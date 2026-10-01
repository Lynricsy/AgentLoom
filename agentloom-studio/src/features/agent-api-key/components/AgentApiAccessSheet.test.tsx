import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentApiAccessSheet } from './AgentApiAccessSheet'
import type { AgentApiKey } from '../types'
import type * as ClientModule from '@/shared/api/client'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  useAuthToken: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { get: mocks.get, delete: mocks.delete },
}))

vi.mock('@/features/auth', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
    'base64url',
  )
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

const activeKey: AgentApiKey = {
  id: 'key-1',
  agentDefinitionId: 'agent-1',
  name: 'crm-integration',
  keyPrefix: 'alak_1a2b3c4d',
  rateLimitPerMinute: 60,
  maxConcurrentRuns: 5,
  lastUsedAt: '2026-10-01T09:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
}

function renderSheet(
  ui: ReactElement = (
    <AgentApiAccessSheet
      agentId="agent-1"
      agentStatus="published"
      open
      onOpenChange={vi.fn()}
    />
  ),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('AgentApiAccessSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          data: [activeKey],
          meta: { page: 1, pageSize: 20, total: 1 },
        }),
    })
    mocks.delete.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it('admin 确认吊销后才向当前 Agent 发出 DELETE', async () => {
    mocks.useAuthToken.mockReturnValue(createToken({ tenant_role: 'admin' }))
    const user = userEvent.setup()
    renderSheet()

    await user.click(await screen.findByRole('button', { name: '吊销 crm-integration' }))

    const confirmDialog = await screen.findByRole('alertdialog')
    expect(mocks.delete).not.toHaveBeenCalled()

    await user.click(within(confirmDialog).getByRole('button', { name: '确认吊销' }))

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith(
        'agent-definitions/agent-1/api-keys/key-1',
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('取消吊销不会发请求', async () => {
    mocks.useAuthToken.mockReturnValue(createToken({ tenant_role: 'owner' }))
    const user = userEvent.setup()
    renderSheet()

    await user.click(await screen.findByRole('button', { name: '吊销 crm-integration' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: '取消',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('creator 只能查看列表，没有创建与吊销入口', async () => {
    mocks.useAuthToken.mockReturnValue(createToken({ tenant_role: 'creator' }))
    renderSheet()

    expect(await screen.findByText('crm-integration')).toBeInTheDocument()
    expect(screen.getByTestId('agent-api-key-readonly-notice')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /创建 Key/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /吊销/ })).not.toBeInTheDocument()
  })

  it('未发布的 Agent 提示外部调用会被拒绝', async () => {
    mocks.useAuthToken.mockReturnValue(createToken({ tenant_role: 'admin' }))
    renderSheet(
      <AgentApiAccessSheet agentId="agent-1" agentStatus="draft" open onOpenChange={vi.fn()} />,
    )

    expect(await screen.findByTestId('agent-api-unpublished-notice')).toHaveTextContent(
      'agent-not-published',
    )
  })
})
