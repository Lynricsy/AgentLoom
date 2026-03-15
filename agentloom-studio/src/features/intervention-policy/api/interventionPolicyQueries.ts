import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInterventionPolicy,
  deleteInterventionPolicy,
  fetchInterventionPolicies,
  fetchResolvedInterventionPolicy,
  updateInterventionPolicy,
} from './interventionPolicyApi'
import { interventionPolicyKeys } from './interventionPolicyKeys'
import type {
  CreateInterventionPolicyData,
  UpdateInterventionPolicyData,
} from '../types'

const INTERVENTION_POLICY_STALE_TIME = 30 * 1000
const INTERVENTION_POLICY_GC_TIME = INTERVENTION_POLICY_STALE_TIME

export function useInterventionPolicies(workflowId: string) {
  return useQuery({
    queryKey: interventionPolicyKeys.list(workflowId),
    queryFn: () => fetchInterventionPolicies(workflowId),
    enabled: !!workflowId,
    staleTime: INTERVENTION_POLICY_STALE_TIME,
    gcTime: INTERVENTION_POLICY_GC_TIME,
  })
}

export function useResolvedInterventionPolicy(workflowId: string, nodeId?: string) {
  return useQuery({
    queryKey: interventionPolicyKeys.resolve(workflowId, nodeId),
    queryFn: () => fetchResolvedInterventionPolicy(workflowId, nodeId),
    enabled: !!workflowId,
    staleTime: INTERVENTION_POLICY_STALE_TIME,
    gcTime: INTERVENTION_POLICY_GC_TIME,
  })
}

export function useCreateInterventionPolicy(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...interventionPolicyKeys.all, 'create', workflowId],
    mutationFn: (data: CreateInterventionPolicyData) =>
      createInterventionPolicy(workflowId, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.resolved() }),
      ])
    },
    gcTime: 0,
  })
}

export function useUpdateInterventionPolicy(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...interventionPolicyKeys.all, 'update', workflowId],
    mutationFn: ({
      policyId,
      data,
    }: {
      policyId: string
      data: UpdateInterventionPolicyData
    }) => updateInterventionPolicy(workflowId, policyId, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.all }),
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.resolved() }),
      ])
    },
    gcTime: 0,
  })
}

export function useDeleteInterventionPolicy(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...interventionPolicyKeys.all, 'delete', workflowId],
    mutationFn: (policyId: string) => deleteInterventionPolicy(workflowId, policyId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: interventionPolicyKeys.resolved() }),
      ])
    },
    gcTime: 0,
  })
}
