import type {
  ImportMcpToolsDtoConflictStrategyEnum,
  TestMcpConnectionDtoConnection,
  TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum,
  TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum,
  TestMcpConnectionDtoConnectionOneOfTransportTypeEnum,
} from "@agentloom/api-client";
import type {
  BackendPortMappingMetadata,
  McpToolDefinition as CanvasMcpToolDefinition,
} from "@/features/canvas";
import type { ResourceSourceKind } from "@/shared/lib/resourceSource";

export type McpImportConflictStrategy = ImportMcpToolsDtoConflictStrategyEnum;

export type McpTransportType =
  | TestMcpConnectionDtoConnectionOneOfTransportTypeEnum
  | TestMcpConnectionDtoConnectionOneOf1TransportTypeEnum
  | TestMcpConnectionDtoConnectionOneOf2TransportTypeEnum;

/**
 * MCP 连接配置（生成模型的 oneOf 判别联合）。
 *
 * 原手写类型把 `command` / `url` 都标成可选的平铺结构，
 * 允许 `{ transportType: 'stdio' }` 这种 server 必然拒绝的形状。
 * 生成模型按 `transportType` 判别：stdio 要求 `command`，
 * sse / streamable_http 要求 `url`。
 */
export type McpConnectionConfig = TestMcpConnectionDtoConnection;

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion?: string;
}

export interface McpToolDefinition extends CanvasMcpToolDefinition {
  importedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TestMcpConnectionPayload {
  connection: McpConnectionConfig;
}

export interface TestMcpConnectionResult {
  success: boolean;
  serverInfo?: McpServerInfo;
}

export interface DiscoverMcpToolsPayload extends TestMcpConnectionPayload {}

export interface DiscoveredMcpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface DiscoverMcpToolsResult {
  tools: DiscoveredMcpTool[];
  serverInfo?: Pick<McpServerInfo, "name" | "version">;
}

export interface ImportedToolResult {
  toolDefinitionId?: string;
  toolName: string;
  status: "imported" | "overwritten" | "skipped" | "failed";
  title?: string;
  description?: string;
  portMappingMetadata?: BackendPortMappingMetadata;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface ImportMcpToolsResult {
  mcpServerConfigId: string;
  summary: {
    total: number;
    imported: number;
    overwritten: number;
    skipped: number;
    failed: number;
  };
  results: ImportedToolResult[];
}

export interface ImportMcpToolsPayload extends DiscoverMcpToolsPayload {
  serverName: string;
  serverDescription?: string;
  toolNames: string[];
  conflictStrategy: McpImportConflictStrategy;
}

export interface ReimportMcpToolsPayload {
  mcpServerConfigId: string;
  toolNames: string[];
  conflictStrategy: McpImportConflictStrategy;
}

export interface McpServerConfigSummary {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  description: string | null;
  transportType: McpTransportType;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  toolCount: number;
  sourceKind?: ResourceSourceKind;
}

export interface McpServerConfigDetail extends Omit<McpServerConfigSummary, 'toolCount'> {
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  credentialKeys: string[];
  tools: McpToolDefinition[];
}

export interface McpServerConfigQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'error';
  transportType?: McpTransportType;
  sourceKind?: ResourceSourceKind;
}

export interface UpdateMcpServerConfigPayload {
  name?: string;
  description?: string | null;
  status?: 'active' | 'inactive';
  connection?: McpConnectionConfig;
}

export interface McpImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "import" | "reimport";
  mcpServerConfigId?: string;
  restoreFocusElement?: HTMLElement | null;
  serverLabel?: string;
}

export const RECEIPT_STATUS_LABELS: Record<
  ImportedToolResult["status"],
  string
> = {
  imported: "已导入",
  overwritten: "已覆盖",
  skipped: "已跳过",
  failed: "失败",
};
