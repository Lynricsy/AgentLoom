import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type {
  CreateMemoryInstanceInput,
  MemoryInstance,
  MemoryInstanceDetail,
  MemoryInstanceListParams,
  UpdateMemoryInstanceInput,
} from '../types';

const BASE_PATH = 'memory-instances';

export async function fetchMemoryInstances(
  params?: MemoryInstanceListParams,
): Promise<PaginatedResponse<MemoryInstance>> {
  const searchParams: Record<string, string> = {};

  if (params?.page) {
    searchParams.page = String(params.page);
  }
  if (params?.pageSize) {
    searchParams.page_size = String(params.pageSize);
  }
  if (params?.search) {
    searchParams.search = params.search;
  }
  if (params?.sourceKind) {
    searchParams.source_kind = params.sourceKind;
  }

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<PaginatedResponse<MemoryInstance>>();
}

export async function fetchAllMemoryInstances(
  params?: Pick<MemoryInstanceListParams, 'sourceKind'>,
): Promise<MemoryInstance[]> {
  const allItems: MemoryInstance[] = [];
  let page = 1;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetchMemoryInstances({
      page,
      pageSize,
      sourceKind: params?.sourceKind,
    });
    allItems.push(...response.data);

    if (page >= response.meta.totalPages) {
      break;
    }
    page++;
  }

  return allItems;
}

export async function fetchMemoryInstance(
  id: string,
): Promise<MemoryInstanceDetail> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiResponse<MemoryInstanceDetail>>();
  return response.data;
}

export async function createMemoryInstance(
  input: CreateMemoryInstanceInput,
): Promise<MemoryInstance> {
  const response = await apiClient
    .post(BASE_PATH, { json: toSnakeBody(input) })
    .json<ApiResponse<MemoryInstance>>();
  return response.data;
}

export async function updateMemoryInstance(
  id: string,
  input: UpdateMemoryInstanceInput,
): Promise<MemoryInstance> {
  const response = await apiClient
    .put(`${BASE_PATH}/${id}`, { json: toSnakeBody(input) })
    .json<ApiResponse<MemoryInstance>>();
  return response.data;
}

export async function deleteMemoryInstance(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}
