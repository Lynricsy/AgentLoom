import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../shared/api/client";
import type { ApiResponse } from "../../../shared/types/api";
import type { VersionListResponse, WorkflowVersion } from "../types";
import { versionKeys } from "./versionKeys";
import { normalizeWorkflowVersion } from "./versionSnapshotNormalizer";

export function useWorkflowVersions(
  workflowId: string,
  filters: { page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: versionKeys.list(workflowId, filters),
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (filters.page) searchParams.page = String(filters.page);
      if (filters.pageSize) searchParams.pageSize = String(filters.pageSize);

      const response = await apiClient
        .get(`workflow-definitions/${workflowId}/versions`, { searchParams })
        .json<VersionListResponse>();
      return {
        ...response,
        data: response.data.map((version) => normalizeWorkflowVersion(version)),
      };
    },
    enabled: !!workflowId,
    placeholderData: keepPreviousData,
  });
}

export function usePublishedVersion(workflowId: string) {
  return useQuery({
    queryKey: versionKeys.published(workflowId),
    queryFn: async () => {
      const response = await apiClient
        .get(`workflow-definitions/${workflowId}/published-version`)
        .json<ApiResponse<WorkflowVersion | null>>();
      return response.data ? normalizeWorkflowVersion(response.data) : null;
    },
    enabled: !!workflowId,
  });
}
