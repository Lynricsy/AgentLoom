import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  fetchPrivateDeploymentSettings,
  updatePrivateDeploymentSettings,
} from '../api/privateDeploymentApi'
import { privateDeploymentKeys } from '../api/privateDeploymentKeys'
import type { UpdatePrivateDeploymentSettingsInput } from '../types/privateDeployment'

function requireOrganizationId(organizationId?: string): string {
  if (!organizationId) {
    throw new Error('缺少组织 ID，无法请求私有部署设置。')
  }

  return organizationId
}

export function usePrivateDeployment(
  organizationId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: privateDeploymentKeys.detail(organizationId ?? '__missing__'),
    queryFn: () => fetchPrivateDeploymentSettings(requireOrganizationId(organizationId)),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useUpdatePrivateDeploymentSettings(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdatePrivateDeploymentSettingsInput) =>
      updatePrivateDeploymentSettings(requireOrganizationId(organizationId), input),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      await queryClient.invalidateQueries({
        queryKey: privateDeploymentKeys.detail(resolvedOrganizationId),
      })
    },
  })
}
