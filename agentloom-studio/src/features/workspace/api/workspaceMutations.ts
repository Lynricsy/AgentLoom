import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createWorkspace,
  deleteWorkspace,
  updateWorkspaceTextFile,
} from "./workspaceApi";
import { workspaceKeys } from "./workspaceKeys";
import type {
  CreateWorkspacePayload,
  UpdateWorkspaceTextFilePayload,
} from "../types";

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...workspaceKeys.all, "create"],
    gcTime: 0,
    mutationFn: (payload: CreateWorkspacePayload) => createWorkspace(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...workspaceKeys.all, "delete"],
    gcTime: 0,
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

export function useUpdateWorkspaceTextFile(
  workspaceId: string,
  filePath: string | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [
      ...workspaceKeys.all,
      "update-file",
      workspaceId,
      filePath ?? "",
    ],
    gcTime: 0,
    mutationFn: async (payload: UpdateWorkspaceTextFilePayload) => {
      if (!filePath) {
        throw new Error("未选择可编辑的文本文件");
      }

      return updateWorkspaceTextFile(workspaceId, filePath, payload);
    },
    onSuccess: async (data) => {
      if (filePath) {
        queryClient.setQueryData(
          workspaceKeys.preview(workspaceId, filePath),
          data,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceKeys.detail(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceKeys.tree(workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() }),
      ]);
    },
  });
}
