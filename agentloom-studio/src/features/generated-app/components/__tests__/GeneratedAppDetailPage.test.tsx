import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GeneratedApp,
  GeneratedAppArtifactContent,
  GeneratedAppArtifactManifest,
  GeneratedAppReadinessState,
} from '../../types'

const {
  disableShareMutation,
  deleteSubmissionMutation,
  deleteSubmissionsMutation,
  enableShareMutation,
  gateRunsQuery,
  generatedAppQuery,
  artifactContentQuery,
  buildPreviewContentQuery,
  artifactManifestQuery,
  generationRunsQuery,
  repairAttemptsQuery,
  regenerateShareMutation,
  runtimeBindingReadinessQuery,
  startGenerationRunMutation,
  submissionDetailQuery,
  submissionsQuery,
  useGeneratedAppMock,
} = vi.hoisted(() => ({
  disableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteSubmissionMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteSubmissionsMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  enableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  gateRunsQuery: {
    data: {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    } as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  generatedAppQuery: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  artifactContentQuery: {
    data: undefined as GeneratedAppArtifactContent | undefined,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  buildPreviewContentQuery: {
    data: undefined as GeneratedAppArtifactContent | undefined,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  artifactManifestQuery: {
    data: {
      workspace: null,
      artifacts: [],
      updatedAt: '2026-04-25T01:00:00.000Z',
    } as GeneratedAppArtifactManifest,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  generationRunsQuery: {
    data: {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    } as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  repairAttemptsQuery: {
    data: {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    } as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  regenerateShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  runtimeBindingReadinessQuery: {
    data: {
      state: 'deterministic_only',
      workflowDefinitionId: null,
      workflowStatus: null,
      publishedVersionId: null,
      canStartWorkflowExecution: false,
      summary: '当前 Generated App 没有绑定 Workflow。',
      notice:
        '公开提交只会返回本地 deterministic report，不会创建 Workflow execution。',
      updatedAt: '2026-04-25T01:00:00.000Z',
    } as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  startGenerationRunMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  submissionDetailQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  submissionsQuery: {
    data: {
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    } as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  useGeneratedAppMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useDeleteGeneratedAppSubmission: () => deleteSubmissionMutation,
  useDeleteGeneratedAppSubmissions: () => deleteSubmissionsMutation,
  useDisableGeneratedAppPublicShare: () => disableShareMutation,
  useEnableGeneratedAppPublicShare: (appId: string) => {
    useGeneratedAppMock(`enable:${appId}`)
    return enableShareMutation
  },
  useGeneratedApp: (appId: string | undefined) => {
    useGeneratedAppMock(`detail:${appId ?? ''}`)
    return generatedAppQuery
  },
  useGeneratedAppArtifactContent: (
    _appId: string | undefined,
    artifactId: string | undefined,
  ) =>
    artifactId === 'gate-3-build-output-html'
      ? buildPreviewContentQuery
      : artifactContentQuery,
  useGeneratedAppArtifactManifest: () => artifactManifestQuery,
  useGeneratedAppGateRuns: () => gateRunsQuery,
  useGeneratedAppGenerationRuns: () => generationRunsQuery,
  useGeneratedAppRuntimeBindingReadiness: () => runtimeBindingReadinessQuery,
  useGeneratedAppRepairAttempts: () => repairAttemptsQuery,
  useRegenerateGeneratedAppPublicShare: (appId: string) => {
    useGeneratedAppMock(`regenerate:${appId}`)
    return regenerateShareMutation
  },
  useStartGeneratedAppGenerationRun: (appId: string) => {
    useGeneratedAppMock(`start:${appId}`)
    return startGenerationRunMutation
  },
  useGeneratedAppSubmission: () => submissionDetailQuery,
  useGeneratedAppSubmissions: () => submissionsQuery,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: { agentId?: string; appId?: string; workflowId?: string }
    children: React.ReactNode
  }) => (
    <a
      href={to
        .replace('$agentId', params?.agentId ?? '')
        .replace('$appId', params?.appId ?? '')
        .replace('$workflowId', params?.workflowId ?? '')}
      {...rest}
    >
      {children}
    </a>
  ),
}))

function makeGeneratedApp(overrides: Partial<GeneratedApp> = {}): GeneratedApp {
  const readiness = {
    state: 'preview' as GeneratedAppReadinessState,
    canCreatePublicShare: false,
    blockingIssueCount: 7,
    warningCount: 0,
    summary: 'Gate 1-7 仍在等待，当前只能预览。',
    blockers: [],
    warnings: [],
    ...overrides.readiness,
  }

  return {
    id: 'app-detail',
    tenantId: 'tenant-1',
    prompt: '自动化中医问诊系统',
    appName: '自动化中医问诊系统',
    description: '围绕问诊、报告和公开提交生成的应用。',
    status:
      readiness.state === 'publish_candidate'
        ? 'publish_candidate'
        : 'preview_ready',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '按患者回答动态提问并生成问诊报告。',
      userGoal: '让终端用户完成问诊并查看分析报告。',
      actors: ['创建者', '终端用户'],
      coreRequirements: [
        { id: 'req-intake', text: '逐步收集问诊信息。' },
        { id: 'req-report', text: '生成结构化分析报告。' },
      ],
      pages: [
        {
          id: 'page-runtime',
          name: '问诊运行页',
          purpose: '终端用户填写问诊答案。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: ['不提供诊断结论'],
      acceptanceScenarios: [
        {
          id: 'scenario-main',
          title: '完成问诊并得到报告',
          requirementIds: ['req-intake', 'req-report'],
          given: ['患者打开问诊页'],
          when: ['患者回答全部问题'],
          then: ['系统展示结构化报告'],
        },
      ],
      traceability: [
        {
          requirementId: 'req-intake',
          scenarioIds: ['scenario-main'],
          evidenceIds: ['evidence-browser-main'],
        },
      ],
    },
    generationPlan: null,
    gateResults: [
      {
        gateId: 'gate-0',
        order: 0,
        name: '需求规格门禁',
        blocking: true,
        status: 'passed',
        summary: 'AppSpec 完整。',
        evidence: [
          {
            id: 'evidence-spec',
            label: 'AppSpec',
            kind: 'app_spec',
            url: null,
            summary: '规格已生成。',
          },
        ],
        updatedAt: '2026-04-25T00:10:00.000Z',
      },
      {
        gateId: 'gate-5',
        order: 5,
        name: '浏览器验收门禁',
        blocking: true,
        status: 'warning',
        summary: '移动端仍需复核。',
        evidence: [],
        updatedAt: '2026-04-25T00:20:00.000Z',
      },
    ],
    preview: {
      previewUrl: null,
      sourceArtifactUrl: 'https://example.com/source.zip',
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
    readiness,
  }
}

const { GeneratedAppDetailPage } = await import('../GeneratedAppDetailPage')

describe('GeneratedAppDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generatedAppQuery.data = makeGeneratedApp()
    generatedAppQuery.isError = false
    generatedAppQuery.isLoading = false
    generatedAppQuery.refetch = vi.fn()
    enableShareMutation.mutateAsync = vi.fn()
    enableShareMutation.isPending = false
    regenerateShareMutation.mutateAsync = vi.fn()
    regenerateShareMutation.isPending = false
    runtimeBindingReadinessQuery.data = {
      state: 'deterministic_only',
      workflowDefinitionId: null,
      workflowStatus: null,
      publishedVersionId: null,
      canStartWorkflowExecution: false,
      summary: '当前 Generated App 没有绑定 Workflow。',
      notice:
        '公开提交只会返回本地 deterministic report，不会创建 Workflow execution。',
      updatedAt: '2026-04-25T01:00:00.000Z',
    }
    runtimeBindingReadinessQuery.isError = false
    runtimeBindingReadinessQuery.isLoading = false
    runtimeBindingReadinessQuery.refetch = vi.fn()
    artifactManifestQuery.data = {
      workspace: null,
      artifacts: [],
      updatedAt: '2026-04-25T01:00:00.000Z',
    }
    artifactManifestQuery.isError = false
    artifactManifestQuery.isLoading = false
    artifactManifestQuery.refetch = vi.fn()
    artifactContentQuery.data = undefined
    artifactContentQuery.isError = false
    artifactContentQuery.isLoading = false
    artifactContentQuery.refetch = vi.fn()
    buildPreviewContentQuery.data = undefined
    buildPreviewContentQuery.isError = false
    buildPreviewContentQuery.isLoading = false
    buildPreviewContentQuery.refetch = vi.fn()
    disableShareMutation.mutateAsync = vi.fn()
    disableShareMutation.isPending = false
    startGenerationRunMutation.mutateAsync = vi.fn()
    startGenerationRunMutation.isPending = false
    deleteSubmissionMutation.mutateAsync = vi.fn()
    deleteSubmissionMutation.isPending = false
    deleteSubmissionsMutation.mutateAsync = vi.fn()
    deleteSubmissionsMutation.isPending = false
    generationRunsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    }
    generationRunsQuery.isError = false
    generationRunsQuery.isFetching = false
    generationRunsQuery.isLoading = false
    repairAttemptsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    }
    repairAttemptsQuery.isError = false
    repairAttemptsQuery.isFetching = false
    repairAttemptsQuery.isLoading = false
    gateRunsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
    }
    gateRunsQuery.isError = false
    gateRunsQuery.isFetching = false
    gateRunsQuery.isLoading = false
    submissionDetailQuery.data = undefined
    submissionDetailQuery.isError = false
    submissionDetailQuery.isFetching = false
    submissionDetailQuery.isLoading = false
    submissionsQuery.data = {
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    }
    submissionsQuery.isError = false
    submissionsQuery.isFetching = false
    submissionsQuery.isLoading = false
  })

  it.each([
    ['preview', '预览态：阻断门禁尚未全绿。'],
    ['trial', '试用态：存在非阻断 warning。'],
    ['blocked', '阻断态：浏览器验收失败。'],
    ['publish_candidate', '发布候选态：后端未允许公开分享。'],
  ] as const)(
    'shows readiness summary and disables public share for %s readiness',
    (state, summary) => {
      generatedAppQuery.data = makeGeneratedApp({
        readiness: {
          state,
          canCreatePublicShare: false,
          blockingIssueCount: state === 'blocked' ? 1 : 0,
          warningCount: state === 'trial' ? 1 : 0,
          summary,
          blockers: [],
          warnings: [],
        },
      })

      render(<GeneratedAppDetailPage appId="app-detail" />)

      expect(screen.getAllByText(summary).length).toBeGreaterThan(0)
      expect(
        screen.getByRole('button', { name: '公开分享不可用' }),
      ).toBeDisabled()
    },
  )

  it('allows enable and regenerate mutations for publish candidate apps', async () => {
    const user = userEvent.setup()
    enableShareMutation.mutateAsync.mockResolvedValue(makeGeneratedApp())
    regenerateShareMutation.mutateAsync.mockResolvedValue(makeGeneratedApp())
    generatedAppQuery.data = makeGeneratedApp({
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
    })

    render(<GeneratedAppDetailPage appId="app-detail" />)

    await user.click(screen.getByRole('button', { name: '启用公开分享' }))

    await waitFor(() => {
      expect(enableShareMutation.mutateAsync).toHaveBeenCalledOnce()
    })

    cleanup()
    generatedAppQuery.data = makeGeneratedApp({
      status: 'publish_candidate',
      publicShareEnabled: true,
      publicShareUrl: 'https://studio.example.test/generated-apps/public/token',
      readiness: {
        state: 'publish_candidate',
        canCreatePublicShare: true,
        blockingIssueCount: 0,
        warningCount: 0,
        summary: '全部阻断门禁已通过且没有非阻断 warning。',
        blockers: [],
        warnings: [],
      },
    })

    render(<GeneratedAppDetailPage appId="app-detail" />)

    expect(
      screen.getByText(
        'https://studio.example.test/generated-apps/public/token',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新生成' }))

    await waitFor(() => {
      expect(regenerateShareMutation.mutateAsync).toHaveBeenCalledOnce()
    })
  })

  it('starts an automatic generation and verification run from the detail page', async () => {
    const user = userEvent.setup()
    startGenerationRunMutation.mutateAsync.mockResolvedValue({
      generationRun: {
        id: 'run-detail',
        tenantId: 'tenant-1',
        appId: 'app-detail',
        runNumber: 2,
        status: 'passed',
        triggerSource: 'retry',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
        summary: '自动生成完成。',
        failureReason: null,
        startedAt: '2026-04-25T03:00:00.000Z',
        completedAt: '2026-04-25T03:10:00.000Z',
        createdBy: 'user-1',
        createdAt: '2026-04-25T03:00:00.000Z',
        updatedAt: '2026-04-25T03:10:00.000Z',
      },
      gateRuns: [],
      app: makeGeneratedApp(),
    })

    render(<GeneratedAppDetailPage appId="app-detail" />)

    await user.click(
      screen.getByRole('button', { name: '重新运行自动生成与验证' }),
    )

    await waitFor(() => {
      expect(startGenerationRunMutation.mutateAsync).toHaveBeenCalledWith({
        triggerSource: 'retry',
      })
      expect(generatedAppQuery.refetch).toHaveBeenCalled()
    })
  })

  it('treats stale enabled share as unavailable when readiness is blocked', () => {
    generatedAppQuery.data = makeGeneratedApp({
      publicShareEnabled: true,
      publicShareUrl: 'https://studio.example.test/generated-apps/public/stale',
      readiness: {
        state: 'blocked',
        canCreatePublicShare: false,
        blockingIssueCount: 1,
        warningCount: 0,
        summary: '阻断态：Gate 5 浏览器验收失败。',
        blockers: [],
        warnings: [],
      },
    })

    render(<GeneratedAppDetailPage appId="app-detail" />)

    expect(screen.getByText('门禁不可用')).toBeInTheDocument()
    expect(
      screen.getAllByText('阻断态：Gate 5 浏览器验收失败。').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: '公开分享不可用' }),
    ).toBeDisabled()
    expect(
      screen.queryByText(
        'https://studio.example.test/generated-apps/public/stale',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '重新生成' }),
    ).not.toBeInTheDocument()
  })

  it('renders acceptance scenarios, gate results, and traceability', () => {
    render(<GeneratedAppDetailPage appId="app-detail" />)

    expect(
      screen.getByText('按患者回答动态提问并生成问诊报告。'),
    ).toBeInTheDocument()
    expect(screen.getByText('完成问诊并得到报告')).toBeInTheDocument()
    expect(screen.getByText('患者打开问诊页')).toBeInTheDocument()
    expect(screen.getByText('患者回答全部问题')).toBeInTheDocument()
    expect(screen.getByText('系统展示结构化报告')).toBeInTheDocument()

    const gates = within(screen.getByTestId('generated-app-gates'))
    expect(gates.getByText('需求规格门禁')).toBeInTheDocument()
    expect(gates.getByText('浏览器验收门禁')).toBeInTheDocument()
    expect(gates.getByText('已通过')).toBeInTheDocument()
    expect(gates.getByText('Warning')).toBeInTheDocument()

    const traceability = within(
      screen.getByTestId('generated-app-traceability'),
    )
    expect(traceability.getByText('req-intake')).toBeInTheDocument()
    expect(traceability.getByText('scenario-main')).toBeInTheDocument()
    expect(traceability.getByText('evidence-browser-main')).toBeInTheDocument()
  })

  it('renders professional editor links for bound Agent and Workflow resources', () => {
    generatedAppQuery.data = makeGeneratedApp({
      agentDefinitionId: 'agent-bound-1',
      workflowDefinitionId: 'workflow-bound-1',
    })

    render(<GeneratedAppDetailPage appId="app-detail" />)

    expect(screen.getByText('agent-bound-1')).toBeInTheDocument()
    expect(screen.getByText('workflow-bound-1')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '打开 Agent 专业编辑器' }),
    ).toHaveAttribute('href', '/agents/agent-bound-1')
    expect(
      screen.getByRole('link', { name: '打开 Workflow 专业编辑器' }),
    ).toHaveAttribute('href', '/workflows/workflow-bound-1')
  })

  it('shows editor handoff draft runtime readiness as not automatically executable', () => {
    generatedAppQuery.data = makeGeneratedApp({
      workflowDefinitionId: 'workflow-editor-draft',
    })
    runtimeBindingReadinessQuery.data = {
      state: 'editor_handoff_draft',
      workflowDefinitionId: 'workflow-editor-draft',
      workflowStatus: 'draft',
      publishedVersionId: null,
      canStartWorkflowExecution: false,
      summary: '绑定 Workflow 是 Generated App 专业编辑器草稿。',
      notice:
        'Gate 7 创建的专业编辑器草稿只用于创建者精修，不会被公开提交自动执行；需要精修并发布真正 Workflow 后，公开提交才可启动 Workflow execution。',
      updatedAt: '2026-04-25T02:00:00.000Z',
    }

    render(<GeneratedAppDetailPage appId="app-detail" />)

    const panel = within(screen.getByTestId('runtime-binding-readiness'))
    expect(panel.getByText('编辑器草稿')).toBeInTheDocument()
    expect(
      panel.getByText(/不会被公开提交自动执行/),
    ).toBeInTheDocument()
    expect(
      panel.getByText('公开提交不会启动 Workflow'),
    ).toBeInTheDocument()
    expect(screen.getByText('workflow-editor-draft')).toBeInTheDocument()
  })

  it('shows published runtime readiness as able to start async Workflow execution', () => {
    generatedAppQuery.data = makeGeneratedApp({
      workflowDefinitionId: 'workflow-runtime-published',
    })
    runtimeBindingReadinessQuery.data = {
      state: 'workflow_published',
      workflowDefinitionId: 'workflow-runtime-published',
      workflowStatus: 'published',
      publishedVersionId: 'workflow-version-published',
      canStartWorkflowExecution: true,
      summary: '绑定 Workflow 已发布，可由公开提交创建异步执行。',
      notice:
        '公开提交会先保存本地 deterministic report，并尝试创建异步 Workflow execution。',
      updatedAt: '2026-04-25T02:00:00.000Z',
    }

    render(<GeneratedAppDetailPage appId="app-detail" />)

    const panel = within(screen.getByTestId('runtime-binding-readiness'))
    expect(panel.getByText('可启动 Workflow')).toBeInTheDocument()
    expect(
      panel.getByText('公开提交可创建异步执行'),
    ).toBeInTheDocument()
    expect(
      panel.getByText(/创建异步 Workflow execution/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('workflow-runtime-published'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('workflow-version-published'),
    ).not.toBeInTheDocument()
  })

  it('renders creator-only controlled workspace artifacts and selected content', async () => {
    const user = userEvent.setup()
    artifactManifestQuery.data = {
      workspace: {
        workspaceId: 'workspace-1',
        rootLabel: 'generated-app-workspaces',
        relativePath: 'tenants/tenant-1/apps/app-detail/runs/run-1',
        scaffold: 'react-vite-typescript',
        executionLevel: 'real-local-command-plan',
        materialized: true,
      },
      artifacts: [
        {
          artifactId: 'source-app-tsx',
          label: 'src/App.tsx',
          kind: 'workspace_source_file',
          path: 'src/App.tsx',
          materialized: true,
          sizeBytes: 42,
          contentType: 'text/typescript',
          readable: true,
          updatedAt: '2026-04-25T02:00:00.000Z',
        },
        {
          artifactId: 'gate-3-unit-test-report',
          label: 'Gate 3 unit test report',
          kind: 'unit_test_report',
          path: 'artifacts/gate-3/unit-test-report.json',
          materialized: false,
          sizeBytes: null,
          contentType: 'application/json',
          readable: false,
          updatedAt: null,
        },
        {
          artifactId: 'gate-3-build-output-html',
          label: 'Gate 3 build output',
          kind: 'build_output',
          path: 'dist/index.html',
          materialized: true,
          sizeBytes: 180,
          contentType: 'text/html',
          readable: true,
          updatedAt: '2026-04-25T02:00:00.000Z',
        },
      ],
      updatedAt: '2026-04-25T02:00:00.000Z',
    }
    artifactContentQuery.data = {
      artifact: artifactManifestQuery.data.artifacts[0]!,
      content: 'export function App() { return <main /> }',
      truncated: false,
    }
    buildPreviewContentQuery.data = {
      artifact: artifactManifestQuery.data.artifacts[2]!,
      content: '<!doctype html><html><body><h1>问诊助手</h1></body></html>',
      truncated: false,
    }

    render(<GeneratedAppDetailPage appId="app-detail" />)

    const panel = within(screen.getByTestId('generated-app-artifact-delivery'))
    expect(
      panel.getByText(
        'generated-app-workspaces/tenants/tenant-1/apps/app-detail/runs/run-1',
      ),
    ).toBeInTheDocument()
    expect(panel.getByText('real-local-command-plan')).toBeInTheDocument()
    expect(panel.getAllByText('src/App.tsx').length).toBeGreaterThan(0)
    expect(panel.getByText('Gate 3 unit test report')).toBeInTheDocument()
    expect(panel.getByText('Gate 3 构建预览')).toBeInTheDocument()
    expect(panel.getAllByText('dist/index.html').length).toBeGreaterThan(0)
    const buildPreviewFrame = screen.getByTitle(
      'Generated App Gate 3 构建预览',
    )
    expect(buildPreviewFrame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(buildPreviewFrame.getAttribute('sandbox')).not.toContain(
      'allow-same-origin',
    )
    expect(buildPreviewFrame).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('<h1>问诊助手</h1>'),
    )
    expect(screen.queryByText('/root')).not.toBeInTheDocument()

    await user.click(panel.getByRole('button', { name: /src\/App\.tsx/ }))

    expect(
      screen.getByText('export function App() { return <main /> }'),
    ).toBeInTheDocument()
  })

  it('keeps resource binding empty states clear when no professional resources are bound', () => {
    render(<GeneratedAppDetailPage appId="app-detail" />)

    expect(screen.getAllByText('尚未绑定')).toHaveLength(2)
    expect(screen.getByText('Deterministic only')).toBeInTheDocument()
    expect(
      screen.getByText(/只会返回本地 deterministic report/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '打开 Agent 专业编辑器' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '打开 Workflow 专业编辑器' }),
    ).not.toBeInTheDocument()
  })
})
