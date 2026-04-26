import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GeneratedApp } from '../../types'

const {
  createMutation,
  disableShareMutation,
  enableShareMutation,
  generatedAppsQuery,
  regenerateShareMutation,
  notifyMock,
  useEnableGeneratedAppPublicShareMock,
} = vi.hoisted(() => ({
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
  generatedAppsQuery: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  regenerateShareMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  notifyMock: vi.fn(),
  useEnableGeneratedAppPublicShareMock: vi.fn(),
}))

vi.mock('../../api', () => ({
  useCreateGeneratedApp: () => createMutation,
  useDisableGeneratedAppPublicShare: () => disableShareMutation,
  useEnableGeneratedAppPublicShare: (appId: string) => {
    useEnableGeneratedAppPublicShareMock(appId)
    return enableShareMutation
  },
  useGeneratedApps: () => generatedAppsQuery,
  useRegenerateGeneratedAppPublicShare: () => regenerateShareMutation,
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
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '围绕需求生成的 AppSpec 初稿。',
      userGoal: '自动化中医问诊系统',
      actors: ['创建者', '终端用户'],
      coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
      pages: [
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '让终端用户使用业务应用。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: [],
      acceptanceScenarios: [],
      traceability: [],
    },
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

  it('creates a generated app from a one-sentence prompt and clears the input', async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockResolvedValue(makeGeneratedApp())

    renderWithProviders(<GeneratedAppListPage />)

    const input = screen.getByLabelText('一句话描述你要的应用')
    await user.type(input, '自动化中医问诊系统')
    await user.click(screen.getByRole('button', { name: '创建应用' }))

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        prompt: '自动化中医问诊系统',
      })
    })
    expect(input).toHaveValue('')
  })
})
