import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
  WorkflowDefinition,
} from '../../../database/schema/workflow-definitions.schema';
import type { WorkflowInputSchema } from '../../workflow/dto/workflow-input-schema.dto';

/**
 * 工作流定义响应 DTO（排除 nodes/edges/viewport 大字段）
 */
export interface WorkflowDefinitionResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  version: number;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工作流定义详情响应 DTO（包含 nodes/edges/viewport）
 */
export interface WorkflowDefinitionDetailResponseDto extends WorkflowDefinitionResponseDto {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport | null;
  inputSchema: WorkflowInputSchema | null;
}

/**
 * 分页列表响应
 */
export interface WorkflowDefinitionListResponseDto {
  data: WorkflowDefinitionResponseDto[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * 将 Drizzle 行序列化为响应 DTO（排除 nodes/edges/viewport）
 */
export function serializeWorkflowDefinition(
  row: Pick<
    WorkflowDefinition,
    | 'id'
    | 'name'
    | 'slug'
    | 'description'
    | 'status'
    | 'version'
    | 'metadata'
    | 'createdBy'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
  >,
): WorkflowDefinitionResponseDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    version: row.version,
    metadata:
      row.metadata && Object.keys(row.metadata).length > 0
        ? row.metadata
        : null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 将 Drizzle 行序列化为详情响应 DTO（包含 nodes/edges/viewport）
 */
export function serializeWorkflowDefinitionDetail(
  row: WorkflowDefinition,
): WorkflowDefinitionDetailResponseDto {
  return {
    ...serializeWorkflowDefinition(row),
    nodes: row.nodes ?? [],
    edges: row.edges ?? [],
    viewport: row.viewport ?? null,
    inputSchema: row.inputSchema ?? null,
  };
}
