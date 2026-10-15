import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TeamRunsApi from '../../api/teamRuns'
import {
  teamRunKeys,
  type TeamMessageItem,
  type TeamMessagePage,
  type TeamRunDetail,
  type TeamRunSummary,
} from '../../api/teamRuns'
import { useExecutionStore } from '../../stores/executionStore'
import type {
  ExecutionEvent,
  TeamMessagePayload,
  TeamStatusPayload,
} from '../../types'
import { TeamRunPanel } from './TeamRunPanel'

const mocks = vi.hoisted(() => ({
  listTeamRuns: vi.fn(),
  getTeamRun: vi.fn(),
  listTeamMessages: vi.fn(),
  useDecisionRecords: vi.fn(),
}))

vi.mock('../../api/teamRuns', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamRunsApi>()),
  listTeamRuns: mocks.listTeamRuns,
  getTeamRun: mocks.getTeamRun,
  listTeamMessages: mocks.listTeamMessages,
}))

vi.mock('@/features/decision-record/api/decision-record-queries', () => ({
  useDecisionRecords: mocks.useDecisionRecords,
}))

const EXECUTION_ID = 'exec-1'
const STEP_ID = 'step-team'
const RUN_ID = 'tr-1'

const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

function createSummary(overrides: Partial<TeamRunSummary> = {}): TeamRunSummary {
  return {
    id: RUN_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    nodeId: 'team-1',
    status: 'running',
    failureReason: null,
    usage,
    messageCount: 1,
    startedAt: '2026-10-15T08:00:00.000Z',
    completedAt: null,
    createdAt: '2026-10-15T08:00:00.000Z',
    ...overrides,
  }
}

function createDetail(overrides: Partial<TeamRunDetail> = {}): TeamRunDetail {
  return {
    id: RUN_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    nodeId: 'team-1',
    status: 'running',
    taskText: '修复登录 bug',
    budget: {
      maxTotalTokens: 1000,
      maxMessages: 30,
      deadlineAt: '2099-01-01T00:00:00.000Z',
      usedTokens: 120,
      messageCount: 1,
    },
    usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.01 },
    members: [
      {
        id: 'm-locator',
        role: 'locator',
        isLead: false,
        agentDefinitionId: '00000000-0000-4000-8000-000000000001',
        agentName: '定位助手',
        conversationId: '00000000-0000-4000-8000-000000000011',
        status: 'idle',
        turnCount: 2,
        usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.01 },
      },
      {
        id: 'm-impl',
        role: 'implementer',
        isLead: true,
        agentDefinitionId: '00000000-0000-4000-8000-000000000002',
        agentName: '实现助手',
        conversationId: '00000000-0000-4000-8000-000000000012',
        status: 'idle',
        turnCount: 0,
        usage,
      },
    ],
    result: null,
    failureReason: null,
    failureDetail: null,
    startedAt: '2026-10-15T08:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function createMessage(overrides: Partial<TeamMessageItem> = {}): TeamMessageItem {
  return {
    id: 'msg-1',
    fromRole: 'locator',
    toRole: 'implementer',
    kind: 'observation',
    content: '问题位于 auth.service.ts 的 token 刷新分支',
    refs: ['src/auth.service.ts:42'],
    deliveryStatus: 'delivered',
    decisionRecordId: null,
    createdAt: '2026-10-15T08:01:00.000Z',
    deliveredAt: '2026-10-15T08:01:01.000Z',
    consumedAt: null,
    ...overrides,
  }
}

function messagePage(messages: TeamMessageItem[]): TeamMessagePage {
  return {
    data: messages,
    meta: { total: messages.length, page: 1, limit: 200, totalPages: 1 },
  }
}

function statusEvent(
  data: Partial<TeamStatusPayload>,
): ExecutionEvent<TeamStatusPayload> {
  return {
    eventId: 10,
    executionId: EXECUTION_ID,
    event: 'execution.node.team-status',
    timestamp: '2026-10-15T08:02:00.000Z',
    data: {
      stepId: STEP_ID,
      nodeId: 'team-1',
      teamRunId: RUN_ID,
      status: 'running',
      members: [
        { memberId: 'm-locator', role: 'locator', isLead: false, status: 'idle', usedTokens: 120 },
        { memberId: 'm-impl', role: 'implementer', isLead: true, status: 'running', usedTokens: 0 },
      ],
      budget: {
        usedTokens: 120,
        maxTotalTokens: 1000,
        messageCount: 2,
        maxMessages: 30,
        deadlineAt: '2099-01-01T00:00:00.000Z',
      },
      ...data,
    },
  } as ExecutionEvent<TeamStatusPayload>
}

function messageEvent(
  data: Partial<TeamMessagePayload>,
): ExecutionEvent<TeamMessagePayload> {
  return {
    eventId: 11,
    executionId: EXECUTION_ID,
    event: 'execution.node.team-message',
    timestamp: '2026-10-15T08:02:00.000Z',
    data: {
      stepId: STEP_ID,
      teamRunId: RUN_ID,
      messageId: 'msg-1',
      fromRole: 'locator',
      toRole: 'implementer',
      kind: 'observation',
      preview: '问题位于 auth.service.ts',
      deliveryStatus: 'delivered',
      createdAt: '2026-10-15T08:01:00.000Z',
      ...data,
    },
  } as ExecutionEvent<TeamMessagePayload>
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TeamRunPanel executionId={EXECUTION_ID} stepId={STEP_ID} nodeName="三角色团队" />
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

describe('TeamRunPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useExecutionStore.getState().actions.reset()
    mocks.listTeamRuns.mockResolvedValue([createSummary()])
    mocks.getTeamRun.mockResolvedValue(createDetail())
    mocks.listTeamMessages.mockResolvedValue(messagePage([createMessage()]))
    mocks.useDecisionRecords.mockReturnValue({ data: undefined })
  })

  afterEach(() => {
    useExecutionStore.getState().actions.reset()
  })

  it('渲染成员、预算与完整消息正文，并把 REST 快照 hydrate 到 store', async () => {
    renderPanel()

    expect(await screen.findByText('定位助手')).toBeInTheDocument()
    expect(screen.getByText('实现助手')).toBeInTheDocument()
    expect(screen.getByText('负责人')).toBeInTheDocument()
    expect(screen.getByTestId('team-run-status')).toHaveTextContent('协作中')
    expect(screen.getByTestId('team-budget-tokens')).toHaveTextContent('120 / 1,000')
    expect(screen.getByTestId('team-budget-messages')).toHaveTextContent('1 / 30')
    expect(screen.getByTestId('team-budget-deadline')).toHaveTextContent('剩余')

    const message = await screen.findByTestId('team-message-msg-1')
    expect(message).toHaveTextContent('问题位于 auth.service.ts 的 token 刷新分支')
    expect(message).toHaveTextContent('src/auth.service.ts:42')
    expect(screen.getByTestId('team-message-delivery-msg-1')).toHaveTextContent('已投递')

    await waitFor(() => {
      expect(useExecutionStore.getState().teamRuns[RUN_ID]?.status).toBe('running')
    })
    expect(useExecutionStore.getState().teamRuns[RUN_ID]?.messages).toHaveLength(1)
  })

  it('socket 事件推进状态与投递，REST refetch 不覆盖', async () => {
    const { queryClient } = renderPanel()
    await screen.findByTestId('team-message-msg-1')
    await waitFor(() => {
      expect(useExecutionStore.getState().teamRuns[RUN_ID]).toBeDefined()
    })

    const { actions } = useExecutionStore.getState()
    act(() => {
      actions.updateTeamStatus(statusEvent({}))
      actions.upsertTeamMessage(messageEvent({ deliveryStatus: 'consumed' }))
      actions.upsertTeamMessage(
        messageEvent({
          messageId: 'msg-2',
          fromRole: 'implementer',
          toRole: 'locator',
          kind: 'request',
          preview: '请确认刷新失败时的日志',
          deliveryStatus: 'pending',
          createdAt: '2026-10-15T08:03:00.000Z',
        }),
      )
    })

    expect(screen.getByTestId('team-message-delivery-msg-1')).toHaveTextContent('已读取')
    // 预览消息保留 socket 内容，正文仍以 REST 已有的完整版本为准
    expect(screen.getByTestId('team-message-msg-1')).toHaveTextContent(
      '问题位于 auth.service.ts 的 token 刷新分支',
    )
    const preview = screen.getByTestId('team-message-msg-2')
    expect(preview).toHaveTextContent('请确认刷新失败时的日志')
    expect(preview).toHaveTextContent('预览')
    expect(screen.getByTestId('team-budget-messages')).toHaveTextContent('2 / 30')

    const implementerRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('implementer'))!
    expect(within(implementerRow).getByText('执行中')).toBeInTheDocument()

    // REST 仍返回旧快照：refetch 后 store 驱动的字段不回退
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: teamRunKeys.all })
    })
    expect(mocks.getTeamRun.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('team-message-delivery-msg-1')).toHaveTextContent('已读取')
    expect(within(implementerRow).getByText('执行中')).toBeInTheDocument()
    expect(screen.getByTestId('team-budget-messages')).toHaveTextContent('2 / 30')
  })

  it('socket 推进到终态后补拉详情并展示结果', async () => {
    renderPanel()
    await screen.findByTestId('team-message-msg-1')
    await waitFor(() => {
      expect(useExecutionStore.getState().teamRuns[RUN_ID]).toBeDefined()
    })

    mocks.getTeamRun.mockResolvedValue(
      createDetail({
        status: 'completed',
        result: {
          summary: '已修复 token 刷新',
          knownLimitations: ['未覆盖并发刷新'],
          artifact: { patch: 'diff' },
        },
      }),
    )
    act(() => {
      useExecutionStore
        .getState()
        .actions.updateTeamStatus(statusEvent({ status: 'completed' }))
    })

    expect(await screen.findByTestId('team-run-result')).toHaveTextContent('已修复 token 刷新')
    expect(screen.getByText('未覆盖并发刷新')).toBeInTheDocument()
    expect(screen.getByTestId('team-run-status')).toHaveTextContent('已完成')
  })

  it('失败时显示失败原因', async () => {
    mocks.listTeamRuns.mockResolvedValue([
      createSummary({ status: 'failed', failureReason: 'budget_exhausted' }),
    ])
    mocks.getTeamRun.mockResolvedValue(
      createDetail({
        status: 'failed',
        failureReason: 'budget_exhausted',
        failureDetail: '已用 1200 tokens',
      }),
    )
    renderPanel()

    const failure = await screen.findByTestId('team-run-failure')
    expect(failure).toHaveTextContent('Token 或消息预算耗尽')
    expect(failure).toHaveTextContent('已用 1200 tokens')
  })

  it('带决策记录的消息显示 Jev 影子结果', async () => {
    mocks.listTeamMessages.mockResolvedValue(
      messagePage([
        createMessage({ decisionRecordId: '00000000-0000-4000-8000-0000000000aa' }),
      ]),
    )
    mocks.useDecisionRecords.mockReturnValue({
      data: {
        data: [
          {
            id: 'rec-shadow',
            mode: 'shadow',
            provider: 'jev',
            model: 'jev-1.13.0',
            outcome: { type: 'noul', value: 0.82 },
            confidence: null,
            error: null,
          },
        ],
      },
    })
    renderPanel()

    const message = await screen.findByTestId('team-message-msg-1')
    expect(within(message).getByTestId('jev-shadow-badge')).toHaveTextContent('Jev 影子')
    expect(mocks.useDecisionRecords).toHaveBeenCalledWith({
      subjectType: 'team_message',
      subjectId: 'msg-1',
    })
  })

  it('尚无团队运行时显示空态', async () => {
    mocks.listTeamRuns.mockResolvedValue([])
    renderPanel()

    expect(await screen.findByText('团队尚未启动')).toBeInTheDocument()
  })
})
