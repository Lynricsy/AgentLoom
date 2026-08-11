import {
  ArrowRightFromLine,
  Bot,
  BookOpenText,
  Brain,
  BrainCircuit,
  Braces,
  CircleOff,
  Clock,
  Code,
  Container,
  Database,
  FileText,
  FastForward,
  Filter,
  GitBranch,
  GitFork,
  GitMerge,
  Globe,
  MessageSquare,
  Package,
  Play,
  Plug,
  Puzzle,
  Radio,
  RefreshCcw,
  Repeat,
  Repeat2,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { getLlmConfigState } from "@/features/llm";
import type { StepStatus } from "@/features/execution/types";
import type { NodeCategory } from "../../types";

/** 节点注册表 `icon` 字符串 → lucide 组件 */
export const NODE_TYPE_ICONS: Record<string, LucideIcon> = {
  Bot,
  BookOpenText,
  Brain,
  MessageSquare,
  Globe,
  Code,
  Plug,
  Container,
  Play,
  Clock,
  Database,
  FileText,
  Braces,
  GitBranch,
  GitFork,
  GitMerge,
  Repeat,
  Repeat2,
  Package,
  Puzzle,
  Radio,
  BrainCircuit,
  Webhook,
  Filter,
  RefreshCcw,
  ArrowRightFromLine,
  CircleOff,
  FastForward,
};

/** 解析注册表图标名；未收录时回退通用 Bot 图标 */
export function resolveNodeIcon(iconName: string | undefined): LucideIcon {
  return (iconName ? NODE_TYPE_ICONS[iconName] : undefined) ?? Bot;
}

/** `getLlmConfigState()` 的三态结果，供节点渲染层传递 */
export type LlmVisualState = "unconfigured" | "warning" | "configured";

export type NodeShellStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "waiting_intervention";

export const COMPACT_STATUS_META: Record<
  StepStatus | "idle",
  { label: string; className: string }
> = {
  idle: {
    label: "空闲",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  pending: {
    label: "等待中",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  queued: {
    label: "排队中",
    className: "border-info/30 bg-info/10 text-info",
  },
  running: {
    label: "运行中",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  completed: {
    label: "已完成",
    className: "border-success/30 bg-success/10 text-success",
  },
  failed: {
    label: "失败",
    className: "border-error/30 bg-error/10 text-error",
  },
  waiting_intervention: {
    label: "待干预",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  skipped: {
    label: "已跳过",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  cancelled: {
    label: "已取消",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

/** 8 个 NodeCategory 的类别色令牌 */
const CATEGORY_ACCENT_TOKENS: Record<NodeCategory, string> = {
  agent: "var(--color-node-agent)",
  tool: "var(--color-node-tool)",
  trigger: "var(--color-node-trigger)",
  knowledge: "var(--color-node-knowledge)",
  output: "var(--color-node-output)",
  control: "var(--color-node-control)",
  plugin: "var(--color-node-plugin)",
  memory: "var(--color-node-memory)",
};

/**
 * nodeType 级着色覆盖：这三个类型没有独立 category，
 * 但视觉上需要与所属 category 区分开。
 */
const NODE_TYPE_ACCENT_OVERRIDES: Record<string, string> = {
  "smart-routing": "var(--color-node-routing)",
  "input-preprocessor": "var(--color-node-preprocessing)",
  skill: "var(--color-node-skill)",
};

/** 节点类别色：nodeType 级覆盖优先，其次 category，未知 category 回退 control */
export function getNodeAccentToken(
  nodeType: string,
  category: NodeCategory,
): string {
  return (
    NODE_TYPE_ACCENT_OVERRIDES[nodeType] ??
    CATEGORY_ACCENT_TOKENS[category] ??
    CATEGORY_ACCENT_TOKENS.control
  );
}

/**
 * 节点卡主色。除 `llm-model` 未配置 / 缺 API Key 两种状态需要用
 * muted / warning 语义色提示外，一律取类别色。
 */
export function getNodeColorToken(
  nodeType: string,
  category: NodeCategory,
  rawConfig: Record<string, unknown>,
  hasProviderDefaultKey = false,
): string {
  if (nodeType !== "llm-model") {
    return getNodeAccentToken(nodeType, category);
  }

  const state = getLlmConfigState(rawConfig, hasProviderDefaultKey);

  switch (state) {
    case "unconfigured":
      return "var(--color-muted)";
    case "warning":
      return "var(--color-warning)";
    default:
      return getNodeAccentToken(nodeType, category);
  }
}

export function getShellStatus(
  status: StepStatus | undefined,
  showCompletedAccent: boolean,
): NodeShellStatus {
  switch (status) {
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "failed":
      return "failed";
    case "waiting_intervention":
      return "waiting_intervention";
    case "completed":
      return showCompletedAccent ? "completed" : "idle";
    default:
      return "idle";
  }
}

/** 左侧执行状态色条的样式；idle 返回 null 表示不渲染 */
export function getShellAccentVisual(status: NodeShellStatus): string | null {
  switch (status) {
    case "running":
      return "bg-primary animate-pulse";
    case "completed":
      return "bg-success";
    case "failed":
      return "bg-error";
    case "waiting_intervention":
      return "bg-warning animate-pulse";
    case "queued":
      return "bg-muted-foreground/70";
    default:
      return null;
  }
}

/** minimal LOD 下 handle 沿卡片纵向均分的百分比偏移 */
export function getMinimalHandleOffsets(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return ["50%"];
  }

  return Array.from(
    { length: count },
    (_, index) => `${((index + 1) / (count + 1)) * 100}%`,
  );
}
