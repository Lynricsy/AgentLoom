import { apiClient } from '@/shared/api/client';
import type { PaginatedResponse } from '@/shared/types/api';
import type { ResourceSourceKind } from '@/shared/lib/resourceSource';
import type { Skill, SkillStatus } from '../types';

const BASE_PATH = 'skills';

export interface ListSkillsParams {
  page?: number;
  pageSize?: number;
  status?: SkillStatus;
  isBuiltin?: boolean;
  search?: string;
  sourceKind?: ResourceSourceKind;
}

export interface CreateSkillPayload {
  name: string;
  description?: string;
  content?: string;
  files?: File[];
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
  if (params?.sourceKind) searchParams.sourceKind = params.sourceKind;
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
  const { files, ...metadata } = payload;
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  if (files) {
    for (const file of files) {
      formData.append('files', file, file.name);
    }
  }

  return apiClient
    .post(BASE_PATH, { body: formData })
    .json<Skill>();
}

export async function updateSkill(
  id: string,
  payload: UpdateSkillPayload,
): Promise<Skill> {
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(payload));

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

// ---------- File Management ----------

export interface SkillFileInfo {
  name: string;
  size: number;
}

export async function fetchSkillFiles(id: string): Promise<SkillFileInfo[]> {
  return apiClient.get(`${BASE_PATH}/${id}/files`).json<SkillFileInfo[]>();
}

export async function uploadSkillFile(
  id: string,
  file: File,
): Promise<SkillFileInfo> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient
    .post(`${BASE_PATH}/${id}/files`, { body: formData })
    .json<SkillFileInfo>();
}

export async function downloadSkillFile(
  id: string,
  fileName: string,
): Promise<Blob> {
  return apiClient
    .get(`${BASE_PATH}/${id}/files/${encodeURIComponent(fileName)}`)
    .blob();
}

export async function deleteSkillFile(
  id: string,
  fileName: string,
): Promise<void> {
  await apiClient.delete(
    `${BASE_PATH}/${id}/files/${encodeURIComponent(fileName)}`,
  );
}
