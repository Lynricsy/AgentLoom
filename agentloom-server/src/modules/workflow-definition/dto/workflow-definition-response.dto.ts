import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { WorkflowDefinition } from '../../../database/schema/workflow-definitions.schema';
import type { ResourceSourceKind } from '../../../database/schema';
import { workflowInputSchemaSchema } from '../../workflow/dto/workflow-input-schema.dto';
import { normalizeWorkflowNodesAndEdges } from '../utils/normalize-workflow-graph.utils';

const ResourceSourceKindSwaggerSchema = z.enum(['manual', 'share_imported']);

const ReactFlowPositionSwaggerSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const ReactFlowNodeSwaggerSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  position: ReactFlowPositionSwaggerSchema,
  // React Flow 节点 data/style 来自用户画布 JSONB，键集合无法预先枚举。
  data: z.record(z.string(), z.unknown()),
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
  parentId: z.string().optional(),
  expandParent: z.boolean().optional(),
  extent: z
    .union([
      z.literal('parent'),
      z.tuple([ReactFlowPositionSwaggerSchema, ReactFlowPositionSwaggerSchema]),
    ])
    .optional(),
  sourcePosition: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  targetPosition: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  hidden: z.boolean().optional(),
  zIndex: z.number().optional(),
  className: z.string().optional(),
  // React Flow style 来自用户画布 JSONB，CSS 属性集合为动态键。
  style: z.record(z.string(), z.unknown()).optional(),
});

const ReactFlowMarkerSwaggerSchema = z.union([
  z.string(),
  // React Flow marker 配置来自用户画布 JSONB，具体键由前端版本决定。
  z.record(z.string(), z.unknown()),
]);

const ReactFlowEdgeSwaggerSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
  // React Flow 边 data/style 来自用户画布 JSONB，键集合无法预先枚举。
  data: z.record(z.string(), z.unknown()).optional(),
  selected: z.boolean().optional(),
  hidden: z.boolean().optional(),
  label: z.string().optional(),
  labelStyle: z.record(z.string(), z.unknown()).optional(),
  labelBgStyle: z.record(z.string(), z.unknown()).optional(),
  style: z.record(z.string(), z.unknown()).optional(),
  className: z.string().optional(),
  zIndex: z.number().optional(),
  markerStart: ReactFlowMarkerSwaggerSchema.optional(),
  markerEnd: ReactFlowMarkerSwaggerSchema.optional(),
});

const ReactFlowViewportSwaggerSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const WorkflowDefinitionResponseSwaggerSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  version: z.number().int(),
  publishedVersionId: z.string().nullable(),
  publishedReleaseNumber: z.number().int().nullable(),
  // metadata 是工作流定义的动态 JSONB 扩展字段。
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resourceSourceKind: ResourceSourceKindSwaggerSchema,
});

export const WorkflowDefinitionDetailResponseSwaggerSchema =
  WorkflowDefinitionResponseSwaggerSchema.extend({
    nodes: z.array(ReactFlowNodeSwaggerSchema),
    edges: z.array(ReactFlowEdgeSwaggerSchema),
    viewport: ReactFlowViewportSwaggerSchema.nullable(),
    inputSchema: workflowInputSchemaSchema.nullable(),
  });

export const WorkflowDefinitionListResponseSwaggerSchema = z.object({
  data: z.array(WorkflowDefinitionResponseSwaggerSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const WorkflowDefinitionDetailEnvelopeSwaggerSchema = z.object({
  data: WorkflowDefinitionDetailResponseSwaggerSchema,
});

export class WorkflowDefinitionListResponseSwaggerDto extends createZodDto(
  WorkflowDefinitionListResponseSwaggerSchema,
) {}
export class WorkflowDefinitionDetailResponseSwaggerDto extends createZodDto(
  WorkflowDefinitionDetailEnvelopeSwaggerSchema,
) {}

export type WorkflowDefinitionResponseDto = z.infer<
  typeof WorkflowDefinitionResponseSwaggerSchema
>;
export type WorkflowDefinitionDetailResponseDto = z.infer<
  typeof WorkflowDefinitionDetailResponseSwaggerSchema
>;
export type WorkflowDefinitionListResponseDto = z.infer<
  typeof WorkflowDefinitionListResponseSwaggerSchema
>;

/**
 * 将 Drizzle 行序列化为响应 DTO（排除 nodes/edges/viewport）
 */
export function serializeWorkflowDefinition(
  row: Pick<
    WorkflowDefinition,
    | 'id'
    | 'tenantId'
    | 'name'
    | 'slug'
    | 'description'
    | 'icon'
    | 'status'
    | 'version'
    | 'publishedVersionId'
    | 'metadata'
    | 'createdBy'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
  > & {
    publishedReleaseNumber?: number | null;
  },
  options?: { resourceSourceKind?: ResourceSourceKind },
): WorkflowDefinitionResponseDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon ?? null,
    status: row.status,
    version: row.version,
    publishedVersionId: row.publishedVersionId ?? null,
    publishedReleaseNumber: row.publishedReleaseNumber ?? null,
    metadata:
      row.metadata && Object.keys(row.metadata).length > 0
        ? row.metadata
        : null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resourceSourceKind: options?.resourceSourceKind ?? 'manual',
  };
}

/**
 * 将 Drizzle 行序列化为详情响应 DTO（包含 nodes/edges/viewport）
 */
export function serializeWorkflowDefinitionDetail(
  row: WorkflowDefinition & {
    publishedReleaseNumber?: number | null;
  },
  options?: { resourceSourceKind?: ResourceSourceKind },
): WorkflowDefinitionDetailResponseDto {
  const normalizedGraph = normalizeWorkflowNodesAndEdges(row.nodes, row.edges);

  return {
    ...serializeWorkflowDefinition(row, options),
    nodes: normalizedGraph.nodes,
    edges: normalizedGraph.edges,
    viewport: row.viewport ?? null,
    inputSchema: row.inputSchema ?? null,
  };
}
