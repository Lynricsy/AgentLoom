import type {
  AgentRuntimeConfig,
  AgentSelfEvolutionPolicy,
} from '../agent-definition/agent-runtime-config.interface';
import type { ToolPermissionRequest } from '../agent/types/tool-call-event.types';

export const SELF_EVOLUTION_DOMAIN = 'self_evolution' as const;

export const SELF_EVOLUTION_TOOL_NAMES = [
  'query_state',
  'query_resource_pool',
  'propose_change',
  'apply_change',
  'create_resource',
] as const;

export type SelfEvolutionToolName =
  (typeof SELF_EVOLUTION_TOOL_NAMES)[number];

export const SELF_EVOLUTION_CATEGORY_VALUES = [
  'agent_self_canvas_edit',
  'agent_external_edit',
  'workflow_edit',
  'skill_resource_management',
  'mcp_resource_management',
  'model_resource_management',
  'workspace_resource_management',
  'workspace_sandbox_binding_adjustment',
  'sandbox_spec_adjustment',
] as const;

export type SelfEvolutionCategory =
  (typeof SELF_EVOLUTION_CATEGORY_VALUES)[number];

export type SelfEvolutionRiskLevel = 'low' | 'medium' | 'high';

export type SelfEvolutionRememberScope = 'none' | 'conversation_category';

export interface SelfEvolutionSessionContext {
  sessionId: string;
  conversationId: string;
  tenantId: string;
  actorUserId: string;
  currentAgentDefinitionId: string;
  currentAgentName: string;
  selfEvolutionPolicy: AgentSelfEvolutionPolicy;
  runtimeConfig?: AgentRuntimeConfig;
}

export interface SelfEvolutionToolResult<TData = unknown> {
  success: boolean;
  data: TData | null;
  error?: string;
}

export type SelfEvolutionTargetKind = 'self' | 'agent' | 'workflow';

export interface GraphNodeOperation {
  op: 'add' | 'update' | 'remove';
  nodeId?: string;
  node?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}

export interface GraphEdgeOperation {
  op: 'add' | 'update' | 'remove';
  edgeId?: string;
  edge?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}

export interface SelfEvolutionGraphProposal {
  domain: typeof SELF_EVOLUTION_DOMAIN;
  targetKind: SelfEvolutionTargetKind;
  targetId: string;
  targetLabel: string;
  baseVersion: number;
  publishTarget: boolean;
  nodeOperations: GraphNodeOperation[];
  edgeOperations: GraphEdgeOperation[];
  viewport?: Record<string, unknown>;
  metadataPatch?: Record<string, unknown>;
  summary: string;
  category: SelfEvolutionCategory;
  riskLevel: SelfEvolutionRiskLevel;
  requiresConfirmation: boolean;
  diffPreview: Record<string, unknown>;
}

export interface SelfEvolutionPermissionRequest extends ToolPermissionRequest {
  readonly domain: typeof SELF_EVOLUTION_DOMAIN;
  readonly category: SelfEvolutionCategory;
  readonly riskLevel: SelfEvolutionRiskLevel;
  readonly sourceLabel: string;
  readonly targetType: string;
  readonly targetLabel: string;
  readonly approveEffect: string;
  readonly denyEffect: string;
  readonly diffPreview: Record<string, unknown>;
  readonly rememberable: boolean;
}

export interface RemoteToolExecutionCompleted {
  outcome?: 'completed';
  result: unknown;
}

export interface RemoteToolExecutionAwaitingPermission {
  outcome: 'awaiting_permission';
  permissionRequest: ToolPermissionRequest;
}

export interface RemoteToolExecutionDenied {
  outcome: 'denied';
  result: unknown;
  permissionRequest?: ToolPermissionRequest;
}

export type SelfEvolutionRemoteToolOutcome =
  | RemoteToolExecutionCompleted
  | RemoteToolExecutionAwaitingPermission
  | RemoteToolExecutionDenied;
