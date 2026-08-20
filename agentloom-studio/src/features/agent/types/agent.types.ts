import type { Viewport } from "@xyflow/react";
import type {
  AgentDefinitionDetailResponseSwaggerDtoData,
  AgentDefinitionListResponseSwaggerDtoDataInner,
} from "@agentloom/api-client";
import type {
  AgentRuntimeConfig,
  SandboxConfig,
} from "@agentloom/contracts";
import type { CanvasEdge, CanvasNode } from "@/features/canvas";
import type { AgentRuntimeMode } from "./agentRuntimeMode";

export type AgentStatus =
  AgentDefinitionListResponseSwaggerDtoDataInner["status"];

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
 * Agent 列表项直接复用 OpenAPI 生成的 wire 类型。
 */
export type AgentDefinitionSummary =
  AgentDefinitionListResponseSwaggerDtoDataInner;

/**
 * Agent 详情直接复用 OpenAPI 生成的 wire 类型。
 */
export type AgentDefinition = AgentDefinitionDetailResponseSwaggerDtoData;
