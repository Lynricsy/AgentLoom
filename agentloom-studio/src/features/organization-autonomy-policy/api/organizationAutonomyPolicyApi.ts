import { apiClient, toSnakeBody } from '@/shared/api/client'
import type {
  OrganizationAutonomyDowngradeConfirmResult,
  OrganizationAutonomyDowngradePreview,
  OrganizationAutonomyPolicy,
  UpdateOrganizationAutonomyPolicyInput,
} from '../types/organizationAutonomyPolicy'

interface ApiResponse<T> {
  data: T
}

export async function fetchOrganizationAutonomyPolicy(
  organizationId: string,
): Promise<OrganizationAutonomyPolicy> {
  const response = await apiClient
    .get(`organizations/${organizationId}/autonomy-policy`)
    .json<ApiResponse<OrganizationAutonomyPolicy>>()

  return response.data
}

export async function updateOrganizationAutonomyPolicy(
  organizationId: string,
  input: UpdateOrganizationAutonomyPolicyInput,
): Promise<OrganizationAutonomyPolicy> {
  const response = await apiClient
    .put(`organizations/${organizationId}/autonomy-policy`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<OrganizationAutonomyPolicy>>()

  return response.data
}

export async function previewOrganizationAutonomyDowngrade(
  organizationId: string,
  input: UpdateOrganizationAutonomyPolicyInput,
): Promise<OrganizationAutonomyDowngradePreview> {
  const response = await apiClient
    .post(`organizations/${organizationId}/autonomy-policy/downgrade-preview`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<OrganizationAutonomyDowngradePreview>>()

  return response.data
}

export async function confirmOrganizationAutonomyDowngrade(
  organizationId: string,
  input: UpdateOrganizationAutonomyPolicyInput,
): Promise<OrganizationAutonomyDowngradeConfirmResult> {
  const response = await apiClient
    .post(`organizations/${organizationId}/autonomy-policy/downgrade-confirm`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<OrganizationAutonomyDowngradeConfirmResult>>()

  return response.data
}
