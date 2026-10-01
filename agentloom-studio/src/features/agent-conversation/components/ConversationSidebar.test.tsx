import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationSidebar } from './ConversationSidebar'
import type { ConversationListItem } from '../api/conversationApi'
import type * as ClientModule from '@/shared/api/client'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { get: mocks.get },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/shared/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}))

vi.mock('../stores/agent-conversation.store', () => ({
  useTitleUpdateCounter: () => 0,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

function conversation(
  overrides: Partial<ConversationListItem> & Pick<ConversationListItem, 'id' | 'title' | 'source'>,
): ConversationListItem {
  return {
    agentDefinitionId: 'agent-1',
    status: 'active',
    metadata: {},
    createdBy: null,
    apiKeyId: null,
    externalUserId: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  }
}

const studioConversation = conversation({
  id: 'conv-studio',
  title: '季度复盘',
  source: 'studio',
})
const apiConversation = conversation({
  id: 'conv-api',
  title: '订单发货咨询',
  source: 'api',
  apiKeyId: 'key-1',
  externalUserId: 'user-1024',
})

function respondWith(items: ConversationListItem[]) {
  return {
    json: () =>
      Promise.resolve({
        data: items,
        meta: { page: 1, limit: 50, total: items.length },
      }),
  }
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationSidebar agentId="agent-1" />
    </QueryClientProvider>,
  )
}

describe('ConversationSidebar 来源筛选', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation(
      (_path: string, options: { searchParams: Record<string, string> }) =>
        respondWith(
          options.searchParams.source === 'api'
            ? [apiConversation]
            : [studioConversation, apiConversation],
        ),
    )
  })

  it('默认不带 source，API 来源的对话显示 API 徽标', async () => {
    renderSidebar()

    expect(await screen.findByText('订单发货咨询')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenLastCalledWith('agent-definitions/agent-1/conversations', {
      searchParams: { limit: '50' },
    })

    const badges = screen.getAllByTestId('conversation-source-api-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]?.closest('li')).toHaveTextContent('订单发货咨询')
  })

  it('选择 API 后按 source=api 请求列表', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await screen.findByText('季度复盘')
    await user.click(screen.getByRole('button', { name: 'API' }))

    expect(screen.getByRole('button', { name: 'API' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => {
      expect(mocks.get).toHaveBeenLastCalledWith(
        'agent-definitions/agent-1/conversations',
        { searchParams: { limit: '50', source: 'api' } },
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('季度复盘')).not.toBeInTheDocument()
    })
  })
})
