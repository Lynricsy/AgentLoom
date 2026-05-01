import {
  QueryClient,
  QueryClientProvider,
  type Query,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generatedAppKeys } from './generatedAppKeys'
import { useGeneratedAppPublicSubmission } from './generatedAppQueries'
import type { GeneratedAppPublicSubmission } from '../types'

const { getGeneratedAppPublicSubmissionMock } = vi.hoisted(() => ({
  getGeneratedAppPublicSubmissionMock: vi.fn(),
}))

vi.mock('./generatedAppApi', () => ({
  getGeneratedApp: vi.fn(),
  getGeneratedAppSubmission: vi.fn(),
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

describe('generatedAppQueries public submission polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['pending', 'running'] as const)(
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

      expect(typeof query?.options.refetchInterval).toBe('function')

      if (!query || typeof query.options.refetchInterval !== 'function') {
        throw new Error('expected public submission refetchInterval function')
      }

      expect(query.options.refetchInterval(query)).toBe(2_000)
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

      expect(typeof query?.options.refetchInterval).toBe('function')

      if (!query || typeof query.options.refetchInterval !== 'function') {
        throw new Error('expected public submission refetchInterval function')
      }

      expect(query.options.refetchInterval(query)).toBe(false)
    },
  )
})
