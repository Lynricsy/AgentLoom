import { apiClient } from '@/shared/api/client';
import type { PaginatedResponse } from '@/shared/types/api';
import type { SkillCategory, SkillDetail, SkillListItem, SkillStatus } from '../types';

export interface ListSkillsParams {
  category?: SkillCategory;
  status?: SkillStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchSkills(
  params: ListSkillsParams = {},
): Promise<PaginatedResponse<SkillListItem>> {
  const searchParams: Record<string, string> = {};
  if (params.category) searchParams.category = params.category;
  if (params.status) searchParams.status = params.status;
  if (params.search) searchParams.search = params.search;
  if (params.page) searchParams.page = String(params.page);
  if (params.pageSize) searchParams.pageSize = String(params.pageSize);

  return apiClient
    .get('skills', { searchParams })
    .json<PaginatedResponse<SkillListItem>>();
}

export async function fetchSkillBySlug(slug: string): Promise<SkillDetail> {
  return apiClient.get(`skills/${slug}`).json<SkillDetail>();
}

export async function enableSkill(id: string): Promise<SkillListItem> {
  return apiClient
    .patch(`skills/${id}/enable`)
    .json<SkillListItem>();
}

export async function disableSkill(id: string): Promise<SkillListItem> {
  return apiClient
    .patch(`skills/${id}/disable`)
    .json<SkillListItem>();
}
