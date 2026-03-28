import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createWorkspace, deleteWorkspace } from './workspaceApi'
import { workspaceKeys } from './workspaceKeys'
import type { CreateWorkspacePayload } from '../types'

export function useCreateWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...workspaceKeys.all, 'create'],
    gcTime: 0,
    mutationFn: (payload: CreateWorkspacePayload) => createWorkspace(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() })
    },
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...workspaceKeys.all, 'delete'],
    gcTime: 0,
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() })
    },
  })
}
