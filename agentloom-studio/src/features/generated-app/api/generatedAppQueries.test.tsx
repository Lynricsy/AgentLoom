import {
  QueryClient,
  QueryClientProvider,
  type Query,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generatedAppKeys } from './generatedAppKeys'
import {
  useGeneratedAppArtifactContent,
  useGeneratedAppArtifactManifest,
  useGeneratedAppGenerationRun,
  useGeneratedAppRuntimeBindingReadiness,
  useGeneratedAppPublicSubmission,
  useGeneratedAppSubmission,
} from './generatedAppQueries'
import type {
  GeneratedAppArtifactContent,
  GeneratedAppArtifactManifest,
  GeneratedAppGenerationRun,
  GeneratedAppRuntimeBindingReadiness,
  GeneratedAppPublicSubmission,
  GeneratedAppSubmission,
} from '../types'

const {
  getGeneratedAppArtifactContentMock,
  getGeneratedAppArtifactManifestMock,
  getGeneratedAppRuntimeBindingReadinessMock,
  getGeneratedAppGenerationRunMock,
  getGeneratedAppPublicSubmissionMock,
  getGeneratedAppSubmissionMock,
} = vi.hoisted(() => ({
  getGeneratedAppArtifactContentMock: vi.fn(),
  getGeneratedAppArtifactManifestMock: vi.fn(),
  getGeneratedAppRuntimeBindingReadinessMock: vi.fn(),
  getGeneratedAppGenerationRunMock: vi.fn(),
  getGeneratedAppPublicSubmissionMock: vi.fn(),
  getGeneratedAppSubmissionMock: vi.fn(),
}))

vi.mock('./generatedAppApi', () => ({
  getGeneratedApp: vi.fn(),
  getGeneratedAppArtifactContent: getGeneratedAppArtifactContentMock,
  getGeneratedAppArtifactManifest: getGeneratedAppArtifactManifestMock,
  getGeneratedAppRuntimeBindingReadiness:
    getGeneratedAppRuntimeBindingReadinessMock,
  getGeneratedAppSubmission: getGeneratedAppSubmissionMock,
  getGeneratedAppGenerationRun: getGeneratedAppGenerationRunMock,
  getGeneratedAppPublicSubmission: getGeneratedAppPublicSubmissionMock,
  getGeneratedAppPublicRuntime: vi.fn(),
  listGeneratedAppGateRuns: vi.fn(),
  listGeneratedAppGenerationRuns: vi.fn(),
  listGeneratedAppRepairAttempts: vi.fn(),
  listGeneratedAppSubmissions: vi.fn(),
  listGeneratedApps: vi.fn(),
}))

type PublicSubmissionQuery = Query<unknown, Error, unknown, readonly unknown[]>
type PublicSubmissionQueryWithRefetchInterval = PublicSubmissionQuery & {
  options: PublicSubmissionQuery['options'] & {
    refetchInterval?:
      | ((query: PublicSubmissionQuery) => false | number)
      | false
      | number
  }
}

type CreatorSubmissionQuery = Query<unknown, Error, unknown, readonly unknown[]>
type CreatorSubmissionQueryWithRefetchInterval = CreatorSubmissionQuery & {
  options: CreatorSubmissionQuery['options'] & {
    refetchInterval?:
      | ((query: CreatorSubmissionQuery) => false | number)
      | false
      | number
  }
}
type SubmissionQueryWithRefetchInterval =
  | PublicSubmissionQueryWithRefetchInterval
  | CreatorSubmissionQueryWithRefetchInterval

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  }
}

function expectQueryRefetchInterval(
  query: SubmissionQueryWithRefetchInterval | undefined,
  expected: false | number,
) {
  expect(typeof query?.options.refetchInterval).toBe('function')

  if (!query || typeof query.options.refetchInterval !== 'function') {
    throw new Error('expected submission refetchInterval function')
  }

  expect(query.options.refetchInterval(query)).toBe(expected)
}

function makeCreatorSubmission(
  overrides: Partial<GeneratedAppSubmission> = {},
): GeneratedAppSubmission {
  return {
    id: 'submission-creator',
    tenantId: 'tenant-creator',
    appId: 'app-creator',
    appSpecVersion: 2,
    publicShareToken: 'token-snapshot',
    origin: 'public',
    generationRunId: null,
    status: 'running',
    anonymousSessionId: 'anon-creator',
    input: {},
    result: null,
    report: null,
    errorMessage: null,
    createdAt: '2026-04-25T02:00:00.000Z',
    updatedAt: '2026-04-25T02:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makePublicSubmission(
  overrides: Partial<GeneratedAppPublicSubmission> = {},
): GeneratedAppPublicSubmission {
  return {
    id: 'submission-public',
    appId: 'app-public',
    appSpecVersion: 2,
    status: 'running',
    anonymousSessionId: 'anon-public',
    input: {},
    result: null,
    errorMessage: null,
    createdAt: '2026-04-25T02:00:00.000Z',
    updatedAt: '2026-04-25T02:00:00.000Z',
    ...overrides,
  }
}

function makeRuntimeBindingReadiness(
  overrides: Partial<GeneratedAppRuntimeBindingReadiness> = {},
): GeneratedAppRuntimeBindingReadiness {
  return {
    state: 'workflow_published',
    workflowDefinitionId: 'workflow-1',
    workflowStatus: 'published',
    publishedVersionId: 'version-1',
    pinnedVersionId: 'version-1',
    canStartWorkflowExecution: true,
    summary: '绑定 Workflow 已发布。',
    notice: '公开提交可创建异步 Workflow execution。',
    updatedAt: '2026-04-25T02:00:00.000Z',
    ...overrides,
  }
}

function makeArtifactManifest(
  overrides: Partial<GeneratedAppArtifactManifest> = {},
): GeneratedAppArtifactManifest {
  return {
    workspace: {
      workspaceId: 'generated-app-workspace',
      rootLabel: 'generated-app-workspaces',
      relativePath: 'tenants/tenant-1/apps/app-1/runs/run-1',
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
        sizeBytes: 64,
        contentType: 'text/typescript',
        readable: true,
        updatedAt: '2026-04-25T02:00:00.000Z',
      },
    ],
    updatedAt: '2026-04-25T02:00:00.000Z',
    ...overrides,
  }
}

function makeArtifactContent(
  overrides: Partial<GeneratedAppArtifactContent> = {},
): GeneratedAppArtifactContent {
  const manifest = makeArtifactManifest()
  const artifact = manifest.artifacts[0]!

  return {
    artifact,
    content: 'export function App() {}',
    truncated: false,
    ...overrides,
  }
}

describe('generatedAppQueries runtime binding readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the runtime binding readiness query key when app id is present', async () => {
    const readiness = makeRuntimeBindingReadiness()
    getGeneratedAppRuntimeBindingReadinessMock.mockResolvedValue(readiness)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppRuntimeBindingReadiness('app-runtime'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(readiness)
    })

    expect(getGeneratedAppRuntimeBindingReadinessMock).toHaveBeenCalledWith(
      'app-runtime',
    )
    expect(
      queryClient.getQueryData(
        generatedAppKeys.runtimeBindingReadiness('app-runtime'),
      ),
    ).toBe(readiness)
  })

  it('stays disabled when app id is empty', () => {
    const { Wrapper } = createWrapper()

    const { result } = renderHook(
      () => useGeneratedAppRuntimeBindingReadiness(undefined),
      { wrapper: Wrapper },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(getGeneratedAppRuntimeBindingReadinessMock).not.toHaveBeenCalled()
  })
})

describe('generatedAppQueries artifact delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the artifact manifest query key when app id is present', async () => {
    const manifest = makeArtifactManifest()
    getGeneratedAppArtifactManifestMock.mockResolvedValue(manifest)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppArtifactManifest('app-artifacts'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(manifest)
    })

    expect(getGeneratedAppArtifactManifestMock).toHaveBeenCalledWith(
      'app-artifacts',
    )
    expect(
      queryClient.getQueryData(
        generatedAppKeys.artifactManifest('app-artifacts'),
      ),
    ).toBe(manifest)
  })

  it('keeps artifact manifest disabled when app id is empty', () => {
    const { Wrapper } = createWrapper()

    const { result } = renderHook(
      () => useGeneratedAppArtifactManifest(undefined),
      { wrapper: Wrapper },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(getGeneratedAppArtifactManifestMock).not.toHaveBeenCalled()
  })

  it('uses app id and artifact id in artifact content query key', async () => {
    const content = makeArtifactContent()
    getGeneratedAppArtifactContentMock.mockResolvedValue(content)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppArtifactContent('app-artifacts', 'source-app-tsx'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(content)
    })

    expect(getGeneratedAppArtifactContentMock).toHaveBeenCalledWith(
      'app-artifacts',
      'source-app-tsx',
    )
    expect(
      queryClient.getQueryData(
        generatedAppKeys.artifactContent('app-artifacts', 'source-app-tsx'),
      ),
    ).toBe(content)
  })

  it('keeps artifact content disabled until both app id and artifact id exist', () => {
    const { Wrapper } = createWrapper()

    const { result } = renderHook(
      () => useGeneratedAppArtifactContent('app-artifacts', undefined),
      { wrapper: Wrapper },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(getGeneratedAppArtifactContentMock).not.toHaveBeenCalled()
  })
})

const RUNNING_RESULT = {
  status: 'running' as const,
  sections: [],
  publicError: null,
}

describe('generatedAppQueries public submission polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function renderPublicSubmission(submission: GeneratedAppPublicSubmission) {
    getGeneratedAppPublicSubmissionMock.mockResolvedValue(submission)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppPublicSubmission('public-token', submission.id),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(submission)
    })

    return queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.publicSubmission('public-token', submission.id),
    }) as PublicSubmissionQueryWithRefetchInterval | undefined
  }

  it.each([
    ['received', null],
    ['running', RUNNING_RESULT],
  ] as const)(
    '提交为 %s 时每 2 秒轮询，由服务端读取时刷新执行结果',
    async (status, result) => {
      const query = await renderPublicSubmission(
        makePublicSubmission({ status, result }),
      )

      expectQueryRefetchInterval(query, 2_000)
    },
  )

  it.each(['completed', 'failed'] as const)(
    '提交为 %s 时停止轮询',
    async (status) => {
      const query = await renderPublicSubmission(
        makePublicSubmission({
          status,
          result: { status, sections: [], publicError: null },
        }),
      )

      expectQueryRefetchInterval(query, false)
    },
  )
})

describe('generatedAppQueries creator submission polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function renderCreatorSubmission(submission: GeneratedAppSubmission) {
    getGeneratedAppSubmissionMock.mockResolvedValue(submission)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppSubmission(submission.appId, submission.id),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(submission)
    })

    return queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.submissionDetail(
        submission.appId,
        submission.id,
      ),
    }) as CreatorSubmissionQueryWithRefetchInterval | undefined
  }

  it.each(['received', 'running'] as const)(
    '提交为 %s 时每 2 秒轮询',
    async (status) => {
      const query = await renderCreatorSubmission(
        makeCreatorSubmission({
          status,
          result: { ...RUNNING_RESULT },
          report: {
            kind: 'generated-app-runtime-execution',
            executionId: '77777777-7777-7777-8777-777777777777',
          },
        }),
      )

      expectQueryRefetchInterval(query, 2_000)
    },
  )

  it.each(['completed', 'failed'] as const)(
    '提交为 %s 时停止轮询',
    async (status) => {
      const query = await renderCreatorSubmission(
        makeCreatorSubmission({ status }),
      )

      expectQueryRefetchInterval(query, false)
    },
  )
})

describe('generatedAppQueries generation run polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeRun(
    overrides: Partial<GeneratedAppGenerationRun> = {},
  ): GeneratedAppGenerationRun {
    return {
      id: 'run-1',
      tenantId: 'tenant-1',
      appId: 'app-1',
      runNumber: 1,
      status: 'running',
      triggerSource: 'initial',
      maxRepairAttempts: 3,
      maxRuntimeSeconds: 1800,
      summary: '生成运行执行中：Gate 0 需求规格。',
      failureReason: null,
      startedAt: '2026-04-25T03:00:00.000Z',
      completedAt: null,
      createdBy: 'user-1',
      createdAt: '2026-04-25T03:00:00.000Z',
      updatedAt: '2026-04-25T03:00:00.000Z',
      ...overrides,
    }
  }

  function findRunQuery(queryClient: QueryClient) {
    return queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.generationRunDetail('app-1', 'run-1'),
    }) as CreatorSubmissionQueryWithRefetchInterval | undefined
  }

  it.each(['queued', 'running', 'repairing'] as const)(
    '运行为 %s 时每 3 秒轮询',
    async (status) => {
      getGeneratedAppGenerationRunMock.mockResolvedValue(makeRun({ status }))
      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppGenerationRun('app-1', 'run-1'),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data?.status).toBe(status)
      })
      expect(getGeneratedAppGenerationRunMock).toHaveBeenCalledWith(
        'app-1',
        'run-1',
      )
      expectQueryRefetchInterval(findRunQuery(queryClient), 3_000)
    },
  )

  it.each(['passed', 'failed', 'cancelled'] as const)(
    '运行为 %s 时停止轮询',
    async (status) => {
      getGeneratedAppGenerationRunMock.mockResolvedValue(makeRun({ status }))
      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppGenerationRun('app-1', 'run-1'),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data?.status).toBe(status)
      })
      expectQueryRefetchInterval(findRunQuery(queryClient), false)
    },
  )

  it('Gate 推进时只刷新应用详情，进入终态时刷新整个应用子树', async () => {
    getGeneratedAppGenerationRunMock.mockResolvedValue(makeRun())
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(
      () => useGeneratedAppGenerationRun('app-1', 'run-1'),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data?.status).toBe('running')
    })
    expect(invalidateSpy).not.toHaveBeenCalled()

    getGeneratedAppGenerationRunMock.mockResolvedValue(
      makeRun({
        summary: 'gate-0 通过：AppSpec 已生成。',
        updatedAt: '2026-04-25T03:01:00.000Z',
      }),
    )
    await result.current.refetch()

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: generatedAppKeys.detail('app-1'),
        exact: true,
      })
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: generatedAppKeys.lists(),
    })

    invalidateSpy.mockClear()
    getGeneratedAppGenerationRunMock.mockResolvedValue(
      makeRun({
        status: 'passed',
        summary: '生成运行通过。',
        completedAt: '2026-04-25T03:05:00.000Z',
        updatedAt: '2026-04-25T03:05:00.000Z',
      }),
    )
    await result.current.refetch()

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: generatedAppKeys.detail('app-1'),
        exact: false,
      })
    })
  })
})
