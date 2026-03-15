import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  TenantKeyDetailResponse,
  TenantKeyResponse,
  UploadPublicKeyPayload,
} from '../types'

function unwrapResponse<T>(response: ApiResponse<T> | T): T {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return response.data
  }

  return response
}

export async function fetchTenantKeys(): Promise<TenantKeyResponse[]> {
  const response = await apiClient
    .get('tenant-keys')
    .json<ApiResponse<TenantKeyResponse[]> | TenantKeyResponse[]>()

  return unwrapResponse(response)
}

export async function fetchTenantKeyById(
  keyId: string,
): Promise<TenantKeyDetailResponse> {
  const response = await apiClient
    .get(`tenant-keys/${keyId}`)
    .json<ApiResponse<TenantKeyDetailResponse> | TenantKeyDetailResponse>()

  return unwrapResponse(response)
}

export async function uploadPublicKey(
  payload: UploadPublicKeyPayload,
): Promise<TenantKeyDetailResponse> {
  const response = await apiClient
    .post('tenant-keys', {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<TenantKeyDetailResponse> | TenantKeyDetailResponse>()

  return unwrapResponse(response)
}

export async function rotateTenantKey(
  keyId: string,
  payload: UploadPublicKeyPayload,
): Promise<TenantKeyDetailResponse> {
  const response = await apiClient
    .post(`tenant-keys/${keyId}/rotate`, {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<TenantKeyDetailResponse> | TenantKeyDetailResponse>()

  return unwrapResponse(response)
}

export async function revokeTenantKey(keyId: string): Promise<TenantKeyResponse> {
  const response = await apiClient
    .delete(`tenant-keys/${keyId}`)
    .json<ApiResponse<TenantKeyResponse> | TenantKeyResponse>()

  return unwrapResponse(response)
}
