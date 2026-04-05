import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  fetchWorkspaces,
  fetchWorkspaceDetail,
  fetchAllWorkspaces,
  fetchWorkspaceFileTree,
  fetchWorkspaceFilePreview,
} from "./workspaceApi";
import { workspaceKeys } from "./workspaceKeys";
import type { WorkspaceListParams } from "../types";

export function useWorkspaces(params?: WorkspaceListParams) {
  return useQuery({
    queryKey: workspaceKeys.list(params),
    queryFn: () => fetchWorkspaces(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useWorkspaceDetail(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    queryFn: () => fetchWorkspaceDetail(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  });
}

export function useAllWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: fetchAllWorkspaces,
    staleTime: 30_000,
  });
}

export function useWorkspaceFileTree(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: workspaceKeys.tree(id),
    queryFn: () => fetchWorkspaceFileTree(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  });
}

export function useWorkspaceFilePreview(
  id: string,
  filePath: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: workspaceKeys.preview(id, filePath ?? ""),
    queryFn: () => fetchWorkspaceFilePreview(id, filePath ?? ""),
    enabled: (options?.enabled ?? true) && Boolean(id) && Boolean(filePath),
    staleTime: 30_000,
  });
}
