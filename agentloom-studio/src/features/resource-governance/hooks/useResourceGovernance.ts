import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  fetchResourceGovernance,
  terminateGovernedExecution,
  updateExecutionGovernanceControls,
  updateTenantQuota,
} from '../api/resourceGovernanceApi'
import { resourceGovernanceKeys } from '../api/resourceGovernanceKeys'
import type {
  TerminateGovernedExecutionInput,
  UpdateExecutionGovernanceControlsInput,
  UpdateTenantQuotaInput,
} from '../types/resourceGovernance'

function requireOrganizationId(organizationId?: string): string {
  if (!organizationId) {
    throw new Error('缺少组织 ID，无法请求资源治理设置。')
  }

  return organizationId
}

export function useResourceGovernance(
  organizationId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: resourceGovernanceKeys.detail(organizationId ?? '__missing__'),
    queryFn: () => fetchResourceGovernance(requireOrganizationId(organizationId)),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useUpdateTenantQuota(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateTenantQuotaInput) =>
      updateTenantQuota(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: resourceGovernanceKeys.detail(resolvedOrganizationId),
      })
    },
  })
}

export function useUpdateExecutionGovernanceControls(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateExecutionGovernanceControlsInput) =>
      updateExecutionGovernanceControls(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: resourceGovernanceKeys.detail(resolvedOrganizationId),
      })
    },
  })
}

export function useTerminateGovernedExecution(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: TerminateGovernedExecutionInput) =>
      terminateGovernedExecution(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: resourceGovernanceKeys.detail(resolvedOrganizationId),
      })
    },
  })
}
