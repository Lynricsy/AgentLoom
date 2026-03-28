import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createMemoryInstance,
  updateMemoryInstance,
  deleteMemoryInstance,
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
