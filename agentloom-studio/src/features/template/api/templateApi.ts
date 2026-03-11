import { apiClient } from '@/shared/api/client';
import type { PaginatedResponse } from '@/shared/types/api';
import type { TemplateDetail, TemplateListItem } from '../types';

export interface ListTemplatesParams {
  category?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchTemplates(
  params: ListTemplatesParams = {},
): Promise<PaginatedResponse<TemplateListItem>> {
  const searchParams: Record<string, string> = {};
  if (params.category) searchParams.category = params.category;
  if (params.page) searchParams.page = String(params.page);
  if (params.pageSize) searchParams.pageSize = String(params.pageSize);

  return apiClient
    .get('templates', { searchParams })
    .json<PaginatedResponse<TemplateListItem>>();
}

export async function fetchTemplateBySlug(
  slug: string,
): Promise<TemplateDetail> {
  return apiClient.get(`templates/${slug}`).json<TemplateDetail>();
}
