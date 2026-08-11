import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  AcceptInvitationResult,
  InviteMemberInput,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
} from '../types'

export async function fetchOrganization(
  organizationId: string,
): Promise<Organization> {
  const response = await apiClient
    .get(`organizations/${organizationId}`)
    .json<ApiResponse<Organization>>()

  return response.data
}

export async function fetchOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMember[]> {
  const response = await apiClient
    .get(`organizations/${organizationId}/members`)
    .json<ApiResponse<OrganizationMember[]>>()

  return response.data
}

export async function inviteOrganizationMember(
  organizationId: string,
  input: InviteMemberInput,
): Promise<OrganizationInvitation> {
  const response = await apiClient
    .post(`organizations/${organizationId}/invitations`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<OrganizationInvitation>>()

  return response.data
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
): Promise<OrganizationMember> {
  const response = await apiClient
    .put(`organizations/${organizationId}/members/${userId}/role`, {
      json: toSnakeBody({ role }),
    })
    .json<ApiResponse<OrganizationMember>>()

  return response.data
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string,
): Promise<void> {
  await apiClient.delete(`organizations/${organizationId}/members/${userId}`)
}

export async function acceptOrganizationInvitation(
  token: string,
): Promise<AcceptInvitationResult> {
  const response = await apiClient
    .post(`invitations/${token}/accept`)
    .json<ApiResponse<AcceptInvitationResult>>()

  return response.data
}
