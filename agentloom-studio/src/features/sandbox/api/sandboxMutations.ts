import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createSandbox,
  stopSandbox,
  startSandbox,
  deleteSandbox,
} from './sandboxApi'
import { sandboxKeys } from './sandboxKeys'
import type { CreateSandboxPayload } from '../types'

export function useCreateSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'create'],
    gcTime: 0,
    mutationFn: (payload: CreateSandboxPayload) => createSandbox(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.lists() })
    },
  })
}

export function useStopSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'stop'],
    gcTime: 0,
    mutationFn: (sessionId: string) => stopSandbox(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.lists() })
    },
  })
}

export function useStartSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'start'],
    gcTime: 0,
    mutationFn: (sessionId: string) => startSandbox(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.lists() })
    },
  })
}

export function useDeleteSandbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...sandboxKeys.all, 'delete'],
    gcTime: 0,
    mutationFn: (sessionId: string) => deleteSandbox(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sandboxKeys.lists() })
    },
  })
}
