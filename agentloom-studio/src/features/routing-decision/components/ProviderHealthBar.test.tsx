import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderHealthBar } from './ProviderHealthBar'
import type { ProviderHealthRecord } from '@/features/smart-routing'

const mocks = vi.hoisted(() => ({
  useProviderHealth: vi.fn(),
}))

vi.mock('@/features/smart-routing', () => ({
  useProviderHealth: mocks.useProviderHealth,
}))

function healthQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

const statuses: ProviderHealthRecord[] = [
  {
    providerName: 'openai',
    modelId: null,
    status: 'healthy',
    failureCount: 0,
    lastFailureAt: null,
  },
  {
    providerName: 'anthropic',
    modelId: 'claude-sonnet',
    status: 'open',
    failureCount: 5,
    lastFailureAt: '2026-03-10T10:00:00.000Z',
  },
]

describe('ProviderHealthBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('加载中渲染骨架占位', () => {
    mocks.useProviderHealth.mockReturnValue(healthQuery({ isLoading: true }))
    render(<ProviderHealthBar />)

    expect(screen.getByTestId('provider-health-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('provider-health-list')).not.toBeInTheDocument()
  })

  it('失败时渲染错误原因', () => {
    mocks.useProviderHealth.mockReturnValue(
      healthQuery({ isError: true, error: new Error('health down') }),
    )
    render(<ProviderHealthBar />)

    expect(screen.getByTestId('provider-health-error')).toHaveTextContent('health down')
  })

  it('无熔断记录时给出解释性空态', () => {
    mocks.useProviderHealth.mockReturnValue(healthQuery({ data: [] }))
    render(<ProviderHealthBar />)

    expect(screen.getByTestId('provider-health-empty')).toBeInTheDocument()
  })

  it('渲染提供商状态与失败次数', () => {
    mocks.useProviderHealth.mockReturnValue(healthQuery({ data: statuses }))
    render(<ProviderHealthBar />)

    const list = screen.getByTestId('provider-health-list')
    expect(list).toHaveTextContent('openai')
    expect(list).toHaveTextContent('正常')
    expect(list).toHaveTextContent('claude-sonnet')
    expect(list).toHaveTextContent('熔断')
    expect(list).toHaveTextContent('失败 5 次')
  })
})
