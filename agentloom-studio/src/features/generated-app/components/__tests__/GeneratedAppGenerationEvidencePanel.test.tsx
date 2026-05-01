import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GeneratedAppGateRun,
  GeneratedAppGenerationRun,
  GeneratedAppRepairAttempt,
} from '../../types'

const {
  gateRunsQuery,
  generationRunsQuery,
  repairAttemptsQuery,
  useGeneratedAppGateRunsMock,
  useGeneratedAppGenerationRunsMock,
  useGeneratedAppRepairAttemptsMock,
} = vi.hoisted(() => ({
  gateRunsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  generationRunsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  repairAttemptsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  useGeneratedAppGateRunsMock: vi.fn(),
  useGeneratedAppGenerationRunsMock: vi.fn(),
  useGeneratedAppRepairAttemptsMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useGeneratedAppGateRuns: (appId: string | undefined, params: unknown) => {
    useGeneratedAppGateRunsMock(appId, params)
    return gateRunsQuery
  },
  useGeneratedAppGenerationRuns: (
    appId: string | undefined,
    params: unknown,
  ) => {
    useGeneratedAppGenerationRunsMock(appId, params)
    return generationRunsQuery
  },
  useGeneratedAppRepairAttempts: (
    appId: string | undefined,
    generationRunId: string | undefined,
    params: unknown,
  ) => {
    useGeneratedAppRepairAttemptsMock(appId, generationRunId, params)
    return repairAttemptsQuery
  },
}))

function makeGenerationRun(
  overrides: Partial<GeneratedAppGenerationRun> = {},
): GeneratedAppGenerationRun {
  return {
    id: 'run-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    runNumber: 1,
    status: 'failed',
    triggerSource: 'manual',
    maxRepairAttempts: 3,
    maxRuntimeSeconds: 1800,
    summary: '生成源码并执行 Gate 0-5。',
    failureReason: 'Gate 5 浏览器验收失败。',
    startedAt: '2026-04-25T03:00:00.000Z',
    completedAt: '2026-04-25T03:30:00.000Z',
    createdBy: 'user-1',
    createdAt: '2026-04-25T03:00:00.000Z',
    updatedAt: '2026-04-25T03:30:00.000Z',
    ...overrides,
  }
}

function makeRepairAttempt(
  overrides: Partial<GeneratedAppRepairAttempt> = {},
): GeneratedAppRepairAttempt {
  return {
    id: 'repair-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    generationRunId: 'run-1',
    attemptNumber: 1,
    targetGateId: 'gate-5',
    status: 'completed',
    failureSummary: '移动端提交按钮被报告区域遮挡。',
    changeSummary: '调整移动端布局和提交按钮层级。',
    verificationSummary: 'Playwright 移动端验收重新通过。',
    startedAt: '2026-04-25T03:31:00.000Z',
    completedAt: '2026-04-25T03:40:00.000Z',
    createdBy: 'user-1',
    createdAt: '2026-04-25T03:31:00.000Z',
    updatedAt: '2026-04-25T03:40:00.000Z',
    ...overrides,
  }
}

function makeGateRun(
  overrides: Partial<GeneratedAppGateRun> = {},
): GeneratedAppGateRun {
  return {
    id: 'gate-run-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    generationRunId: 'run-1',
    repairAttemptId: 'repair-1',
    gateId: 'gate-5',
    gateOrder: 5,
    gateName: '浏览器验收门禁',
    blocking: true,
    attemptNumber: 2,
    status: 'failed',
    summary: '公开提交路径移动端失败。',
    evidence: [
      {
        id: 'evidence-browser',
        label: '浏览器验收 trace',
        kind: 'browser',
        url: 'https://internal.example.test/token-sensitive',
        summary: '桌面通过，移动端提交按钮不可点击。',
      },
      {
        id: 'evidence-console',
        label: 'Console log',
        kind: 'test',
        url: null,
        summary: '无 console error，失败来自布局遮挡。',
      },
    ],
    failure: {
      code: 'browser_mobile_blocked',
      message: '移动端主路径未完成。',
    },
    repairInstructions: '调整底部按钮固定区域并重新执行 Gate 5。',
    startedAt: '2026-04-25T03:41:00.000Z',
    completedAt: '2026-04-25T03:45:00.000Z',
    createdBy: 'user-1',
    createdAt: '2026-04-25T03:41:00.000Z',
    updatedAt: '2026-04-25T03:45:00.000Z',
    ...overrides,
  }
}

function makeListData<T>(data: T[]) {
  return {
    data,
    meta: {
      page: 1,
      pageSize: 8,
      total: data.length,
      totalPages: 1,
    },
  }
}

function getLastCall(mockFn: ReturnType<typeof vi.fn>) {
  return mockFn.mock.calls[mockFn.mock.calls.length - 1]
}

const { GeneratedAppGenerationEvidencePanel } =
  await import('../GeneratedAppGenerationEvidencePanel')

describe('GeneratedAppGenerationEvidencePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generationRunsQuery.data = makeListData([
      makeGenerationRun(),
      makeGenerationRun({
        id: 'run-2',
        runNumber: 2,
        status: 'repairing',
        triggerSource: 'retry',
        summary: '针对 Gate 5 失败进行修复。',
        failureReason: null,
      }),
    ])
    generationRunsQuery.isError = false
    generationRunsQuery.isFetching = false
    generationRunsQuery.isLoading = false
    generationRunsQuery.refetch = vi.fn()
    repairAttemptsQuery.data = makeListData([makeRepairAttempt()])
    repairAttemptsQuery.isError = false
    repairAttemptsQuery.isFetching = false
    repairAttemptsQuery.isLoading = false
    repairAttemptsQuery.refetch = vi.fn()
    gateRunsQuery.data = makeListData([makeGateRun()])
    gateRunsQuery.isError = false
    gateRunsQuery.isFetching = false
    gateRunsQuery.isLoading = false
    gateRunsQuery.refetch = vi.fn()
  })

  it('renders generation runs, failure summaries, and evidence summaries without evidence URLs', async () => {
    const user = userEvent.setup()

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    expect(screen.getByText('共 2 次生成运行')).toBeInTheDocument()
    expect(screen.getByText('Run #1')).toBeInTheDocument()
    expect(screen.getByText('手动触发')).toBeInTheDocument()
    expect(screen.getAllByText('3 次修复 / 1800s').length).toBeGreaterThan(0)
    expect(screen.getByText('生成源码并执行 Gate 0-5。')).toBeInTheDocument()
    expect(screen.getByText('Gate 5 浏览器验收失败。')).toBeInTheDocument()
    expect(screen.getAllByText('尚未选中 generation run。')).toHaveLength(2)
    expect(getLastCall(useGeneratedAppRepairAttemptsMock)).toEqual([
      undefined,
      undefined,
      { page: 1, pageSize: 8 },
    ])
    expect(getLastCall(useGeneratedAppGateRunsMock)).toEqual([
      undefined,
      {
        page: 1,
        pageSize: 8,
        generationRunId: undefined,
        repairAttemptId: undefined,
      },
    ])

    await user.click(screen.getByRole('button', { name: '选择 Run #1' }))

    await waitFor(() => {
      expect(screen.getByText('Repair #1')).toBeInTheDocument()
    })

    expect(
      screen.getByText('移动端提交按钮被报告区域遮挡。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('调整移动端布局和提交按钮层级。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Playwright 移动端验收重新通过。'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 条证据')).toBeInTheDocument()
    expect(screen.getByText('浏览器验收 trace')).toBeInTheDocument()
    expect(
      screen.getByText('桌面通过，移动端提交按钮不可点击。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('browser_mobile_blocked: 移动端主路径未完成。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('修复建议：调整底部按钮固定区域并重新执行 Gate 5。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('https://internal.example.test/token-sensitive'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('已定位失败 Gate，尚未应用补丁'),
    ).not.toBeInTheDocument()
  })

  it('highlights automatic failed repair attempts that did not apply a patch', async () => {
    const user = userEvent.setup()
    repairAttemptsQuery.data = makeListData([
      makeRepairAttempt({
        status: 'failed',
        targetGateId: 'gate-3',
        failureSummary:
          'gate-3 构建与单元门禁失败：命令 gate-3-unit-test-command 执行失败。',
        changeSummary:
          '自动修复循环已读取失败证据和修复建议。当前同步 runner 未应用源码、Workflow 或插件补丁，已将该 Gate 标记为下一轮修复目标。',
        verificationSummary:
          '本次修复尝试未形成可执行补丁，gate-3 仍为 failed。',
        completedAt: '2026-04-25T03:40:00.000Z',
      }),
    ])

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '选择 Run #1' }))

    await waitFor(() => {
      expect(
        screen.getByText('已定位失败 Gate，尚未应用补丁'),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/自动修复循环已把 gate-3 标记为下一轮修复目标/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/当前同步 runner 未修改源码、Workflow 或插件/),
    ).toBeInTheDocument()
  })

  it('loads repair attempts and gate runs for the selected generation run', async () => {
    const user = userEvent.setup()

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '选择 Run #2' }))

    await waitFor(() => {
      expect(getLastCall(useGeneratedAppRepairAttemptsMock)).toEqual([
        'app-1',
        'run-2',
        { page: 1, pageSize: 8 },
      ])
      expect(getLastCall(useGeneratedAppGateRunsMock)).toEqual([
        'app-1',
        {
          page: 1,
          pageSize: 8,
          generationRunId: 'run-2',
          repairAttemptId: undefined,
        },
      ])
    })
  })

  it('hides stale scoped data while a newly selected generation run is loading', async () => {
    const user = userEvent.setup()

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '选择 Run #1' }))

    await waitFor(() => {
      expect(screen.getByText('浏览器验收 trace')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '选择 Run #2' }))

    await waitFor(() => {
      expect(getLastCall(useGeneratedAppGateRunsMock)).toEqual([
        'app-1',
        {
          page: 1,
          pageSize: 8,
          generationRunId: 'run-2',
          repairAttemptId: undefined,
        },
      ])
    })
    expect(screen.queryByText('浏览器验收 trace')).not.toBeInTheDocument()
    expect(
      screen.queryByText('桌面通过，移动端提交按钮不可点击。'),
    ).not.toBeInTheDocument()
  })

  it('filters gate runs by the selected repair attempt', async () => {
    const user = userEvent.setup()

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '选择 Run #1' }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '过滤 Repair #1' }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '过滤 Repair #1' }))

    await waitFor(() => {
      expect(getLastCall(useGeneratedAppGateRunsMock)).toEqual([
        'app-1',
        {
          page: 1,
          pageSize: 8,
          generationRunId: 'run-1',
          repairAttemptId: 'repair-1',
        },
      ])
    })
  })

  it('renders empty states for generation runs and gate evidence', () => {
    generationRunsQuery.data = makeListData([])
    repairAttemptsQuery.data = makeListData([])
    gateRunsQuery.data = makeListData([makeGateRun()])

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    expect(screen.getByText('暂无生成运行记录')).toBeInTheDocument()
    expect(screen.getAllByText('尚未选中 generation run。')).toHaveLength(2)
    expect(getLastCall(useGeneratedAppGateRunsMock)).toEqual([
      undefined,
      {
        page: 1,
        pageSize: 8,
        generationRunId: undefined,
        repairAttemptId: undefined,
      },
    ])
    expect(screen.queryByText('浏览器验收 trace')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无 Gate run 证据')).not.toBeInTheDocument()
  })

  it('renders retryable error states for generation, repair, and gate lists', async () => {
    const user = userEvent.setup()

    generationRunsQuery.isError = true
    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    expect(screen.getByText('生成运行记录加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(generationRunsQuery.refetch).toHaveBeenCalledOnce()

    cleanup()
    generationRunsQuery.isError = false
    repairAttemptsQuery.isError = true
    gateRunsQuery.isError = true

    render(<GeneratedAppGenerationEvidencePanel appId="app-1" />)

    await user.click(screen.getByRole('button', { name: '选择 Run #1' }))

    await waitFor(() => {
      expect(screen.getByText('修复尝试加载失败')).toBeInTheDocument()
      expect(screen.getByText('Gate run 证据加载失败')).toBeInTheDocument()
    })

    const retryButtons = screen.getAllByRole('button', { name: '重新加载' })
    await user.click(retryButtons[0]!)
    await user.click(retryButtons[1]!)

    expect(repairAttemptsQuery.refetch).toHaveBeenCalledOnce()
    expect(gateRunsQuery.refetch).toHaveBeenCalledOnce()
  })
})
