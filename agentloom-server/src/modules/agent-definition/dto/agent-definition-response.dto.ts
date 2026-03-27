import type { AgentDefinition } from '../../../database/schema/agent-definitions.schema';
import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';
import type { SandboxConfig } from '../../../database/schema/sandbox-sessions.schema';

export interface AgentDefinitionResponseDto {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
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
}

const LIST_FIELDS = [
  'id',
  'tenantId',
  'name',
  'slug',
  'description',
  'status',
  'version',
  'publishedVersionId',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

type ListRow = Pick<AgentDefinition, (typeof LIST_FIELDS)[number]>;

type DetailRow = ListRow &
  Pick<
    AgentDefinition,
    | 'systemPrompt'
    | 'nodes'
    | 'edges'
    | 'viewport'
    | 'sandboxConfig'
    | 'workspaceSnapshotId'
  >;

export function serializeAgentDefinition(
  row: ListRow,
): AgentDefinitionResponseDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
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
  return {
    ...serializeAgentDefinition(row),
    systemPrompt: row.systemPrompt ?? null,
    nodes: row.nodes,
    edges: row.edges,
    viewport: row.viewport ?? null,
    sandboxConfig: row.sandboxConfig ?? null,
    workspaceSnapshotId: row.workspaceSnapshotId ?? null,
  };
}
