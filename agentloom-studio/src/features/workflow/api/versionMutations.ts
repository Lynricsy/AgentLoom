import {
  QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, toSnakeBody } from "../../../shared/api/client";
import type { ApiResponse } from "../../../shared/types/api";
import type {
  CreateVersionPayload,
  PublishWarning,
  PublishWorkflowPayload,
  VersionListResponse,
  WorkflowVersion,
} from "../types";
import { versionKeys } from "./versionKeys";
import { workflowKeys } from "./workflowKeys";

export interface PublishWorkflowResponse extends ApiResponse<WorkflowVersion> {
  warnings?: PublishWarning[];
}

function compareWorkflowVersionsDesc(
  left: WorkflowVersion,
  right: WorkflowVersion,
): number {
  if (left.versionNumber !== right.versionNumber) {
    return right.versionNumber - left.versionNumber;
  }

  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function resolveVersionPageSize(response: VersionListResponse): number {
  return response.meta.pageSize > 0
    ? response.meta.pageSize
    : Math.max(response.data.length, 1);
}

function upsertFirstVersionPage(
  queryClient: QueryClient,
  workflowId: string,
  version: WorkflowVersion,
) {
  queryClient.setQueriesData<VersionListResponse>(
    {
      queryKey: versionKeys.lists(workflowId),
    },
    (current) => {
      if (!current || current.meta.page !== 1) {
        return current;
      }

      const pageSize = resolveVersionPageSize(current);
      const existingIndex = current.data.findIndex(
        (item) => item.id === version.id,
      );

      if (existingIndex >= 0) {
        const nextData = [...current.data];
        nextData[existingIndex] = version;
        nextData.sort(compareWorkflowVersionsDesc);

        return {
          ...current,
          data: nextData,
        };
      }

      const previewData = [...current.data, version].sort(
        compareWorkflowVersionsDesc,
      );
      const insertedIndex = previewData.findIndex(
        (item) => item.id === version.id,
      );
      if (insertedIndex < 0 || insertedIndex >= pageSize) {
        return current;
      }

      const nextTotal = current.meta.total + 1;
      return {
        ...current,
        data: previewData.slice(0, pageSize),
        meta: {
          ...current.meta,
          total: nextTotal,
          totalPages: Math.max(1, Math.ceil(nextTotal / pageSize)),
        },
      };
    },
  );
}

export function useCreateVersion(workflowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workflow", "createVersion", workflowId],
    mutationFn: async (payload: CreateVersionPayload) => {
      const response = await apiClient
        .post(`workflow-definitions/${workflowId}/versions`, {
          json: toSnakeBody(payload),
        })
        .json<ApiResponse<WorkflowVersion>>();
      return response.data;
    },
    onSuccess: async (version) => {
      upsertFirstVersionPage(queryClient, workflowId, version);
      await queryClient.invalidateQueries({
        queryKey: versionKeys.lists(workflowId),
      });
    },
    gcTime: 0,
  });
}

export function useRollbackVersion(workflowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workflow", "rollback", workflowId],
    mutationFn: async (versionId: string) => {
      const response = await apiClient
        .post(
          `workflow-definitions/${workflowId}/versions/${versionId}/rollback`,
        )
        .json<ApiResponse<WorkflowVersion>>();
      return response.data;
    },
    onSuccess: async (version) => {
      upsertFirstVersionPage(queryClient, workflowId, version);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(workflowId),
        }),
        queryClient.invalidateQueries({
          queryKey: versionKeys.all(workflowId),
        }),
      ]);
    },
    gcTime: 0,
  });
}

export function usePublishWorkflow(workflowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workflow", "publish", workflowId],
    mutationFn: async (payload: PublishWorkflowPayload) => {
      const response = await apiClient
        .post(`workflow-definitions/${workflowId}/publish`, {
          json: toSnakeBody(payload),
        })
        .json<PublishWorkflowResponse>();
      return response;
    },
    onSuccess: async (response) => {
      upsertFirstVersionPage(queryClient, workflowId, response.data);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(workflowId),
        }),
        queryClient.invalidateQueries({
          queryKey: versionKeys.all(workflowId),
        }),
      ]);
    },
    gcTime: 0,
  });
}

export function useArchiveWorkflow(workflowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["workflow", "archive", workflowId],
    mutationFn: async () => {
      await apiClient.post(`workflow-definitions/${workflowId}/archive`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(workflowId),
        }),
        queryClient.invalidateQueries({
          queryKey: versionKeys.all(workflowId),
        }),
      ]);
    },
    gcTime: 0,
  });
}
