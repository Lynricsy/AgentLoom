import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GeneratedApp,
  GeneratedAppCanonicalGateId,
  GeneratedAppGateResult,
  GeneratedAppGateRun,
  GeneratedAppGenerationRun,
} from '../../types'
import { makeGeneratedAppSpecV2 } from '../../__tests__/fixtures'

const GATE_NAMES = [
  '需求规格门禁',
  '架构计划门禁',
  '静态合约门禁',
  '构建与单元门禁',
  '集成门禁',
  '浏览器验收门禁',
  '独立审查门禁',
  '发布候选门禁',
]

const {
  agentListMock,
  chatModelsQuery,
  createMutation,
  disableShareMutation,
  enableShareMutation,
  gateRunsQuery,
  generatedAppsQuery,
  generationRunQuery,
  regenerateShareMutation,
  notifyMock,
  useEnableGeneratedAppPublicShareMock,
  useGeneratedAppGateRunsMock,
  useGeneratedAppGenerationRunMock,
  workflowListMock,
} = vi.hoisted(() => ({
  agentListMock: vi.fn(),
  chatModelsQuery: {
    data: [] as unknown[],
  },
  createMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  disableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  enableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  gateRunsQuery: {
    data: undefined as unknown,
  },
  generatedAppsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  generationRunQuery: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  regenerateShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  notifyMock: vi.fn(),
  useEnableGeneratedAppPublicShareMock: vi.fn(),
  useGeneratedAppGateRunsMock: vi.fn(),
  useGeneratedAppGenerationRunMock: vi.fn(),
  workflowListMock: vi.fn(),
}))

// vi.mock 工厂会被提升到所有静态 import 之前，只能在工厂里动态取真实实现
vi.mock('../../api', async () => {
  const { isGeneratedAppGenerationRunInFlight } = await import(
    '../../api/generatedAppQueries'
  )
  return {
    isGeneratedAppGenerationRunInFlight,
    useCreateGeneratedApp: () => createMutation,
    useDisableGeneratedAppPublicShare: () => disableShareMutation,
    useEnableGeneratedAppPublicShare: (appId: string) => {
      useEnableGeneratedAppPublicShareMock(appId)
      return enableShareMutation
    },
    useGeneratedAppGateRuns: (...args: unknown[]) => {
      useGeneratedAppGateRunsMock(...args)
      return gateRunsQuery
    },
    useGeneratedAppGenerationRun: (...args: unknown[]) => {
      useGeneratedAppGenerationRunMock(...args)
      return generationRunQuery
    },
    useGeneratedApps: () => generatedAppsQuery,
    useRegenerateGeneratedAppPublicShare: () => regenerateShareMutation,
  }
})

vi.mock('@/features/llm', async () => {
  const { ChatModelSelect } = await import(
    '@/features/llm/components/ChatModelSelect'
  )
  return {
    ChatModelSelect,
    useUsableChatModels: () => ({
      data: chatModelsQuery.data,
      isSuccess: true,
    }),
  }
})

vi.mock('@/features/workflow', () => ({
  useWorkflowList: (params: unknown) => {
    workflowListMock(params)
    return {
      isLoading: false,
      data: {
        data: [
          {
            id: 'workflow-published',
            name: '文档问答',
            publishedVersionId: 'version-1',
            metadata: null,
          },
          {
            id: 'workflow-wrapper',
            name: '生成应用包装工作流',
            publishedVersionId: 'version-2',
            metadata: { generatedAppId: 'app-other' },
          },
          {
            id: 'workflow-no-version',
            name: '没有发布版本的工作流',
            publishedVersionId: null,
            metadata: null,
          },
        ],
      },
    }
  },
}))

vi.mock('@/features/agent', () => ({
  useAgentList: (params: unknown) => {
    agentListMock(params)
    return {
      isLoading: false,
      data: {
        data: [
          { id: 'agent-published', name: '客服 Agent', publishedVersionId: 'agent-v1' },
        ],
      },
    }
  },
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: { appId?: string }
    children: React.ReactNode
  }) => (
    <a href={to.replace('$appId', params?.appId ?? '')} {...rest}>
      {children}
    </a>
  ),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

function makeGeneratedApp(overrides: Partial<GeneratedApp> = {}): GeneratedApp {
  const state = overrides.readiness?.state ?? 'preview'

  return {
    id: 'app-1',
    tenantId: 'tenant-1',
    prompt: '自动化中医问诊系统',
    appName: '自动化中医问诊系统',
    description: '围绕需求生成的 AppSpec 初稿。',
    status:
      state === 'publish_candidate' ? 'publish_candidate' : 'preview_ready',
    appSpec: makeGeneratedAppSpecV2(),
    generationModelConfigId: null,
    bindingTarget: null,
    generationPlan: null,
    gateResults: [],
    readiness: {
      state,
      canCreatePublicShare: false,
      blockingIssueCount: 7,
      warningCount: 0,
      summary: '阻断门禁尚未全部通过，当前只能预览。',
      blockers: [],
      warnings: [],
      ...overrides.readiness,
    },
    preview: {
      previewUrl: null,
      sourceArtifactUrl: null,
      testReportUrl: null,
    },
    agentDefinitionId: null,
    workflowDefinitionId: null,
    pluginIds: [],
    publicShareEnabled: false,
    publicShareToken: null,
    publicShareUrl: null,
    publicShareCreatedAt: null,
    publicShareDisabledAt: null,
    publicViewCount: 0,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T01:00:00.000Z',
    ...overrides,
  }
}

function makeInitialGateResults(): GeneratedAppGateResult[] {
  return GATE_NAMES.map((name, order) => ({
    gateId: `gate-${order}`,
    order,
    name,
    blocking: true,
    status: 'pending',
    summary: '等待运行。',
    evidence: [],
    updatedAt: '2026-04-25T03:00:00.000Z',
  }))
}

function makeRun(
  overrides: Partial<GeneratedAppGenerationRun> = {},
): GeneratedAppGenerationRun {
  return {
    id: 'run-created',
    tenantId: 'tenant-1',
    appId: 'app-created',
    runNumber: 1,
    status: 'queued',
    triggerSource: 'initial',
    maxRepairAttempts: 3,
    maxRuntimeSeconds: 1800,
    summary: '生成运行已排队。',
    failureReason: null,
    startedAt: '2026-04-25T03:00:00.000Z',
    completedAt: null,
    createdBy: 'user-1',
    createdAt: '2026-04-25T03:00:00.000Z',
    updatedAt: '2026-04-25T03:00:00.000Z',
    ...overrides,
  }
}

function makeGateRun(
  gateId: GeneratedAppCanonicalGateId,
  status: GeneratedAppGateRun['status'],
  summary: string,
): GeneratedAppGateRun {
  const order = Number(gateId.replace('gate-', ''))
  return {
    id: `gate-run-${gateId}`,
    tenantId: 'tenant-1',
    appId: 'app-created',
    generationRunId: 'run-created',
    repairAttemptId: null,
    gateId,
    gateOrder: order,
    gateName: GATE_NAMES[order] ?? gateId,
    blocking: true,
    attemptNumber: 1,
    status,
    summary,
    evidence: [],
    failure: null,
    repairInstructions: null,
    startedAt: '2026-04-25T03:00:00.000Z',
    completedAt: '2026-04-25T03:01:00.000Z',
    createdBy: 'user-1',
    createdAt: '2026-04-25T03:01:00.000Z',
    updatedAt: '2026-04-25T03:01:00.000Z',
  }
}

/** Radix Select 关闭态选项不在 DOM 中，展开与选中统一用同步键盘事件驱动 */
function chooseOption(trigger: HTMLElement, optionLabel: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('option', { name: optionLabel }), {
    key: 'Enter',
  })
}

const { GeneratedAppListPage } = await import('../GeneratedAppListPage')

describe('GeneratedAppListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generatedAppsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    }
    generatedAppsQuery.isError = false
    generatedAppsQuery.isFetching = false
    generatedAppsQuery.isLoading = false
    generatedAppsQuery.refetch = vi.fn()
    createMutation.mutateAsync = vi.fn()
    createMutation.isPending = false
    enableShareMutation.mutateAsync = vi.fn()
    enableShareMutation.isPending = false
    regenerateShareMutation.mutateAsync = vi.fn()
    regenerateShareMutation.isPending = false
    disableShareMutation.mutateAsync = vi.fn()
    disableShareMutation.isPending = false
    chatModelsQuery.data = [
      {
        id: 'model-chat',
        name: 'GPT-4o',
        isDefault: false,
        providerEntity: null,
      },
    ]
    generationRunQuery.data = makeRun()
    generationRunQuery.isLoading = false
    generationRunQuery.isError = false
    gateRunsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    }
  })

  it('disables public share for preview, warning trial, strict false, and blocked apps while showing backend summaries', () => {
    generatedAppsQuery.data = {
      data: [
        makeGeneratedApp({
          id: 'preview-app',
          readiness: {
            state: 'preview',
            canCreatePublicShare: false,
            blockingIssueCount: 7,
            warningCount: 0,
            summary: '预览态：Gate 1-7 仍在等待。',
            blockers: [],
            warnings: [],
          },
        }),
        makeGeneratedApp({
          id: 'trial-app',
          appName: '试用态应用',
          status: 'trial_ready',
          readiness: {
            state: 'trial',
            canCreatePublicShare: false,
            blockingIssueCount: 0,
            warningCount: 1,
            summary: '试用态：仍存在非阻断 warning。',
            blockers: [],
            warnings: [],
          },
        }),
        makeGeneratedApp({
          id: 'strict-false-app',
          appName: '发布候选但后端禁止分享',
          status: 'publish_candidate',
          readiness: {
            state: 'publish_candidate',
            canCreatePublicShare: false,
            blockingIssueCount: 0,
            warningCount: 0,
            summary: '发布候选态：后端仍未允许创建公开分享。',
            blockers: [],
            warnings: [],
          },
        }),
        makeGeneratedApp({
          id: 'blocked-app',
          appName: '阻断应用',
          status: 'failed',
          readiness: {
            state: 'blocked',
            canCreatePublicShare: false,
            blockingIssueCount: 1,
            warningCount: 0,
            summary: '阻断态：Gate 5 浏览器验收失败。',
            blockers: [],
            warnings: [],
          },
        }),
      ],
      meta: { page: 1, pageSize: 12, total: 4, totalPages: 1 },
    }

    renderWithProviders(<GeneratedAppListPage />)

    expect(screen.getByText('预览态：Gate 1-7 仍在等待。')).toBeInTheDocument()
    expect(
      screen.getByText('试用态：仍存在非阻断 warning。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('发布候选态：后端仍未允许创建公开分享。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('阻断态：Gate 5 浏览器验收失败。'),
    ).toBeInTheDocument()

    const disabledShareButtons = screen.getAllByRole('button', {
      name: '公开分享不可用',
    })
    expect(disabledShareButtons).toHaveLength(4)
    disabledShareButtons.forEach((button) => expect(button).toBeDisabled())
  })

  it('enables public share for publish_candidate and triggers the mutation', async () => {
    const user = userEvent.setup()
    enableShareMutation.mutateAsync.mockResolvedValue(
      makeGeneratedApp({
        id: 'publish-app',
        readiness: {
          state: 'publish_candidate',
          canCreatePublicShare: true,
          blockingIssueCount: 0,
          warningCount: 0,
          summary: '全部阻断门禁已通过且没有非阻断 warning。',
          blockers: [],
          warnings: [],
        },
      }),
    )
    generatedAppsQuery.data = {
      data: [
        makeGeneratedApp({
          id: 'publish-app',
          status: 'publish_candidate',
          readiness: {
            state: 'publish_candidate',
            canCreatePublicShare: true,
            blockingIssueCount: 0,
            warningCount: 0,
            summary: '全部阻断门禁已通过且没有非阻断 warning。',
            blockers: [],
            warnings: [],
          },
        }),
      ],
      meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    }

    renderWithProviders(<GeneratedAppListPage />)

    expect(screen.getByRole('link', { name: /查看详情/ })).toHaveAttribute(
      'href',
      '/generated-apps/publish-app',
    )

    const enableButton = screen.getByRole('button', { name: '启用公开分享' })
    expect(enableButton).toBeEnabled()

    await user.click(enableButton)

    await waitFor(() => {
      expect(useEnableGeneratedAppPublicShareMock).toHaveBeenCalledWith(
        'publish-app',
      )
      expect(enableShareMutation.mutateAsync).toHaveBeenCalledOnce()
    })
  })

  it('creates an app with the chosen model and workflow, then polls the queued run instead of starting one', async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockResolvedValue({
      ...makeGeneratedApp({
        id: 'app-created',
        status: 'app_spec_generating',
        appSpec: null,
        gateResults: makeInitialGateResults(),
      }),
      generationRunId: 'run-created',
    })
    generationRunQuery.data = makeRun({
      status: 'running',
      summary: 'gate-0 通过：AppSpec 已生成。',
    })
    gateRunsQuery.data = {
      data: [makeGateRun('gate-0', 'passed', 'AppSpec 已生成。')],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    }

    renderWithProviders(<GeneratedAppListPage />)

    chooseOption(screen.getByTestId('generated-app-model-select'), 'GPT-4o')
    chooseOption(
      screen.getByTestId('generated-app-binding-target-select'),
      '文档问答',
    )
    const input = screen.getByLabelText('一句话描述你要的应用')
    await user.type(input, '一个问答页面')
    await user.click(screen.getByRole('button', { name: '创建并生成应用' }))

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        prompt: '一个问答页面',
        modelConfigId: 'model-chat',
        bindingTarget: {
          kind: 'workflow',
          workflowDefinitionId: 'workflow-published',
        },
      })
    })
    expect(useGeneratedAppGenerationRunMock).toHaveBeenCalledWith(
      'app-created',
      'run-created',
    )
    expect(input).toHaveValue('')
    expect(screen.getByRole('link', { name: /进入详情/ })).toHaveAttribute(
      'href',
      '/generated-apps/app-created',
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '应用已创建，正在生成',
        variant: 'success',
      }),
    )

    const progress = screen.getByTestId('generated-app-generation-progress')
    expect(progress).toHaveAttribute('data-run-status', 'running')
    expect(within(progress).getByText('gate-0 通过：AppSpec 已生成。')).toBeInTheDocument()
    expect(within(progress).getByText('已完成 1/8 个 Gate')).toBeInTheDocument()
    expect(progress.querySelector('[data-gate-id="gate-0"]')).toHaveAttribute(
      'data-gate-status',
      'passed',
    )
    expect(progress.querySelector('[data-gate-id="gate-1"]')).toHaveAttribute(
      'data-gate-status',
      'running',
    )
    expect(progress.querySelector('[data-gate-id="gate-2"]')).toHaveAttribute(
      'data-gate-status',
      'pending',
    )
    expect(useGeneratedAppGateRunsMock).toHaveBeenCalledWith(
      'app-created',
      { generationRunId: 'run-created', pageSize: 100 },
      { poll: true },
    )
  })

  it('omits model and binding when left on automatic', async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockResolvedValue({
      ...makeGeneratedApp({ id: 'app-auto', gateResults: makeInitialGateResults() }),
      generationRunId: 'run-auto',
    })

    renderWithProviders(<GeneratedAppListPage />)

    await user.type(screen.getByLabelText('一句话描述你要的应用'), '一个问答页面')
    await user.click(screen.getByRole('button', { name: '创建并生成应用' }))

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        prompt: '一个问答页面',
        modelConfigId: undefined,
        bindingTarget: undefined,
      })
    })
  })

  it('lists only published workflows and agents as binding targets, excluding generated wrapper workflows', () => {
    renderWithProviders(<GeneratedAppListPage />)

    fireEvent.keyDown(
      screen.getByTestId('generated-app-binding-target-select'),
      { key: 'Enter' },
    )

    expect(screen.getByRole('option', { name: '文档问答' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '客服 Agent' })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: '生成应用包装工作流' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: '没有发布版本的工作流' }),
    ).not.toBeInTheDocument()
    expect(workflowListMock).toHaveBeenCalledWith({
      status: 'published',
      pageSize: 100,
    })
    expect(agentListMock).toHaveBeenCalledWith({
      status: 'published',
      pageSize: 100,
    })
  })

  it('shows the run failure reason and marks gates after the failed one as not executed', async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockResolvedValue({
      ...makeGeneratedApp({ id: 'app-failed', gateResults: makeInitialGateResults() }),
      generationRunId: 'run-failed',
    })
    generationRunQuery.data = makeRun({
      status: 'failed',
      summary: '生成运行在 gate-0 失败，后续 Gate 未执行；应用保持不可发布。',
      failureReason: '没有可绑定的已发布工作流或 Agent',
      completedAt: '2026-04-25T03:02:00.000Z',
    })
    gateRunsQuery.data = {
      data: [makeGateRun('gate-0', 'failed', '没有候选。')],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    }

    renderWithProviders(<GeneratedAppListPage />)

    await user.type(screen.getByLabelText('一句话描述你要的应用'), '一个问答页面')
    await user.click(screen.getByRole('button', { name: '创建并生成应用' }))

    const progress = await screen.findByTestId('generated-app-generation-progress')
    expect(progress).toHaveAttribute('data-run-status', 'failed')
    expect(
      within(progress).getByText('没有可绑定的已发布工作流或 Agent'),
    ).toBeInTheDocument()
    expect(progress.querySelector('[data-gate-id="gate-7"]')).toHaveAttribute(
      'data-gate-status',
      'not_executed',
    )
    expect(useGeneratedAppGateRunsMock).toHaveBeenCalledWith(
      'app-failed',
      { generationRunId: 'run-failed', pageSize: 100 },
      { poll: false },
    )
  })

  it('reports a create failure with the server problem detail', async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockRejectedValue(
      new Error('工作流 workflow-1 不存在、无权访问或尚未发布，不能作为生成应用的绑定目标'),
    )

    renderWithProviders(<GeneratedAppListPage />)

    await user.type(screen.getByLabelText('一句话描述你要的应用'), '一个问答页面')
    await user.click(screen.getByRole('button', { name: '创建并生成应用' }))

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '创建失败',
          description:
            '工作流 workflow-1 不存在、无权访问或尚未发布，不能作为生成应用的绑定目标',
          variant: 'error',
        }),
      )
    })
    expect(
      screen.queryByTestId('generated-app-generation-progress'),
    ).not.toBeInTheDocument()
  })

  it('blocks creation when the account has no usable chat model', () => {
    chatModelsQuery.data = []

    renderWithProviders(<GeneratedAppListPage />)

    expect(
      screen.getByTestId('generated-app-no-chat-model-warning'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '创建并生成应用' }),
    ).toBeDisabled()
  })
})
