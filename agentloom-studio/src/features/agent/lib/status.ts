import type { StatusTone } from "@/shared/ui/status-badge";
import type { AgentStatus } from "../types";

/**
 * Agent 状态 → 文案 + 语气，列表页与版本工具栏共用。
 * 草稿用 warning（尚未发布、对外不可用），与已归档的 neutral 区分开。
 */
export const AGENT_STATUS_META: Record<
  AgentStatus,
  { label: string; tone: StatusTone }
> = {
  draft: { label: "草稿", tone: "warning" },
  published: { label: "已发布", tone: "success" },
  archived: { label: "已归档", tone: "neutral" },
};
