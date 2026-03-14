import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type {
  BlockCategory,
  BlockDefinition,
  BlockMetadata,
  ReusableBlockDetail,
  ReusableBlockListItem,
} from '../types';

export interface ListBlocksParams {
  category?: BlockCategory;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateBlockData {
  name: string;
  description?: string;
  category?: BlockCategory;
  tags?: string[];
  definition: BlockDefinition;
  metadata?: BlockMetadata;
}

export interface UpdateBlockData {
  name?: string;
  description?: string;
  category?: BlockCategory;
  tags?: string[];
  definition?: BlockDefinition;
  metadata?: BlockMetadata;
  isPublished?: boolean;
  version: number;
}

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
