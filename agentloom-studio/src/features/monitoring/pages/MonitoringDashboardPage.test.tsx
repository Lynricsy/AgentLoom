import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MonitoringDashboardPage } from './MonitoringDashboardPage'
import type {
  MonitoringDashboard,
  MonitoringMetricSources,
  MonitoringWindow,
} from '../types/monitoring'

const mocks = vi.hoisted(() => ({
  useAuthToken: vi.fn(),
  useMonitoringDashboard: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('../hooks/useMonitoringDashboard', () => ({
  useMonitoringDashboard: mocks.useMonitoringDashboard,
}))

vi.mock('@/features/routing-decision', () => ({
  RoutingDecisionsPanel: () => <div data-testid="mock-routing-decisions-panel" />,
}))

vi.mock('@/features/optimization-suggestion', () => ({
  OptimizationSuggestionsBoard: () => <div data-testid="mock-suggestions-board" />,
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

const sharedMetricSources: MonitoringMetricSources = {
  execution: ['workflow-executions', 'execution-records', 'derived'],
  governance: ['resource-governance'],
  alerts: ['notifications', 'audit-logs'],
  queueDepth: ['execution-queue'],
}

function createDashboard(window: MonitoringWindow): MonitoringDashboard {
  return {
    summary: {
      scope: 'organization',
      window,
      lastUpdatedAt: '2026-03-18T05:30:00.000Z',
      executionCount: window === '24h' ? 480 : window === '15m' ? 18 : 96,
      successRate: window === '24h' ? 94.2 : window === '15m' ? 96.8 : 95.1,
      failureRate: window === '24h' ? 5.8 : window === '15m' ? 3.2 : 4.9,
      averageDurationMs: window === '24h' ? 84_000 : 31_000,
      queueDepth: window === '24h' ? 18 : 6,
      governanceBlocks: window === '24h' ? 12 : 3,
      activeAlerts: window === '24h' ? 3 : 1,
      metricSources: sharedMetricSources,
    },
    trend: [
      {
        bucketStart: '2026-03-18T05:00:00.000Z',
        bucketLabel: window,
        executionCount: window === '24h' ? 140 : 24,
        successRate: 95,
        failureRate: 5,
        averageDurationMs: 28_000,
        queueDepth: null,
        governanceBlocks: window === '24h' ? 4 : 1,
        activeAlerts: window === '24h' ? 2 : 1,
      },
    ],
    alerts: [
      {
        id: `alert-${window}`,
        severity: window === '24h' ? 'critical' : 'warning',
        category: 'governance-block',
        title: `治理阻止峰值 · ${window}`,
        reason: '治理阻止次数连续攀升，需要排查是否存在配额或暂停策略误伤。',
        detectedAt: '2026-03-18T05:00:00.000Z',
        affectedSummary: '影响 2 个工作流，3 个新执行被拦截',
        source: 'resource-governance',
        linkTarget: { type: 'resource-governance', href: '/settings/resource-quotas' },
      },
      {
        id: `execution-${window}`,
        severity: 'critical',
        category: 'anomalous-execution',
        title: `异常执行 · ${window}`,
        reason: '某执行在当前窗口内反复失败，需要进入只读执行详情进一步定位。',
        detectedAt: '2026-03-18T05:10:00.000Z',
        affectedSummary: 'execution 123e4567-e89b-42d3-a456-426614174099',
        source: 'notifications',
        linkTarget: {
          type: 'execution',
          href: '/executions/123e4567-e89b-42d3-a456-426614174099',
        },
      },
    ],
    hotspots: [
      {
        id: `hotspot-workflow-${window}`,
        kind: 'workflow',
        label: `工作流热点 · ${window}`,
        impactSummary: '该工作流在当前窗口内出现明显排队压力与治理阻止。',
        executionCount: window === '24h' ? 160 : 24,
        failureRate: 12.4,
        queueDepth: 9,
        status: 'governance-paused',
        lastSeenAt: '2026-03-18T05:20:00.000Z',
        linkTarget: { type: 'resource-governance', href: '/settings/resource-quotas' },
      },
      {
        id: `hotspot-execution-${window}`,
        kind: 'execution',
        label: `执行热点 · ${window}`,
        impactSummary: '该执行仍处于人工介入链路，需要结合 execution paused 语义查看。',
        executionCount: 1,
        failureRate: null,
        queueDepth: null,
        status: 'paused',
        lastSeenAt: '2026-03-18T05:21:00.000Z',
        linkTarget: {
          type: 'execution',
          href: '/executions/123e4567-e89b-42d3-a456-426614174099',
        },
      },
    ],
    riskSummary: {
      level: window === '24h' ? 'critical' : 'warning',
      title: `风险摘要 · ${window}`,
      summary: '治理阻止与排队深度同时抬升，建议先查看资源治理设置，再审查异常执行详情。',
      explanation:
        '风险摘要来自 execution records、治理状态与结构化通知的只读聚合，不会在此页直接执行治理操作。',
      governancePauseActive: true,
      lastEvaluatedAt: '2026-03-18T05:25:00.000Z',
      primaryLinkTarget: { type: 'resource-governance', href: '/settings/resource-quotas' },
    },
  }
}

const ownerToken = createToken({ tenantRole: 'owner', organizationId: 'org-1', tenantId: 'tenant-1' })
const adminToken = createToken({ tenantRole: 'admin', organizationId: 'org-1', tenantId: 'tenant-1' })
const creatorToken = createToken({ tenantRole: 'creator', organizationId: 'org-1' })
const ownerWithoutOrgToken = createToken({ tenantRole: 'owner' })

describe('MonitoringDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.useAuthToken.mockReturnValue(ownerToken)
    mocks.useMonitoringDashboard.mockImplementation((_organizationId, window) => ({
      data: createDashboard(window),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    }))
  })

  it('shows a forbidden state for direct non-owner/admin access', () => {
    mocks.useAuthToken.mockReturnValue(creatorToken)

    render(<MonitoringDashboardPage />)

    expect(screen.getByTestId('monitoring-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问监控仪表板')).toBeInTheDocument()
    expect(screen.getByText(/当前组织角色为 creator/)).toBeInTheDocument()
    expect(mocks.useMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('shows a missing-organization state when the owner token has no org claim', () => {
    mocks.useAuthToken.mockReturnValue(ownerWithoutOrgToken)

    render(<MonitoringDashboardPage />)

    expect(screen.getByTestId('monitoring-missing-org')).toBeInTheDocument()
    expect(screen.getByText('无法识别当前组织')).toBeInTheDocument()
    expect(mocks.useMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('renders content for admin users and keeps the page read-only', () => {
    mocks.useAuthToken.mockReturnValue(adminToken)

    render(<MonitoringDashboardPage />)

    expect(screen.getByTestId('monitoring-page')).toBeInTheDocument()
    expect(screen.getByText('只读监控')).toBeInTheDocument()
    expect(screen.getAllByText(/治理暂停只会阻止新的执行进入/).length).toBeGreaterThan(0)
    expect(
      screen
        .getAllByRole('link', { name: '前往资源治理设置' })
        .every((link) => link.getAttribute('href') === '/settings/resource-quotas'),
    ).toBe(true)
    expect(screen.queryByRole('button', { name: '保存配额' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '终止异常执行' })).not.toBeInTheDocument()
  })

  it('renders loading, error, and empty states for the current window', () => {
    mocks.useMonitoringDashboard.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
    })

    const { rerender } = render(<MonitoringDashboardPage />)
    expect(screen.getByTestId('monitoring-loading-state')).toBeInTheDocument()

    mocks.useMonitoringDashboard.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('monitoring unavailable'),
      isFetching: false,
    })
    rerender(<MonitoringDashboardPage />)
    expect(screen.getByTestId('monitoring-error-state')).toHaveTextContent('monitoring unavailable')

    mocks.useMonitoringDashboard.mockReturnValueOnce({
      data: {
        summary: {
          ...createDashboard('1h').summary,
          executionCount: 0,
          governanceBlocks: 0,
          activeAlerts: 0,
        },
        trend: [],
        alerts: [],
        hotspots: [],
        riskSummary: {
          ...createDashboard('1h').riskSummary,
          governancePauseActive: false,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    })
    rerender(<MonitoringDashboardPage />)

    expect(screen.getByTestId('monitoring-empty-state')).toBeInTheDocument()
    expect(
      screen.getByText(/内还没有可展示的执行趋势、告警或热点对象/),
    ).toBeInTheDocument()
  })

  it('switches monitoring windows and refreshes the rendered labels and data set', async () => {
    const user = userEvent.setup()

    render(<MonitoringDashboardPage />)

    expect(mocks.useMonitoringDashboard).toHaveBeenLastCalledWith('org-1', '1h')
    expect(screen.getByText('治理阻止峰值 · 1h')).toBeInTheDocument()
    expect(screen.getByText('执行趋势（最近 1 小时）')).toBeInTheDocument()
    expect(
      screen.getByText(/队列深度仍然会出现在摘要卡片、告警与热点中，但只代表当前 queue snapshot/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '24h' }))

    expect(mocks.useMonitoringDashboard).toHaveBeenLastCalledWith('org-1', '24h')
    expect(screen.getByText('治理阻止峰值 · 24h')).toBeInTheDocument()
    expect(screen.getByText('执行趋势（最近 24 小时）')).toBeInTheDocument()
    expect(screen.queryByText('治理阻止峰值 · 1h')).not.toBeInTheDocument()
  })

  it('renders risk and alert deep links for governance and execution drill-down', () => {
    render(<MonitoringDashboardPage />)

    const resourceLinks = screen.getAllByRole('link', { name: '前往资源治理设置' })
    expect(resourceLinks[0]).toHaveAttribute('href', '/settings/resource-quotas')
    expect(resourceLinks[1]).toHaveAttribute('href', '/settings/resource-quotas')

    const executionLinks = screen.getAllByRole('link', { name: '查看执行详情' })
    expect(executionLinks[0]).toHaveAttribute(
      'href',
      '/executions/123e4567-e89b-42d3-a456-426614174099',
    )

    expect(screen.getByText('execution paused（人工介入）')).toBeInTheDocument()
  })

  it('在概览 / 路由决策 / 优化建议三个 tab 间切换', async () => {
    const user = userEvent.setup()

    render(<MonitoringDashboardPage />)

    expect(screen.getByTestId('monitoring-overview')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-routing-decisions-panel')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('monitoring-tab-routing'))
    expect(screen.getByTestId('monitoring-routing-tab')).toBeInTheDocument()
    expect(screen.getByTestId('mock-routing-decisions-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('monitoring-overview')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('monitoring-tab-suggestions'))
    expect(screen.getByTestId('mock-suggestions-board')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-routing-decisions-panel')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('monitoring-tab-overview'))
    expect(screen.getByTestId('monitoring-overview')).toBeInTheDocument()
  })

  it('切换 tab 后保留已选择的时间窗口', async () => {
    const user = userEvent.setup()

    render(<MonitoringDashboardPage />)

    await user.click(screen.getByTestId('monitoring-window-24h'))
    await user.click(screen.getByTestId('monitoring-tab-routing'))
    await user.click(screen.getByTestId('monitoring-tab-overview'))

    expect(screen.getByTestId('monitoring-window-24h')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
