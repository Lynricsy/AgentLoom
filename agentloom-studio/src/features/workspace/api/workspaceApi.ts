import { apiClient } from "@/shared/api/client";
import type {
  Workspace,
  WorkspaceListResponse,
  WorkspaceListParams,
  CreateWorkspacePayload,
  UpdateWorkspaceTextFilePayload,
  WorkspaceFileNode,
  WorkspaceFilePreview,
} from "../types";

interface ApiEnvelope<T> {
  data: T;
}

const BASE_PATH = "workspaces";

function encodeWorkspaceFilePath(filePath: string): string {
  return filePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function fetchWorkspaces(
  params?: WorkspaceListParams,
): Promise<WorkspaceListResponse> {
  const searchParams: Record<string, string | number> = {};
  if (params?.page) searchParams.page = params.page;
  if (params?.pageSize) searchParams.pageSize = params.pageSize;
  if (params?.search) searchParams.search = params.search;
  if (typeof params?.includeAutoArchived === "boolean") {
    searchParams.includeAutoArchived = params.includeAutoArchived
      ? "true"
      : "false";
  }

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<WorkspaceListResponse>();
}

export async function fetchAllWorkspaces(): Promise<Workspace[]> {
  const allItems: Workspace[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const response = await fetchWorkspaces({
      page,
      pageSize,
      includeAutoArchived: false,
    });
    allItems.push(...response.data);

    if (page >= response.meta.totalPages) {
      break;
    }

    page += 1;
  }

  return allItems;
}

export async function fetchWorkspaceDetail(id: string): Promise<Workspace> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiEnvelope<Workspace>>();
  return response.data;
}

export async function fetchWorkspaceFileTree(
  id: string,
): Promise<WorkspaceFileNode[]> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}/tree`)
    .json<ApiEnvelope<WorkspaceFileNode[]>>();
  return response.data;
}

export async function fetchWorkspaceFilePreview(
  id: string,
  filePath: string,
): Promise<WorkspaceFilePreview> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}/preview/${encodeWorkspaceFilePath(filePath)}`)
    .json<ApiEnvelope<WorkspaceFilePreview>>();
  return response.data;
}

export async function fetchWorkspaceFileRaw(
  id: string,
  filePath: string,
): Promise<Blob> {
  return apiClient
    .get(`${BASE_PATH}/${id}/raw/${encodeWorkspaceFilePath(filePath)}`)
    .blob();
}

export async function updateWorkspaceTextFile(
  id: string,
  filePath: string,
  payload: UpdateWorkspaceTextFilePayload,
): Promise<WorkspaceFilePreview> {
  const response = await apiClient
    .put(`${BASE_PATH}/${id}/files/${encodeWorkspaceFilePath(filePath)}`, {
      json: payload,
    })
    .json<ApiEnvelope<WorkspaceFilePreview>>();
  return response.data;
}

export async function createWorkspace(
  payload: CreateWorkspacePayload,
): Promise<Workspace> {
  const response = await apiClient
    .post(BASE_PATH, { json: payload })
    .json<ApiEnvelope<Workspace>>();
  return response.data;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`);
}
