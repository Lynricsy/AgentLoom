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
  useGeneratedAppRuntimeBindingReadiness,
  useGeneratedAppPublicSubmission,
  useGeneratedAppSubmission,
} from './generatedAppQueries'
import type {
  GeneratedAppArtifactContent,
  GeneratedAppArtifactManifest,
  GeneratedAppRuntimeBindingReadiness,
  GeneratedAppPublicSubmission,
  GeneratedAppSubmission,
} from '../types'

const {
  getGeneratedAppArtifactContentMock,
  getGeneratedAppArtifactManifestMock,
  getGeneratedAppRuntimeBindingReadinessMock,
  getGeneratedAppPublicSubmissionMock,
  getGeneratedAppSubmissionMock,
} = vi.hoisted(() => ({
  getGeneratedAppArtifactContentMock: vi.fn(),
  getGeneratedAppArtifactManifestMock: vi.fn(),
  getGeneratedAppRuntimeBindingReadinessMock: vi.fn(),
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
    appSpecVersion: 1,
    publicShareToken: 'token-snapshot',
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
    appSpecVersion: 1,
    status: 'running',
    anonymousSessionId: 'anon-public',
    input: {},
    result: null,
    report: null,
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

describe('generatedAppQueries public submission polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['pending', 'running', 'paused'] as const)(
    'public submission query enables 2s refetch when workflow execution is %s',
    async (executionStatus) => {
      const submission = makePublicSubmission({
        status: executionStatus === 'pending' ? 'received' : 'running',
        report: {
          workflowExecution: true,
          executionStatus,
          executionId: '77777777-7777-7777-8777-777777777777',
        },
      })
      getGeneratedAppPublicSubmissionMock.mockResolvedValue(submission)

      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppPublicSubmission('public-token', submission.id),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data).toEqual(submission)
      })

      const query = queryClient.getQueryCache().find({
        queryKey: generatedAppKeys.publicSubmission(
          'public-token',
          submission.id,
        ),
      }) as PublicSubmissionQueryWithRefetchInterval | undefined

      expectQueryRefetchInterval(query, 2_000)
    },
  )

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'public submission query stops refetch when workflow execution is %s',
    async (executionStatus) => {
      const submission = makePublicSubmission({
        status: executionStatus === 'completed' ? 'completed' : 'failed',
        result: {
          workflowExecution: true,
          executionStatus,
          executionId: '55555555-5555-4555-8555-555555555557',
        },
      })
      getGeneratedAppPublicSubmissionMock.mockResolvedValue(submission)

      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppPublicSubmission('public-token', submission.id),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data).toEqual(submission)
      })

      const query = queryClient.getQueryCache().find({
        queryKey: generatedAppKeys.publicSubmission(
          'public-token',
          submission.id,
        ),
      }) as PublicSubmissionQueryWithRefetchInterval | undefined

      expectQueryRefetchInterval(query, false)
    },
  )

  it('public submission query stops refetch when no workflow handoff exists', async () => {
    const submission = makePublicSubmission({
      status: 'completed',
      result: { summary: 'deterministic report only' },
      report: { title: '业务报告' },
    })
    getGeneratedAppPublicSubmissionMock.mockResolvedValue(submission)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppPublicSubmission('public-token', submission.id),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(submission)
    })

    const query = queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.publicSubmission(
        'public-token',
        submission.id,
      ),
    }) as PublicSubmissionQueryWithRefetchInterval | undefined

    expectQueryRefetchInterval(query, false)
  })
})

describe('generatedAppQueries creator submission polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['pending', 'running', 'paused'] as const)(
    'creator submission query enables 2s refetch when workflow execution is %s',
    async (executionStatus) => {
      const submission = makeCreatorSubmission({
        status: executionStatus === 'pending' ? 'received' : 'running',
        report: {
          workflowExecution: true,
          executionStatus,
          executionId: '77777777-7777-7777-8777-777777777777',
        },
      })
      getGeneratedAppSubmissionMock.mockResolvedValue(submission)

      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppSubmission(submission.appId, submission.id),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data).toEqual(submission)
      })

      const query = queryClient.getQueryCache().find({
        queryKey: generatedAppKeys.submissionDetail(
          submission.appId,
          submission.id,
        ),
      }) as CreatorSubmissionQueryWithRefetchInterval | undefined

      expect(result.current.dataUpdatedAt).toBeGreaterThan(0)
      expectQueryRefetchInterval(query, 2_000)
    },
  )

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'creator submission query stops refetch when workflow execution is %s',
    async (executionStatus) => {
      const submission = makeCreatorSubmission({
        status: executionStatus === 'completed' ? 'completed' : 'failed',
        result: {
          workflowExecution: true,
          executionStatus,
          executionId: '77777777-7777-7777-8777-777777777777',
        },
      })
      getGeneratedAppSubmissionMock.mockResolvedValue(submission)

      const { Wrapper, queryClient } = createWrapper()
      const { result } = renderHook(
        () => useGeneratedAppSubmission(submission.appId, submission.id),
        { wrapper: Wrapper },
      )

      await waitFor(() => {
        expect(result.current.data).toEqual(submission)
      })

      const query = queryClient.getQueryCache().find({
        queryKey: generatedAppKeys.submissionDetail(
          submission.appId,
          submission.id,
        ),
      }) as CreatorSubmissionQueryWithRefetchInterval | undefined

      expectQueryRefetchInterval(query, false)
    },
  )

  it('creator submission query stops refetch when workflow execution is unavailable', async () => {
    const submission = makeCreatorSubmission({
      status: 'failed',
      report: {
        workflowExecution: true,
        executionStatus: null,
        executionId: null,
        workflowExecutionNotStartedReason: 'workflow-execution-unavailable',
      },
    })
    getGeneratedAppSubmissionMock.mockResolvedValue(submission)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppSubmission(submission.appId, submission.id),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(submission)
    })

    const query = queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.submissionDetail(
        submission.appId,
        submission.id,
      ),
    }) as CreatorSubmissionQueryWithRefetchInterval | undefined

    expectQueryRefetchInterval(query, false)
  })

  it('creator submission query treats report handoff as authoritative over result handoff', async () => {
    const submission = makeCreatorSubmission({
      status: 'completed',
      result: {
        workflowExecution: true,
        executionStatus: 'running',
        executionId: '77777777-7777-7777-8777-777777777777',
      },
      report: {
        workflowExecution: true,
        executionStatus: 'completed',
        executionId: '77777777-7777-7777-8777-777777777777',
      },
    })
    getGeneratedAppSubmissionMock.mockResolvedValue(submission)

    const { Wrapper, queryClient } = createWrapper()
    const { result } = renderHook(
      () => useGeneratedAppSubmission(submission.appId, submission.id),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(submission)
    })

    const query = queryClient.getQueryCache().find({
      queryKey: generatedAppKeys.submissionDetail(
        submission.appId,
        submission.id,
      ),
    }) as CreatorSubmissionQueryWithRefetchInterval | undefined

    expectQueryRefetchInterval(query, false)
  })
})
