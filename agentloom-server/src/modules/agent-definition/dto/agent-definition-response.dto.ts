import type { AgentDefinition } from '../../../database/schema/agent-definitions.schema';
import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';
import type { SandboxConfig } from '../../../database/schema/sandbox-sessions.schema';
import type { AgentRuntimeMode } from '../../../database/schema/agent-definitions.schema';
import { deriveAgentSandboxConfigFromCanvas } from '../agent-sandbox-config.utils';

export interface AgentDefinitionResponseDto {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  runtimeMode: AgentRuntimeMode;
  status: 'draft' | 'published' | 'archived';
  version: number;
  publishedVersionId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentDefinitionDetailResponseDto extends AgentDefinitionResponseDto {
  systemPrompt: string | null;
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport | null;
  sandboxConfig: SandboxConfig | null;
  workspaceSnapshotId: string | null;
  inputSchema: Record<string, unknown> | null;
  memoryInstanceIds: string[] | null;
  sandboxLifecycle: 'session' | 'persistent' | null;
}

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

function readDetailMetadata(
  metadata: Record<string, unknown> | null | undefined,
  sandboxConfig: SandboxConfig | null | undefined,
) {
  const normalizedMetadata = asRecord(metadata);
  const inputSchema = asRecord(normalizedMetadata?.inputSchema) ?? null;
  const memoryInstanceIds = asStringArray(
    normalizedMetadata?.memoryInstanceIds,
  );
  const metadataLifecycle = normalizedMetadata?.sandboxLifecycle;
  const sandboxLifecycle =
    metadataLifecycle === 'session' || metadataLifecycle === 'persistent'
      ? metadataLifecycle
      : sandboxConfig?.lifecycleMode === 'session' ||
          sandboxConfig?.lifecycleMode === 'persistent'
        ? sandboxConfig.lifecycleMode
        : null;

  return {
    inputSchema,
    memoryInstanceIds,
    sandboxLifecycle,
  };
}

export function serializeAgentDefinition(
  row: ListRow,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeAgentDefinitionDetail(
  row: DetailRow,
): AgentDefinitionDetailResponseDto {
  const sandboxConfig =
    row.runtimeMode === 'sandbox'
      ? deriveAgentSandboxConfigFromCanvas(
          row.nodes,
          row.edges,
          row.sandboxConfig ?? null,
        )
      : null;
  const metadata = readDetailMetadata(row.metadata, sandboxConfig);

  return {
    ...serializeAgentDefinition(row),
    systemPrompt: row.systemPrompt ?? null,
    nodes: row.nodes,
    edges: row.edges,
    viewport: row.viewport ?? null,
    sandboxConfig,
    workspaceSnapshotId: row.workspaceSnapshotId ?? null,
    inputSchema: metadata.inputSchema,
    memoryInstanceIds: metadata.memoryInstanceIds,
    sandboxLifecycle: metadata.sandboxLifecycle,
  };
}
