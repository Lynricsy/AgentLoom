import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createMemoryInstance,
  updateMemoryInstance,
  deleteMemoryInstance,
  createNodeVersion,
  rollbackNodeVersion,
  addGlossaryKeyword,
  removeGlossaryKeyword,
} from './memoryInstanceApi'
import { memoryInstanceKeys } from './memoryInstanceKeys'
import type {
  CreateMemoryInstancePayload,
  UpdateMemoryInstancePayload,
} from '../types'

export function useCreateMemoryInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'create'],
    gcTime: 0,
    mutationFn: (payload: CreateMemoryInstancePayload) =>
      createMemoryInstance(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryInstanceKeys.lists() })
    },
  })
}

export function useUpdateMemoryInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'update'],
    gcTime: 0,
    mutationFn: ({ id, payload }: { id: string; payload: UpdateMemoryInstancePayload }) =>
      updateMemoryInstance(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryInstanceKeys.all })
    },
  })
}

export function useDeleteMemoryInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'delete'],
    gcTime: 0,
    mutationFn: (id: string) => deleteMemoryInstance(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryInstanceKeys.lists() })
    },
  })
}

// --- Browse mutations ---

export function useCreateNodeVersion(instanceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'create-version', instanceId],
    gcTime: 0,
    mutationFn: ({
      nodeId,
      payload,
    }: {
      nodeId: string
      payload: { content?: string; priority?: number; disclosure?: string; mode?: string }
    }) => createNodeVersion(instanceId, nodeId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.all,
        predicate: (query) => {
          const key = query.queryKey
          return (
            key.includes('browse') ||
            key.includes('versions') ||
            key.includes('search')
          )
        },
      })
    },
  })
}

export function useRollbackNodeVersion(instanceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'rollback', instanceId],
    gcTime: 0,
    mutationFn: ({ nodeId, versionId }: { nodeId: string; versionId: string }) =>
      rollbackNodeVersion(instanceId, nodeId, versionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.all,
      })
    },
  })
}

export function useAddGlossaryKeyword(instanceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'add-keyword', instanceId],
    gcTime: 0,
    mutationFn: ({ nodeId, keyword }: { nodeId: string; keyword: string }) =>
      addGlossaryKeyword(instanceId, nodeId, keyword),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.all,
      })
    },
  })
}

export function useRemoveGlossaryKeyword(instanceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...memoryInstanceKeys.all, 'remove-keyword', instanceId],
    gcTime: 0,
    mutationFn: ({ nodeId, keyword }: { nodeId: string; keyword: string }) =>
      removeGlossaryKeyword(instanceId, nodeId, keyword),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.all,
      })
    },
  })
}
