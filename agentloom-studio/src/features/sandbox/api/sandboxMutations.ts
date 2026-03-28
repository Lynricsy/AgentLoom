import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createSandbox,
  stopSandbox,
  startSandbox,
  deleteSandbox,
} from './sandboxApi'
import { sandboxKeys } from './sandboxKeys'
import type {
  CreateSandboxPayload,
  SandboxListResponse,
  SandboxSession,
  SandboxStatus,
} from '../types'

type SandboxMutationContext = {
  previousListQueries: Array<[readonly unknown[], SandboxListResponse | undefined]>
  previousPersistent: SandboxSession[] | undefined
}

function updateSandboxStatus(
  session: SandboxSession,
  status: SandboxStatus,
): SandboxSession {
  if (status === 'creating') {
    return {
      ...session,
      status,
      containerId: null,
      startedAt: null,
      stoppedAt: null,
    }
  }

  if (status === 'stopping') {
    return {
      ...session,
      status,
    }
  }

  return {
    ...session,
    status,
  }
}

function patchSandboxLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (session: SandboxSession) => SandboxSession | null,
) {
  queryClient.setQueriesData<SandboxListResponse>(
    { queryKey: sandboxKeys.lists() },
    (current) => {
      if (!current) return current

      return {
        ...current,
        data: current.data
          .map((session) => updater(session))
          .filter((session): session is SandboxSession => session !== null),
      }
    },
  )
}

function patchPersistentSandboxes(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (session: SandboxSession) => SandboxSession | null,
) {
  queryClient.setQueryData<SandboxSession[]>(
    sandboxKeys.persistent(),
    (current) => {
      if (!current) return current

      return current
        .map((session) => updater(session))
        .filter((session): session is SandboxSession => session !== null)
    },
  )
}

function restoreSandboxCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  context: SandboxMutationContext | undefined,
) {
  if (!context) return

  for (const [queryKey, data] of context.previousListQueries) {
    queryClient.setQueryData(queryKey, data)
  }

  queryClient.setQueryData(sandboxKeys.persistent(), context.previousPersistent)
}

async function invalidateSandboxQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: sandboxKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: sandboxKeys.persistent() }),
    sessionId
      ? queryClient.invalidateQueries({ queryKey: sandboxKeys.stats(sessionId) })
      : Promise.resolve(),
  ])
}

export function useCreateSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'create'],
    gcTime: 0,
    mutationFn: (payload: CreateSandboxPayload) => createSandbox(payload),
    onSuccess: async () => {
      await invalidateSandboxQueries(queryClient)
    },
  })
}

export function useStopSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'stop'],
    gcTime: 0,
    mutationFn: (sessionId: string) => stopSandbox(sessionId),
    onMutate: async (sessionId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sandboxKeys.lists() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.persistent() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.stats(sessionId) }),
      ])

      const context: SandboxMutationContext = {
        previousListQueries:
          queryClient.getQueriesData<SandboxListResponse>({
            queryKey: sandboxKeys.lists(),
          }),
        previousPersistent:
          queryClient.getQueryData<SandboxSession[]>(sandboxKeys.persistent()),
      }

      patchSandboxLists(queryClient, (session) =>
        session.id === sessionId
          ? updateSandboxStatus(session, 'stopping')
          : session,
      )
      patchPersistentSandboxes(queryClient, (session) =>
        session.id === sessionId
          ? updateSandboxStatus(session, 'stopping')
          : session,
      )

      return context
    },
    onError: (_error, _sessionId, context) => {
      restoreSandboxCaches(queryClient, context)
    },
    onSettled: async (_data, _error, sessionId) => {
      await invalidateSandboxQueries(queryClient, sessionId)
    },
  })
}

export function useStartSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'start'],
    gcTime: 0,
    mutationFn: (sessionId: string) => startSandbox(sessionId),
    onMutate: async (sessionId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sandboxKeys.lists() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.persistent() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.stats(sessionId) }),
      ])

      const context: SandboxMutationContext = {
        previousListQueries:
          queryClient.getQueriesData<SandboxListResponse>({
            queryKey: sandboxKeys.lists(),
          }),
        previousPersistent:
          queryClient.getQueryData<SandboxSession[]>(sandboxKeys.persistent()),
      }

      patchSandboxLists(queryClient, (session) =>
        session.id === sessionId
          ? updateSandboxStatus(session, 'creating')
          : session,
      )
      patchPersistentSandboxes(queryClient, (session) =>
        session.id === sessionId
          ? updateSandboxStatus(session, 'creating')
          : session,
      )

      return context
    },
    onError: (_error, _sessionId, context) => {
      restoreSandboxCaches(queryClient, context)
    },
    onSettled: async (_data, _error, sessionId) => {
      await invalidateSandboxQueries(queryClient, sessionId)
    },
  })
}

export function useDeleteSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'delete'],
    gcTime: 0,
    mutationFn: (sessionId: string) => deleteSandbox(sessionId),
    onMutate: async (sessionId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sandboxKeys.lists() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.persistent() }),
        queryClient.cancelQueries({ queryKey: sandboxKeys.stats(sessionId) }),
      ])

      const context: SandboxMutationContext = {
        previousListQueries:
          queryClient.getQueriesData<SandboxListResponse>({
            queryKey: sandboxKeys.lists(),
          }),
        previousPersistent:
          queryClient.getQueryData<SandboxSession[]>(sandboxKeys.persistent()),
      }

      patchSandboxLists(queryClient, (session) =>
        session.id === sessionId ? null : session,
      )
      patchPersistentSandboxes(queryClient, (session) =>
        session.id === sessionId ? null : session,
      )
      queryClient.removeQueries({ queryKey: sandboxKeys.stats(sessionId) })

      return context
    },
    onError: (_error, _sessionId, context) => {
      restoreSandboxCaches(queryClient, context)
    },
    onSettled: async (_data, _error, sessionId) => {
      await invalidateSandboxQueries(queryClient, sessionId)
    },
  })
}
