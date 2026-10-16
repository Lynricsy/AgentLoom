import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  confirmOrganizationAutonomyDowngrade,
  fetchOrganizationAutonomyPolicy,
  previewOrganizationAutonomyDowngrade,
  updateOrganizationAutonomyPolicy,
} from '../api/organizationAutonomyPolicyApi'
import { organizationAutonomyPolicyKeys } from '../api/organizationAutonomyPolicyKeys'
import type { UpdateOrganizationAutonomyPolicyInput } from '../types/organizationAutonomyPolicy'

function requireOrganizationId(organizationId?: string): string {
  if (!organizationId) {
    throw new Error('缺少组织 ID，无法请求组织自治策略。')
  }

  return organizationId
}

export function useOrganizationAutonomyPolicy(
  organizationId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: organizationAutonomyPolicyKeys.detail(organizationId ?? '__missing__'),
    queryFn: () => fetchOrganizationAutonomyPolicy(requireOrganizationId(organizationId)),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useUpdateOrganizationAutonomyPolicy(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateOrganizationAutonomyPolicyInput) =>
      updateOrganizationAutonomyPolicy(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: organizationAutonomyPolicyKeys.detail(resolvedOrganizationId),
      })
    },
  })
}

export function usePreviewOrganizationAutonomyDowngrade(organizationId?: string) {
  return useMutation({
    mutationFn: (input: UpdateOrganizationAutonomyPolicyInput) =>
      previewOrganizationAutonomyDowngrade(requireOrganizationId(organizationId), input),
  })
}

export function useConfirmOrganizationAutonomyDowngrade(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateOrganizationAutonomyPolicyInput) =>
      confirmOrganizationAutonomyDowngrade(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: organizationAutonomyPolicyKeys.detail(resolvedOrganizationId),
      })
    },
  })
}
