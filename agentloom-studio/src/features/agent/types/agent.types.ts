import type { Viewport } from "@xyflow/react";
import type {
  AgentRuntimeConfig,
  SandboxConfig,
} from "@agentloom/contracts";
import type { CanvasEdge, CanvasNode } from "@/features/canvas/types";
import type { ResourceSourceKind } from "@/shared/lib/resourceSource";
import type { AgentRuntimeMode } from "./agentRuntimeMode";

export type AgentStatus = "draft" | "published" | "archived";

/**
 * Agent runtime 配置类型的唯一来源是 `@agentloom/contracts`（三端共享 wire 契约）。
 * 这里按 studio 既有名称原样 re-export，调用方 import 路径保持不变。
 */
export type {
  AgentModelConfig,
  AgentToolBinding,
  AgentKnowledgeBinding,
  AgentSubAgentRef,
  AgentInputPreprocessor,
  AgentRoutingConfig,
  AgentNativeToolPolicy,
  AgentSelfEvolutionPolicy,
  AgentRuntimeConfig,
} from "@agentloom/contracts";

/**
 * Agent 全局沙箱配置即 contracts 的 canonical `SandboxConfig`
 * （`cpu` / `memory` / `disk` / `timeout` 必需，不接受任何旧别名）。
 */
export type AgentGlobalSandboxConfig = SandboxConfig;

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

/**
 * Agent 列表项载荷，对应 server `AgentDefinitionResponseDto`。
 * 列表接口不返回画布与沙箱明细，因此这些字段只存在于 `AgentDefinition`。
 */
export interface AgentDefinitionSummary {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  runtimeMode: AgentRuntimeMode;
  status: AgentStatus;
  version: number;
  publishedVersionId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  resourceSourceKind: ResourceSourceKind;
}

/**
 * Agent 详情载荷，对应 server `AgentDefinitionDetailResponseDto`。
 * 详情接口始终返回下列字段（无值时为 `null`），故一律必需。
 */
export interface AgentDefinition extends AgentDefinitionSummary {
  systemPrompt: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport | null;
  sandboxConfig: AgentGlobalSandboxConfig | null;
  workspaceSnapshotId: string | null;
  inputSchema: Record<string, unknown> | null;
  memoryInstanceIds: string[] | null;
  sandboxLifecycle: "session" | "persistent" | null;
}
