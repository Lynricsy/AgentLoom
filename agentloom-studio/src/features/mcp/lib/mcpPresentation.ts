import type { McpServerConfigSummary, McpTransportType } from "../types";

type McpServerStatus = McpServerConfigSummary["status"];

export const TRANSPORT_LABEL: Record<McpTransportType, string> = {
  stdio: "stdio",
  sse: "SSE",
  streamable_http: "HTTP",
};

/** 传输方式着色取数据类型令牌，与画布端口体系同源 */
export const TRANSPORT_TONE: Record<McpTransportType, string> = {
  stdio: "var(--color-type-text)",
  sse: "var(--color-type-json)",
  streamable_http: "var(--color-type-model)",
};

export const SERVER_STATUS_META: Record<
  McpServerStatus,
  { label: string; variant: "success" | "warning" | "error" }
> = {
  active: { label: "活跃", variant: "success" },
  inactive: { label: "未激活", variant: "warning" },
  error: { label: "错误", variant: "error" },
};
