import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AgentDefinition } from '../../../database/schema/agent-definitions.schema';
import type { SandboxConfig } from '../../../database/schema/sandbox-sessions.schema';
import type { ResourceSourceKind } from '../../../database/schema';
import { deriveAgentSandboxConfigFromCanvas } from '../agent-sandbox-config.utils';
import { migrateAgentCanvasGraph } from '../agent-input-node-migration.util';

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

const SandboxBindingRefSwaggerSchema = z.object({
  executionId: z.string().optional(),
  agentConversationId: z.string().optional(),
  sandboxNodeId: z.string().optional(),
});

const SandboxConfigSwaggerSchema = z.object({
  cpu: z.number(),
  memory: z.number(),
  disk: z.number(),
  persistencePath: z.string().optional(),
  timeout: z.number(),
  timeoutSeconds: z.number().optional(),
  conversationIdleAutoEndMinutes: z.number().optional(),
  restoreWorkspaceId: z.string().optional(),
  lifecycleMode: z.enum(['session', 'persistent']).optional(),
  persistenceExpiryHours: z.number().optional(),
  name: z.string().optional(),
  persistentSandboxId: z.string().optional(),
  activeBindings: z.array(SandboxBindingRefSwaggerSchema).optional(),
});

export const AgentDefinitionResponseSwaggerSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  runtimeMode: z.enum(['sandbox', 'no_sandbox']),
  status: z.enum(['draft', 'published', 'archived']),
  version: z.number().int(),
  publishedVersionId: z.string().nullable(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resourceSourceKind: ResourceSourceKindSwaggerSchema,
});

export const AgentDefinitionDetailResponseSwaggerSchema =
  AgentDefinitionResponseSwaggerSchema.extend({
    systemPrompt: z.string().nullable(),
    nodes: z.array(ReactFlowNodeSwaggerSchema),
    edges: z.array(ReactFlowEdgeSwaggerSchema),
    viewport: ReactFlowViewportSwaggerSchema.nullable(),
    sandboxConfig: SandboxConfigSwaggerSchema.nullable(),
    workspaceSnapshotId: z.string().nullable(),
    // metadata.inputSchema 是用户定义的动态 JSON Schema 对象。
    inputSchema: z.record(z.string(), z.unknown()).nullable(),
    memoryInstanceIds: z.array(z.string()).nullable(),
    sandboxLifecycle: z.enum(['session', 'persistent']).nullable(),
  });

export const AgentDefinitionListResponseSwaggerSchema = z.object({
  data: z.array(AgentDefinitionResponseSwaggerSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const AgentDefinitionDetailEnvelopeSwaggerSchema = z.object({
  data: AgentDefinitionDetailResponseSwaggerSchema,
});

export class AgentDefinitionListResponseSwaggerDto extends createZodDto(
  AgentDefinitionListResponseSwaggerSchema,
) {}

export class AgentDefinitionDetailResponseSwaggerDto extends createZodDto(
  AgentDefinitionDetailEnvelopeSwaggerSchema,
) {}

export type AgentDefinitionResponseDto = z.infer<
  typeof AgentDefinitionResponseSwaggerSchema
>;
export type AgentDefinitionDetailResponseDto = z.infer<
  typeof AgentDefinitionDetailResponseSwaggerSchema
>;

type ListField =
  | 'id'
  | 'tenantId'
  | 'name'
  | 'slug'
  | 'description'
  | 'icon'
  | 'runtimeMode'
  | 'status'
  | 'version'
  | 'publishedVersionId'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt';

type ListRow = Pick<AgentDefinition, ListField>;

type DetailRow = ListRow &
  Pick<
    AgentDefinition,
    | 'systemPrompt'
    | 'nodes'
    | 'edges'
    | 'viewport'
    | 'sandboxConfig'
    | 'workspaceSnapshotId'
    | 'metadata'
  >;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null;
}

function resolveSandboxLifecycle(
  metadata: Record<string, unknown> | null,
  sandboxConfig: SandboxConfig | null | undefined,
): 'session' | 'persistent' | null {
  const configLifecycle =
    sandboxConfig?.lifecycleMode === 'session' ||
    sandboxConfig?.lifecycleMode === 'persistent'
      ? sandboxConfig.lifecycleMode
      : null;

  if (configLifecycle) {
    return configLifecycle;
  }

  const metadataLifecycle = metadata?.sandboxLifecycle;
  return metadataLifecycle === 'session' || metadataLifecycle === 'persistent'
    ? metadataLifecycle
    : null;
}

function readDetailMetadata(
  metadata: Record<string, unknown> | null | undefined,
  sandboxConfig: SandboxConfig | null | undefined,
) {
  const normalizedMetadata = asRecord(metadata);
  const inputSchema = asRecord(normalizedMetadata?.inputSchema) ?? null;
  const memoryInstanceIds = asStringArray(
    normalizedMetadata?.memoryInstanceIds,
  );
  const sandboxLifecycle = resolveSandboxLifecycle(
    normalizedMetadata,
    sandboxConfig,
  );

  return {
    inputSchema,
    memoryInstanceIds,
    sandboxLifecycle,
  };
}

export function serializeAgentDefinition(
  row: ListRow,
  options?: { resourceSourceKind?: ResourceSourceKind },
): AgentDefinitionResponseDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    icon: row.icon ?? null,
    runtimeMode: row.runtimeMode,
    status: row.status,
    version: row.version,
    publishedVersionId: row.publishedVersionId ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resourceSourceKind: options?.resourceSourceKind ?? 'manual',
  };
}

export function serializeAgentDefinitionDetail(
  row: DetailRow,
  options?: { resourceSourceKind?: ResourceSourceKind },
): AgentDefinitionDetailResponseDto {
  const migratedCanvas = migrateAgentCanvasGraph({
    nodes: row.nodes,
    edges: row.edges,
    systemPrompt: row.systemPrompt ?? null,
  });
  const sandboxConfig =
    row.runtimeMode === 'sandbox'
      ? deriveAgentSandboxConfigFromCanvas(
          migratedCanvas.nodes,
          migratedCanvas.edges,
          row.sandboxConfig ?? null,
        )
      : null;
  const metadata = readDetailMetadata(row.metadata, sandboxConfig);

  return {
    ...serializeAgentDefinition(row, options),
    systemPrompt: migratedCanvas.systemPrompt ?? null,
    nodes: migratedCanvas.nodes,
    edges: migratedCanvas.edges,
    viewport: row.viewport ?? null,
    sandboxConfig,
    workspaceSnapshotId: row.workspaceSnapshotId ?? null,
    inputSchema: metadata.inputSchema,
    memoryInstanceIds: metadata.memoryInstanceIds,
    sandboxLifecycle: metadata.sandboxLifecycle,
  };
}
