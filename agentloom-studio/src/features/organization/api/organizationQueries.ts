import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptOrganizationInvitation,
  fetchCurrentOrganization,
  fetchOrganizationMembers,
  inviteOrganizationMember,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from './organizationApi'
import { organizationKeys } from './organizationKeys'
import type { InviteMemberInput, UpdateMemberRoleInput } from '../types'

function requireOrganizationId(organizationId?: string): string {
  if (!organizationId) {
    throw new Error('缺少组织 ID，无法请求组织数据。')
  }

  return organizationId
}

export function useCurrentOrganization(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: organizationKeys.current(),
    queryFn: fetchCurrentOrganization,
    enabled: options?.enabled ?? true,
  })
}

export function useOrganizationMembers(
  organizationId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: organizationKeys.members(organizationId ?? '__missing__'),
    queryFn: () =>
      fetchOrganizationMembers(requireOrganizationId(organizationId)),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}

export function useInviteOrganizationMember(organizationId?: string) {
  return useMutation({
    mutationFn: (input: InviteMemberInput) =>
      inviteOrganizationMember(requireOrganizationId(organizationId), input),
  })
}

export function useUpdateOrganizationMemberRole(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, role }: UpdateMemberRoleInput) =>
      updateOrganizationMemberRole(
        requireOrganizationId(organizationId),
        userId,
        role,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: organizationKeys.members(requireOrganizationId(organizationId)),
      })
    },
  })
}

export function useRemoveOrganizationMember(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) =>
      removeOrganizationMember(requireOrganizationId(organizationId), userId),
    onSuccess: async () => {
      const resolvedOrganizationId = requireOrganizationId(organizationId)

      // 成员数展示在信息卡上，移除后当前组织与名册都要失效
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: organizationKeys.members(resolvedOrganizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: organizationKeys.current(),
        }),
      ])
    },
  })
}

export function useAcceptOrganizationInvitation() {
  return useMutation({
    mutationFn: (token: string) => acceptOrganizationInvitation(token),
  })
}
