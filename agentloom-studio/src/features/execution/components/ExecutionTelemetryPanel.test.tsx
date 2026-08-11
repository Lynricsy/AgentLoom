import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { ExecutionTelemetryPanel } from './ExecutionTelemetryPanel'
import type { ExecutionRecord } from '../api/executionRecordApi'

const mocks = vi.hoisted(() => ({
  useExecutionRecords: vi.fn(),
}))

vi.mock('../hooks/useExecutionRecords', () => ({
  useExecutionRecords: mocks.useExecutionRecords,
}))

const summaryRecord: ExecutionRecord = {
  id: 'rec-summary',
  executionId: 'exec-1',
  stepId: null,
  nodeId: null,
  recordType: 'execution_summary',
  telemetryData: null,
  summaryData: {
    totalSteps: 4,
    completedSteps: 3,
    failedSteps: 1,
    totalToolCalls: 6,
    totalErrors: 1,
    totalSelfRepairs: 2,
    totalTokens: 12_345,
    totalLatencyMs: 8_400,
    avgStepLatencyMs: 2_100,
    executionDurationMs: 9_600,
  },
  createdAt: '2026-03-10T10:05:00.000Z',
}

const stepRecord: ExecutionRecord = {
  id: 'rec-step',
  executionId: 'exec-1',
  stepId: 'aaaabbbb-cccc-dddd-eeee-ffff00001111',
  nodeId: 'agent-node-1',
  recordType: 'step_telemetry',
  telemetryData: {
    toolCalls: [
      {
        toolName: 'http_request',
        input: { url: 'https://example.com' },
        output: { status: 200 },
        durationMs: 240,
        status: 'success',
      },
    ],
    errors: [],
    selfRepairs: [],
    ioSnapshots: { stepInput: { q: 'hi' }, stepOutput: { a: 'yo' } },
    llmInteractions: {
      modelId: 'gpt-4o-mini',
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      latencyMs: 1_200,
    },
  },
  summaryData: null,
  createdAt: '2026-03-10T10:04:00.000Z',
}

function recordsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function withRecords(records: ExecutionRecord[], hasMore = false) {
  return recordsQuery({
    data: {
      data: records,
      meta: { total: records.length, limit: 20, offset: 0, hasMore },
    },
  })
}

function renderPanel() {
  return render(
    <ToastProvider>
      <ExecutionTelemetryPanel executionId="exec-1" />
    </ToastProvider>,
  )
}

describe('ExecutionTelemetryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useExecutionRecords.mockReturnValue(withRecords([]))
  })

  it('加载中渲染骨架', () => {
    mocks.useExecutionRecords.mockReturnValue(recordsQuery({ isLoading: true }))
    renderPanel()

    expect(screen.getByTestId('execution-telemetry-loading')).toBeInTheDocument()
  })

  it('失败时渲染错误态并弹出 toast', async () => {
    mocks.useExecutionRecords.mockReturnValue(
      recordsQuery({ isError: true, error: new Error('telemetry boom') }),
    )
    renderPanel()

    expect(screen.getByTestId('execution-telemetry-error')).toHaveTextContent(
      'telemetry boom',
    )
    // 空态标题 + toast 标题各一次
    await waitFor(() => {
      expect(screen.getAllByText('加载执行遥测失败')).toHaveLength(2)
    })
  })

  it('无记录时渲染空态', () => {
    renderPanel()

    expect(screen.getByTestId('execution-telemetry-empty')).toBeInTheDocument()
  })

  it('按 recordType 分组渲染汇总与步骤遥测', () => {
    mocks.useExecutionRecords.mockReturnValue(
      withRecords([summaryRecord, stepRecord]),
    )
    renderPanel()

    const summaryGroup = screen.getByTestId('execution-telemetry-summary-group')
    expect(summaryGroup).toHaveTextContent('执行汇总')
    expect(summaryGroup).toHaveTextContent('总步骤')
    expect(summaryGroup).toHaveTextContent('9.60 秒')
    expect(
      screen.getByTestId(`telemetry-summary-${summaryRecord.id}`),
    ).toBeInTheDocument()

    const stepGroup = screen.getByTestId('execution-telemetry-step-group')
    expect(stepGroup).toHaveTextContent('步骤遥测')
    expect(stepGroup).toHaveTextContent('agent-node-1')
    expect(stepGroup).toHaveTextContent('工具调用 1')
    expect(stepGroup).toHaveTextContent('错误 0')
    expect(stepGroup).toHaveTextContent('140 tokens')
    expect(
      screen.getByTestId(`telemetry-step-json-${stepRecord.id}`),
    ).toBeInTheDocument()

    // 汇总记录不会串到步骤分组里
    expect(
      screen.queryByTestId(`telemetry-step-${summaryRecord.id}`),
    ).not.toBeInTheDocument()
  })

  it('只有单一类型时另一分组给出说明而非整页空态', () => {
    mocks.useExecutionRecords.mockReturnValue(withRecords([stepRecord]))
    renderPanel()

    expect(
      screen.getByTestId('execution-telemetry-summary-group'),
    ).toHaveTextContent('当前页没有 execution_summary 记录。')
    expect(screen.queryByTestId('execution-telemetry-empty')).not.toBeInTheDocument()
  })

  it('还有下一页时可翻页并按新 offset 查询', async () => {
    const user = userEvent.setup()
    mocks.useExecutionRecords.mockReturnValue(withRecords([stepRecord], true))
    renderPanel()

    await user.click(screen.getByTestId('execution-telemetry-next'))

    expect(mocks.useExecutionRecords).toHaveBeenLastCalledWith('exec-1', {
      limit: 20,
      offset: 20,
    })
  })
})
