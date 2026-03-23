import { apiClient } from '@/shared/api/client';
import type { PaginatedResponse } from '@/shared/types/api';
import type { Skill, SkillStatus } from '../types';

const BASE_PATH = 'skills';

export interface ListSkillsParams {
  page?: number;
  pageSize?: number;
  status?: SkillStatus;
  isBuiltin?: boolean;
  search?: string;
}

export interface CreateSkillPayload {
  name: string;
  description?: string;
  content?: string;
}

export interface UpdateSkillPayload {
  name?: string;
  description?: string;
  content?: string;
}

function buildSearchParams(params?: ListSkillsParams): Record<string, string> {
  const searchParams: Record<string, string> = {};
  if (params?.page) searchParams.page = String(params.page);
  if (params?.pageSize) searchParams.pageSize = String(params.pageSize);
  if (params?.status) searchParams.status = params.status;
  if (params?.isBuiltin != null) searchParams.isBuiltin = String(params.isBuiltin);
  if (params?.search) searchParams.search = params.search;
  return searchParams;
}

export async function fetchSkills(
  params?: ListSkillsParams,
): Promise<PaginatedResponse<Skill>> {
  return apiClient
    .get(BASE_PATH, { searchParams: buildSearchParams(params) })
    .json<PaginatedResponse<Skill>>();
}

export async function fetchSkillById(id: string): Promise<Skill> {
  return apiClient.get(`${BASE_PATH}/${id}`).json<Skill>();
}

export async function createSkill(payload: CreateSkillPayload): Promise<Skill> {
  const formData = new FormData();
  formData.append('name', payload.name);
  if (payload.description) formData.append('description', payload.description);
  if (payload.content) formData.append('content', payload.content);

  return apiClient
    .post(BASE_PATH, { body: formData })
    .json<Skill>();
}

export async function updateSkill(
  id: string,
  payload: UpdateSkillPayload,
): Promise<Skill> {
  const formData = new FormData();
  if (payload.name != null) formData.append('name', payload.name);
  if (payload.description != null) formData.append('description', payload.description);
  if (payload.content != null) formData.append('content', payload.content);

  return apiClient
    .put(`${BASE_PATH}/${id}`, { body: formData })
    .json<Skill>();
}

export async function deleteSkill(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}

export async function archiveSkill(id: string): Promise<Skill> {
  return apiClient
    .patch(`${BASE_PATH}/${id}/archive`)
    .json<Skill>();
}
