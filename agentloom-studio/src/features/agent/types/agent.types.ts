import type { Viewport } from "@xyflow/react";
import type { CanvasEdge, CanvasNode } from "@/features/canvas/types";
import type { ResourceSourceKind } from "@/shared/lib/resourceSource";
import type { AgentRuntimeMode } from "./agentRuntimeMode";

export type AgentStatus = "draft" | "published" | "archived";

export interface AgentGlobalSandboxConfig {
  enabled?: boolean;
  cpu?: number;
  cpuLimit?: number;
  memory?: number;
  memoryLimitMb?: number;
  disk?: number;
  timeout?: number;
  timeoutSeconds?: number;
  conversationIdleAutoEndMinutes?: number;
  persistencePath?: string;
  restoreWorkspaceId?: string;
  lifecycleMode?: "session" | "persistent";
  persistenceExpiryHours?: number;
  allowedEnvKeys?: string[];
  extra?: Record<string, unknown>;
}

export interface AgentModelConfig {
  modelId?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  extra?: Record<string, unknown>;
}

export interface AgentToolBinding {
  toolId: string;
  mcpToolDefinitionId?: string;
  alias?: string;
  enabled: boolean;
}

export interface AgentKnowledgeBinding {
  knowledgeBaseId: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface AgentSubAgentRef {
  agentDefinitionId: string;
  agentVersionId: string | null;
  alias?: string;
}

export interface AgentInputPreprocessor {
  type: string;
  config?: Record<string, unknown>;
}

export interface AgentRoutingConfig {
  strategy?: string;
  fallbackChain?: string[];
}

export interface AgentNativeToolPolicy {
  readEnabled: boolean;
  writeEnabled: boolean;
  editEnabled: boolean;
  terminalEnabled: boolean;
}

export interface AgentSelfEvolutionPolicy {
  enabled: boolean;
  resourceManagement: boolean;
  externalEditing: boolean;
  sandboxManagement: boolean;
}

export interface AgentRuntimeConfig {
  runtimeMode?: AgentRuntimeMode;
  modelConfig?: AgentModelConfig;
  tools?: AgentToolBinding[];
  knowledgeBindings?: AgentKnowledgeBinding[];
  subAgents?: AgentSubAgentRef[];
  inputPreprocessors?: AgentInputPreprocessor[];
  sandboxConfig?: AgentGlobalSandboxConfig;
  routingConfig?: AgentRoutingConfig;
  nativeToolPolicy?: AgentNativeToolPolicy;
  selfEvolutionPolicy?: AgentSelfEvolutionPolicy;
}

export interface AgentVersionSnapshot {
  runtimeMode?: AgentRuntimeMode;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport | null;
  runtimeConfig?: AgentRuntimeConfig;
  metadata: {
    nodeCount: number;
    edgeCount: number;
    createdFromVersion: number;
    releaseNotes?: string | null;
    inputSchema?: Record<string, unknown>;
    memoryInstanceIds?: string[];
    sandboxLifecycle?: "session" | "persistent";
  };
}

export interface AgentVersion {
  id: string;
  agentDefinitionId: string;
  tenantId: string;
  versionNumber: number;
  label: string | null;
  snapshot: AgentVersionSnapshot;
  publishedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AgentCanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport | null;
}

export interface AgentDefinition {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  runtimeMode: AgentRuntimeMode;
  systemPrompt: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport | null;
  sandboxConfig: AgentGlobalSandboxConfig | null;
  workspaceSnapshotId: string | null;
  inputSchema?: Record<string, unknown> | null;
  memoryInstanceIds?: string[] | null;
  sandboxLifecycle?: "session" | "persistent" | null;
  resourceSourceKind?: ResourceSourceKind;
  version: number;
  status: AgentStatus;
  publishedVersionId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}
