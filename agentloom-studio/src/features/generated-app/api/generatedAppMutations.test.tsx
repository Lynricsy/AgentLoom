import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEnableGeneratedAppPublicShare } from './generatedAppMutations'
import { generatedAppKeys } from './generatedAppKeys'
import type { GeneratedApp } from '../types'

const {
  createGeneratedAppMock,
  disableGeneratedAppPublicShareMock,
  enableGeneratedAppPublicShareMock,
  recordGeneratedAppGateResultsMock,
  regenerateGeneratedAppPublicShareMock,
} = vi.hoisted(() => ({
  createGeneratedAppMock: vi.fn(),
  disableGeneratedAppPublicShareMock: vi.fn(),
  enableGeneratedAppPublicShareMock: vi.fn(),
  recordGeneratedAppGateResultsMock: vi.fn(),
  regenerateGeneratedAppPublicShareMock: vi.fn(),
}))

vi.mock('./generatedAppApi', () => ({
  createGeneratedApp: createGeneratedAppMock,
  disableGeneratedAppPublicShare: disableGeneratedAppPublicShareMock,
  enableGeneratedAppPublicShare: enableGeneratedAppPublicShareMock,
  recordGeneratedAppGateResults: recordGeneratedAppGateResultsMock,
  regenerateGeneratedAppPublicShare: regenerateGeneratedAppPublicShareMock,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return { queryClient, Wrapper }
}

function makeGeneratedApp(overrides: Partial<GeneratedApp> = {}): GeneratedApp {
  return {
    id: 'app-1',
    tenantId: 'tenant-1',
    prompt: '自动化中医问诊系统',
    appName: '自动化中医问诊系统',
    description: '围绕需求生成的 AppSpec 初稿。',
    status: 'published',
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
      state: 'publish_candidate',
      canCreatePublicShare: true,
      blockingIssueCount: 0,
      warningCount: 0,
      summary: '全部阻断门禁已通过且没有 warning。',
      blockers: [],
      warnings: [],
    },
    preview: {
      previewUrl: null,
      sourceArtifactUrl: null,
      testReportUrl: null,
    },
    agentDefinitionId: null,
    workflowDefinitionId: null,
    pluginIds: [],
    publicShareEnabled: true,
    publicShareToken: 'token-1',
    publicShareUrl: 'https://example.com/generated-apps/public/token-1',
    publicShareCreatedAt: '2026-04-25T00:00:00.000Z',
    publicShareDisabledAt: null,
    publicViewCount: 0,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T01:00:00.000Z',
    ...overrides,
  }
}

describe('generatedAppMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the enabled public share app into detail cache and invalidates generated app lists', async () => {
    const app = makeGeneratedApp({ id: 'app-share' })
    enableGeneratedAppPublicShareMock.mockResolvedValue(app)

    const { queryClient, Wrapper } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useEnableGeneratedAppPublicShare('app-share'),
      {
        wrapper: Wrapper,
      },
    )

    await act(async () => {
      const data = await result.current.mutateAsync()
      expect(data).toEqual(app)
    })

    expect(enableGeneratedAppPublicShareMock).toHaveBeenCalledWith('app-share')

    await waitFor(() => {
      expect(queryClient.getQueryData(generatedAppKeys.detail('app-share'))).toBe(
        app,
      )
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: generatedAppKeys.lists(),
      })
    })
  })
})
