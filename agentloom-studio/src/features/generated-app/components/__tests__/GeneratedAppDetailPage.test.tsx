import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedApp, GeneratedAppReadinessState } from '../../types'

const {
  disableShareMutation,
  enableShareMutation,
  generatedAppQuery,
  regenerateShareMutation,
  useGeneratedAppMock,
} = vi.hoisted(() => ({
  disableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  enableShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  generatedAppQuery: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  regenerateShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  useGeneratedAppMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useDisableGeneratedAppPublicShare: () => disableShareMutation,
  useEnableGeneratedAppPublicShare: (appId: string) => {
    useGeneratedAppMock(`enable:${appId}`)
    return enableShareMutation
  },
  useGeneratedApp: (appId: string | undefined) => {
    useGeneratedAppMock(`detail:${appId ?? ''}`)
    return generatedAppQuery
  },
  useRegenerateGeneratedAppPublicShare: (appId: string) => {
    useGeneratedAppMock(`regenerate:${appId}`)
    return regenerateShareMutation
  },
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
    params?: { appId?: string }
    children: React.ReactNode
  }) => (
    <a href={to.replace('$appId', params?.appId ?? '')} {...rest}>
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
    disableShareMutation.mutateAsync = vi.fn()
    disableShareMutation.isPending = false
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

      expect(screen.getByText(summary)).toBeInTheDocument()
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
      screen.getByText('阻断态：Gate 5 浏览器验收失败。'),
    ).toBeInTheDocument()
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
})
