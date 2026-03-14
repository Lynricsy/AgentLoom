import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTrigger,
  deleteTrigger,
  fetchTriggerById,
  fetchTriggerHistory,
  fetchTriggers,
  toggleTrigger,
  updateTrigger,
} from './triggerApi'
import { triggerKeys } from './triggerKeys'
import type {
  CreateTriggerData,
  ListTriggersParams,
  TriggerHistoryParams,
  UpdateTriggerData,
} from '../types'

const TRIGGER_STALE_TIME = 30 * 1000
const TRIGGER_GC_TIME = TRIGGER_STALE_TIME

export function useTriggers(
  workflowId: string,
  params: ListTriggersParams = {},
) {
  return useQuery({
    queryKey: triggerKeys.list(workflowId, params as Record<string, unknown>),
    queryFn: () => fetchTriggers(workflowId, params),
    enabled: !!workflowId,
    staleTime: TRIGGER_STALE_TIME,
    gcTime: TRIGGER_GC_TIME,
  })
}

export function useTriggerById(
  workflowId: string,
  triggerId?: string,
) {
  return useQuery({
    queryKey: triggerKeys.detail(workflowId, triggerId ?? 'unknown'),
    queryFn: () => {
      if (!triggerId) {
        throw new Error('triggerId is required')
      }

      return fetchTriggerById(workflowId, triggerId)
    },
    enabled: !!workflowId && !!triggerId,
    staleTime: TRIGGER_STALE_TIME,
    gcTime: TRIGGER_GC_TIME,
  })
}

export function useCreateTrigger(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...triggerKeys.all, 'create', workflowId],
    mutationFn: (data: CreateTriggerData) => createTrigger(workflowId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.lists() })
    },
    gcTime: 0,
  })
}

export function useUpdateTrigger(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...triggerKeys.all, 'update', workflowId],
    mutationFn: ({
      triggerId,
      data,
    }: {
      triggerId: string
      data: UpdateTriggerData
    }) => updateTrigger(workflowId, triggerId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.all })
    },
    gcTime: 0,
  })
}

export function useDeleteTrigger(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...triggerKeys.all, 'delete', workflowId],
    mutationFn: (triggerId: string) => deleteTrigger(workflowId, triggerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.lists() })
    },
    gcTime: 0,
  })
}

export function useToggleTrigger(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...triggerKeys.all, 'toggle', workflowId],
    mutationFn: (triggerId: string) => toggleTrigger(workflowId, triggerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.all })
    },
    gcTime: 0,
  })
}

export function useTriggerHistory(
  workflowId: string,
  triggerId?: string,
  params: TriggerHistoryParams = {},
) {
  return useQuery({
    queryKey: triggerKeys.history(triggerId ?? 'unknown', params as Record<string, unknown>),
    queryFn: () => {
      if (!triggerId) {
        throw new Error('triggerId is required')
      }

      return fetchTriggerHistory(workflowId, triggerId, params)
    },
    enabled: !!workflowId && !!triggerId,
    staleTime: TRIGGER_STALE_TIME,
    gcTime: TRIGGER_GC_TIME,
  })
}
