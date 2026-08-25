import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginUsagePage } from './PluginUsagePage'
import type { PluginUsageRecord } from '../types'
import type { PluginUsageSearch } from '../lib/usageSearch'

const mocks = vi.hoisted(() => ({
  usePluginById: vi.fn(),
  usePluginUsage: vi.fn(),
  usePluginUsageSummary: vi.fn(),
}))

vi.mock('../api/pluginQueries', () => ({
  usePluginById: (...args: unknown[]) => mocks.usePluginById(...args),
  usePluginUsage: (...args: unknown[]) => mocks.usePluginUsage(...args),
  usePluginUsageSummary: (...args: unknown[]) =>
    mocks.usePluginUsageSummary(...args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const SEARCH: PluginUsageSearch = {
  page: 1,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-25',
}

function makeRecord(overrides: Partial<PluginUsageRecord> = {}): PluginUsageRecord {
  return {
    id: 'usage-1',
    pluginId: 'com.example.translate',
    executionId: 'exec-9001',
    stepId: 'step-3',
    billingAmount: '0.02000000',
    currency: 'USD',
    executionDurationMs: '1450',
    sourceListingId: 'listing-1',
    metadata: null,
    createdAt: '2026-08-20T08:30:00.000Z',
    ...overrides,
  }
}

function renderPage(search: PluginUsageSearch = SEARCH) {
  const onSearchChange = vi.fn()
  const onPageChange = vi.fn()

  render(
    <PluginUsagePage
      pluginDbId="plugin-db-1"
      search={search}
      onSearchChange={onSearchChange}
      onPageChange={onPageChange}
    />,
  )

  return { onSearchChange, onPageChange }
}

describe('PluginUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.usePluginById.mockReturnValue({
      data: { data: { name: '翻译插件' } },
      isLoading: false,
      isError: false,
    })
    mocks.usePluginUsageSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    })
    mocks.usePluginUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
  })

  it('把解析后的周期转换成闭区间 ISO 传给两个查询', () => {
    renderPage()

    expect(mocks.usePluginUsageSummary).toHaveBeenCalledWith('plugin-db-1', {
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-25T23:59:59.999Z',
    })
    expect(mocks.usePluginUsage).toHaveBeenCalledWith('plugin-db-1', {
      page: 1,
      pageSize: 20,
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-25T23:59:59.999Z',
    })
  })

  it('汇总加载中显示骨架而不是零值', () => {
    mocks.usePluginUsageSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    renderPage()

    const summary = screen.getByTestId('plugin-usage-summary')
    expect(summary).toBeInTheDocument()
    expect(within(summary).queryByText('0')).not.toBeInTheDocument()
  })

  it('渲染汇总卡的执行次数、计费金额与平均耗时', () => {
    mocks.usePluginUsageSummary.mockReturnValue({
      data: {
        data: {
          totalExecutions: 1240,
          totalBillingAmount: '24.80000000',
          avgDurationMs: 1450.5,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-08-25T23:59:59.999Z',
        },
      },
      isLoading: false,
      isError: false,
    })

    renderPage()

    const summary = screen.getByTestId('plugin-usage-summary')
    expect(within(summary).getByText('1,240')).toBeInTheDocument()
    expect(within(summary).getByText('$24.80')).toBeInTheDocument()
    expect(within(summary).getByText('1.45 s')).toBeInTheDocument()
  })

  it('免费插件的汇总金额显示为免费', () => {
    mocks.usePluginUsageSummary.mockReturnValue({
      data: {
        data: {
          totalExecutions: 12,
          totalBillingAmount: null,
          avgDurationMs: null,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-08-25T23:59:59.999Z',
        },
      },
      isLoading: false,
      isError: false,
    })

    renderPage()

    const summary = screen.getByTestId('plugin-usage-summary')
    expect(within(summary).getByText('免费')).toBeInTheDocument()
    expect(within(summary).getByText('—')).toBeInTheDocument()
  })

  it('渲染流水行的时间、执行、耗时、金额与来源 listing', () => {
    mocks.usePluginUsageSummary.mockReturnValue({
      data: {
        data: {
          totalExecutions: 2,
          totalBillingAmount: '0.02000000',
          avgDurationMs: 1450,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-08-25T23:59:59.999Z',
        },
      },
      isLoading: false,
      isError: false,
    })
    mocks.usePluginUsage.mockReturnValue({
      data: {
        data: [makeRecord(), makeRecord({ id: 'usage-2', billingAmount: null })],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getAllByText('exec-9001')).toHaveLength(2)
    expect(screen.getAllByText('$0.02')).toHaveLength(2)
    expect(screen.getByText('免费')).toBeInTheDocument()
    expect(screen.getAllByText('1.45 s')).toHaveLength(3)
    expect(screen.getAllByText('listing-1')).toHaveLength(2)
  })

  it('周期内无记录时渲染引导式空态', () => {
    mocks.usePluginUsage.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByText('该周期内没有用量记录')).toBeInTheDocument()
  })

  it('流水加载中不渲染空态', () => {
    mocks.usePluginUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.queryByText('该周期内没有用量记录')).not.toBeInTheDocument()
  })

  it('改日期区间回写 search params 并重置到第一页', () => {
    const { onSearchChange } = renderPage()

    fireEvent.change(screen.getByTestId('usage-period-start'), {
      target: { value: '2026-07-01' },
    })

    expect(onSearchChange).toHaveBeenCalledWith({ periodStart: '2026-07-01' })
  })
})
