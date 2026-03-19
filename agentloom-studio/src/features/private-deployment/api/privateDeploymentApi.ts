import { apiClient, toSnakeBody } from '@/shared/api/client'
import type {
  PrivateDeploymentSettings,
  UpdatePrivateDeploymentSettingsInput,
} from '../types/privateDeployment'

interface ApiResponse<T> {
  data: T
}

export async function fetchPrivateDeploymentSettings(
  organizationId: string,
): Promise<PrivateDeploymentSettings> {
  const response = await apiClient
    .get(`organizations/${organizationId}/private-deployment`)
    .json<ApiResponse<PrivateDeploymentSettings>>()

  return response.data
}

export async function updatePrivateDeploymentSettings(
  organizationId: string,
  input: UpdatePrivateDeploymentSettingsInput,
): Promise<PrivateDeploymentSettings> {
  const response = await apiClient
    .put(`organizations/${organizationId}/private-deployment`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<PrivateDeploymentSettings>>()

  return response.data
}
