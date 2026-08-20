import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  ListWorkflowsParams,
  WorkflowDefinition,
  WorkflowInputSchema,
} from '../types'
import { listWorkflows } from './workflowApi'
import { workflowKeys } from './workflowKeys'

export function useWorkflowList(params: ListWorkflowsParams = {}) {
  return useQuery({
    queryKey: workflowKeys.list(params),
    queryFn: () => listWorkflows(params),
    placeholderData: keepPreviousData,
  })
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: async (): Promise<WorkflowDefinition> => {
      // 图字段按画布领域类型解读：生成的 wire 模型在 nodes/edges/extent 等位置
      // 被 OpenAPI 3.0 退化，无法直接充当画布编辑态类型（见 types.ts 的说明）
      const response = await apiClient
        .get(`workflow-definitions/${id}`)
        .json<ApiResponse<WorkflowDefinition>>()
      return response.data
    },
    enabled: !!id && UUID_RE.test(id),
  })
}

interface UseWorkflowInputSchemaOptions {
  enabled?: boolean
}

export function useWorkflowInputSchema(
  id: string,
  options?: UseWorkflowInputSchemaOptions,
) {
  return useQuery({
    queryKey: workflowKeys.inputSchema(id),
    queryFn: async () => {
      const response = await apiClient
        .get(`workflow-definitions/${id}/input-schema`)
        .json<ApiResponse<WorkflowInputSchema>>()
      return response.data
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  })
}
