import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type {
  CreateReusableBlockDto,
  UpdateReusableBlockDto,
} from '@agentloom/api-client';
import type {
  BlockCategory,
  BlockDefinition,
  ReusableBlockDetail,
  ReusableBlockListItem,
} from '../types';

export interface ListBlocksParams {
  category?: BlockCategory;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * POST /reusable-blocks 请求体（生成模型 + 无 any 的 definition）。
 * 生成产物里 `definition.nodes` / `.edges` 带无约束索引签名，这里换成
 * `BlockDefinition` 的 `Record<string, unknown>` 变体，保留 id/source/target 约束。
 */
export type CreateBlockData = Omit<CreateReusableBlockDto, 'definition'> & {
  definition: BlockDefinition;
};

/**
 * PATCH /reusable-blocks/:id 请求体（生成模型）。
 * `description` / `category` / `metadata` 允许显式 null 清空 —— 原手写类型漏了 null。
 */
export type UpdateBlockData = Omit<UpdateReusableBlockDto, 'definition'> & {
  definition?: BlockDefinition;
};

function unwrapBlockDetail(
  response: ApiResponse<ReusableBlockDetail> | ReusableBlockDetail,
): ReusableBlockDetail {
  if ('data' in response) {
    return response.data;
  }

  return response;
}

export async function fetchBlocks(
  params: ListBlocksParams = {},
): Promise<PaginatedResponse<ReusableBlockListItem>> {
  const searchParams: Record<string, string> = {};

  if (params.category) searchParams.category = params.category;
  if (params.search) searchParams.search = params.search;
  if (params.page) searchParams.page = String(params.page);
  if (params.pageSize) searchParams.pageSize = String(params.pageSize);

  return apiClient
    .get('reusable-blocks', { searchParams })
    .json<PaginatedResponse<ReusableBlockListItem>>();
}

export async function fetchBlockById(id: string): Promise<ReusableBlockDetail> {
  const response = await apiClient
    .get(`reusable-blocks/${id}`)
    .json<ApiResponse<ReusableBlockDetail> | ReusableBlockDetail>();

  return unwrapBlockDetail(response);
}

export async function createBlock(
  data: CreateBlockData,
): Promise<ReusableBlockDetail> {
  const response = await apiClient
    .post('reusable-blocks', {
      json: toSnakeBody(data),
    })
    .json<ApiResponse<ReusableBlockDetail> | ReusableBlockDetail>();

  return unwrapBlockDetail(response);
}

export async function updateBlock(
  id: string,
  data: UpdateBlockData,
): Promise<ReusableBlockDetail> {
  const response = await apiClient
    .patch(`reusable-blocks/${id}`, {
      json: toSnakeBody(data),
    })
    .json<ApiResponse<ReusableBlockDetail> | ReusableBlockDetail>();

  return unwrapBlockDetail(response);
}

export async function deleteBlock(id: string): Promise<void> {
  await apiClient.delete(`reusable-blocks/${id}`);
}
