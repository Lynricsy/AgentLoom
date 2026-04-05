import type { WorkspaceListParams } from "../types";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  lists: () => [...workspaceKeys.all, "list"] as const,
  list: (params?: WorkspaceListParams) =>
    [...workspaceKeys.lists(), params] as const,
  details: () => [...workspaceKeys.all, "detail"] as const,
  detail: (id: string) => [...workspaceKeys.details(), id] as const,
  trees: () => [...workspaceKeys.all, "tree"] as const,
  tree: (id: string) => [...workspaceKeys.trees(), id] as const,
  previews: () => [...workspaceKeys.all, "preview"] as const,
  preview: (id: string, filePath: string) =>
    [...workspaceKeys.previews(), id, filePath] as const,
};
