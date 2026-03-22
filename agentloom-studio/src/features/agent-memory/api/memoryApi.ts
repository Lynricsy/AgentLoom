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

/**
 * 获取 Memory Instance 分页列表
 */
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

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<PaginatedResponse<MemoryInstance>>();
}

/**
 * 获取全部 Memory Instance（不分页，循环获取所有页）
 */
export async function fetchAllMemoryInstances(): Promise<MemoryInstance[]> {
  const allItems: MemoryInstance[] = [];
  let page = 1;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetchMemoryInstances({ page, pageSize });
    allItems.push(...response.data);

    if (page >= response.meta.totalPages) {
      break;
    }
    page++;
  }

  return allItems;
}

/**
 * 获取单个 Memory Instance 详情（含统计信息）
 */
export async function fetchMemoryInstance(
  id: string,
): Promise<MemoryInstanceDetail> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiResponse<MemoryInstanceDetail>>();
  return response.data;
}

/**
 * 创建 Memory Instance
 */
export async function createMemoryInstance(
  input: CreateMemoryInstanceInput,
): Promise<MemoryInstance> {
  const response = await apiClient
    .post(BASE_PATH, { json: toSnakeBody(input) })
    .json<ApiResponse<MemoryInstance>>();
  return response.data;
}

/**
 * 更新 Memory Instance
 */
export async function updateMemoryInstance(
  id: string,
  input: UpdateMemoryInstanceInput,
): Promise<MemoryInstance> {
  const response = await apiClient
    .put(`${BASE_PATH}/${id}`, { json: toSnakeBody(input) })
    .json<ApiResponse<MemoryInstance>>();
  return response.data;
}

/**
 * 删除 Memory Instance
 */
export async function deleteMemoryInstance(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}
