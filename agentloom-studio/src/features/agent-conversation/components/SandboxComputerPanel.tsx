import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Monitor,
  Terminal,
  Cpu,
  HardDrive,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileX,
  FilePenLine,
  Wrench,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  useConversationSandboxProcesses,
  useConversationSandboxStats,
} from "../api/conversationQueries";
import {
  formatSandboxBytes,
  formatSandboxMegabytes,
  getSandboxDiskPercent,
  safeSandboxPercent,
} from "@/features/sandbox/lib/sandboxStats";
import type { SandboxProcess } from "@/features/sandbox/types";
import { getToolRenderer } from "@/shared/components/tool-renderers/registry";
import { defaultRendererDefinition } from "@/shared/components/tool-renderers/DefaultRenderer";
import { deriveRenderState } from "@/shared/components/tool-renderers/ToolCallCard";
import type { ToolCallData } from "@/shared/components/tool-renderers/types";
import type { TerminalEntry, FileChange, SandboxStatus } from "../types";

interface SandboxComputerPanelProps {
  conversationId?: string | null;
  agentName: string;
  terminalEntries: TerminalEntry[];
  fileChanges: FileChange[];
  sandboxStatus: SandboxStatus;
  isExecuting: boolean;
  suspendPolling?: boolean;
  /** 当前活跃的工具调用（正在执行的），用于实时更新工具详情 tab */
  activeToolCall?: ToolCallData;
}

const HeaderMetric = memo(function HeaderMetric({
  icon,
  label,
  value,
}: {
  icon?: typeof Cpu;
  label: string;
  value: string;
}) {
  const Icon = icon;

  return (
    <div className="flex items-center gap-1 rounded-md border border-border/40 bg-surface px-2 py-1 text-[10px] text-muted-foreground">
      {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
      <span className="uppercase tracking-wide">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
});

function StatusDot({ status }: { status: SandboxStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        status === "running" && "bg-success animate-pulse",
        status === "idle" && "bg-muted-foreground",
        status === "error" && "bg-error",
      )}
    />
  );
}

type ProcessStatusTone = "info" | "success" | "warning" | "muted" | "error";

interface ActivityItem {
  id: string;
  icon: typeof Cpu;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: ProcessStatusTone;
  command?: string;
  preview?: string;
  meta: string[];
}

function clipText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(limit - 1, 1))}…`;
}

function stripAnsi(value: string): string {
  let result = "";
  let index = 0;

  while (index < value.length) {
    if (value.charCodeAt(index) === 27 && value[index + 1] === "[") {
      index += 2;
      while (index < value.length && value[index] !== "m") {
        index += 1;
      }
      if (value[index] === "m") {
        index += 1;
      }
      continue;
    }

    result += value[index];
    index += 1;
  }

  return result;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeCommand(command?: string): string | undefined {
  if (!command) {
    return undefined;
  }
  const normalized = normalizeInlineText(command);
  return normalized.length > 0 ? clipText(normalized, 96) : undefined;
}

function summarizeTerminalOutput(output: string): string | undefined {
  const normalized = normalizeInlineText(stripAnsi(output));
  return normalized.length > 0 ? clipText(normalized, 140) : undefined;
}

function findLastSummary<T>(
  items: T[],
  pick: (item: T) => string | undefined,
): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    const value = pick(item);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function getToolProcessStatus(status: ToolCallData["status"]): {
  label: string;
  tone: ProcessStatusTone;
} {
  switch (status) {
    case "completed":
      return { label: "完成", tone: "success" };
    case "failed":
      return { label: "失败", tone: "error" };
    case "denied":
      return { label: "已拒绝", tone: "error" };
    case "awaiting_permission":
      return { label: "待授权", tone: "warning" };
    case "pending":
      return { label: "排队中", tone: "muted" };
    case "in_progress":
    default:
      return { label: "执行中", tone: "info" };
  }
}

function getProcessStatusClasses(tone: ProcessStatusTone): string {
  switch (tone) {
    case "success":
      return "border-success/30 bg-success/10 text-success";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    case "error":
      return "border-error/30 bg-error/10 text-error";
    case "muted":
      return "border-border/60 bg-surface text-muted-foreground";
    case "info":
    default:
      return "border-info/30 bg-info/10 text-info";
  }
}

function buildFallbackActivityItems(params: {
  terminalEntries: TerminalEntry[];
  sandboxStatus: SandboxStatus;
  activeToolCall?: ToolCallData;
}): ActivityItem[] {
  const { terminalEntries, sandboxStatus, activeToolCall } = params;
  const items: ActivityItem[] = [];

  if (activeToolCall) {
    const status = getToolProcessStatus(activeToolCall.status);
    const errorPreview =
      typeof activeToolCall.error === "string" &&
      activeToolCall.error.trim().length > 0
        ? clipText(activeToolCall.error.trim(), 140)
        : undefined;

    items.push({
      id: `tool-${activeToolCall.id}`,
      icon: Wrench,
      title: activeToolCall.tool,
      subtitle:
        activeToolCall.status === "pending" ||
        activeToolCall.status === "in_progress" ||
        activeToolCall.status === "awaiting_permission"
          ? "当前前台工具调用"
          : "最近工具调用",
      statusLabel: status.label,
      statusTone: status.tone,
      preview: errorPreview ?? "详细结果仍在“工具”标签页中查看。",
      meta: ["工具详情见“工具”标签页"],
    });
  }

  const sessionGroups = new Map<string, TerminalEntry[]>();
  const unscopedEntries: TerminalEntry[] = [];

  for (const entry of terminalEntries) {
    if (entry.sessionId) {
      const existing = sessionGroups.get(entry.sessionId);
      if (existing) {
        existing.push(entry);
      } else {
        sessionGroups.set(entry.sessionId, [entry]);
      }
      continue;
    }
    unscopedEntries.push(entry);
  }

  const groupedSessions = Array.from(sessionGroups.entries())
    .map(([sessionId, entries]) => {
      const latestEntry = entries[entries.length - 1]!;
      return {
        sessionId,
        entries,
        latestTimestamp: latestEntry.timestamp,
        latestCommand: findLastSummary(entries, (entry) =>
          summarizeCommand(entry.command),
        ),
        latestPreview: findLastSummary(entries, (entry) =>
          summarizeTerminalOutput(entry.output),
        ),
      };
    })
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp);

  groupedSessions.forEach((session, index) => {
    const isActive = sandboxStatus === "running" && index === 0;
    items.push({
      id: `pty-${session.sessionId}`,
      icon: Terminal,
      title: `终端会话 ${index + 1}`,
      subtitle: `PTY ${clipText(session.sessionId, 18)}`,
      statusLabel: isActive ? "活跃" : "最近活动",
      statusTone: isActive ? "info" : "muted",
      command: session.latestCommand,
      preview: session.latestPreview,
      meta: [`输出 ${session.entries.length} 条`],
    });
  });

  if (unscopedEntries.length > 0) {
    items.push({
      id: "stdout-unscoped",
      icon: Monitor,
      title: "前台标准输出",
      subtitle: "未关联 PTY 会话的运行输出",
      statusLabel:
        sandboxStatus === "running" && groupedSessions.length === 0
          ? "活跃"
          : "最近活动",
      statusTone:
        sandboxStatus === "running" && groupedSessions.length === 0
          ? "info"
          : "muted",
      command: findLastSummary(unscopedEntries, (entry) =>
        summarizeCommand(entry.command),
      ),
      preview: findLastSummary(unscopedEntries, (entry) =>
        summarizeTerminalOutput(entry.output),
      ),
      meta: [`输出 ${unscopedEntries.length} 条`],
    });
  }

  return items;
}

const ActivityCard = memo(function ActivityCard({
  item,
}: {
  item: ActivityItem;
}) {
  const Icon = item.icon;

  return (
    <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-border/50 bg-background/70 p-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {item.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {item.subtitle}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                getProcessStatusClasses(item.statusTone),
              )}
            >
              {item.statusLabel}
            </span>
          </div>

          {item.command ? (
            <div className="mt-2 rounded-md border border-success/20 bg-success/5 px-2.5 py-2 font-mono text-[11px] text-success break-all">
              <span className="mr-1 text-muted-foreground">$</span>
              {item.command}
            </div>
          ) : null}

          {item.preview ? (
            <div className="mt-2 text-xs leading-relaxed text-foreground/80">
              {item.preview}
            </div>
          ) : null}

          {item.meta.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.meta.map((meta) => (
                <span
                  key={`${item.id}-${meta}`}
                  className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {meta}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function getProcessStateMeta(state: string): {
  label: string;
  tone: ProcessStatusTone;
} {
  const normalized = state.trim().charAt(0).toUpperCase();
  switch (normalized) {
    case "R":
      return { label: "运行中", tone: "info" };
    case "S":
    case "I":
    case "D":
      return { label: "休眠", tone: "muted" };
    case "T":
      return { label: "暂停", tone: "warning" };
    case "Z":
    case "X":
      return { label: "异常", tone: "error" };
    default:
      return { label: state || "未知", tone: "muted" };
  }
}

function formatProcessPercent(value: number): string {
  return `${safeSandboxPercent(value)}%`;
}

const ProcessTableRow = memo(function ProcessTableRow({
  process,
}: {
  process: SandboxProcess;
}) {
  const stateMeta = getProcessStateMeta(process.state);
  const commandPreview = clipText(process.command, 180);

  return (
    <tr
      data-testid={`sandbox-process-row-${process.pid}`}
      className="border-b border-border/30 align-top last:border-0"
    >
      <td className="px-3 py-2 font-mono text-[11px] text-foreground/85">
        {process.pid}
      </td>
      <td className="px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {process.executable}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
            {commandPreview}
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              "inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium",
              getProcessStatusClasses(stateMeta.tone),
            )}
          >
            {stateMeta.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {process.state}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-foreground/85">
        {formatProcessPercent(process.cpuPercent)}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-foreground/85">
        {formatProcessPercent(process.memoryPercent)}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
        {process.elapsed}
      </td>
    </tr>
  );
});

function ProcessMonitorView({
  processes,
  isLoading,
  fallbackItems,
  hasRealtimeSource,
}: {
  processes: SandboxProcess[] | null;
  isLoading: boolean;
  fallbackItems: ActivityItem[];
  hasRealtimeSource: boolean;
}) {
  if (isLoading && (!processes || processes.length === 0)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <Loader2 className="mb-3 h-5 w-5 animate-spin" />
        <div className="text-sm">正在读取容器进程快照…</div>
        <div className="mt-1 text-xs leading-relaxed">
          {hasRealtimeSource
            ? "进程数据每 5 秒自动刷新一次。"
            : "当前视图还没有连接到实时进程数据源。"}
        </div>
      </div>
    );
  }

  if (processes && processes.length > 0) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/30 bg-surface-elevated/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <div className="font-medium text-foreground/90">实时进程快照</div>
          <div className="mt-0.5">
            按 CPU /
            内存占用排序展示当前沙箱进程，效果更接近任务管理器而不是终端日志。
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table
            data-testid="sandbox-process-table"
            className="min-w-full border-collapse"
          >
            <thead className="sticky top-0 z-10 bg-surface text-left">
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-3 py-2 font-medium">PID</th>
                <th className="px-3 py-2 font-medium">命令</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">CPU</th>
                <th className="px-3 py-2 font-medium">MEM</th>
                <th className="px-3 py-2 font-medium">运行时长</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((process) => (
                <ProcessTableRow key={process.pid} process={process} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (fallbackItems.length > 0) {
    return (
      <div
        data-testid="sandbox-process-fallback"
        className="flex-1 overflow-y-auto p-3"
      >
        <div className="mb-3 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {hasRealtimeSource
            ? "当前还没有拿到真实进程快照，先退回展示最近活动摘要。"
            : "当前视图尚未接入真实进程采样，下面展示最近活动摘要。"}
        </div>
        <div className="space-y-3">
          {fallbackItems.map((item) => (
            <ActivityCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="sandbox-process-empty"
      className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground"
    >
      <Cpu className="mb-3 h-5 w-5 opacity-50" />
      <div className="text-sm">
        {hasRealtimeSource ? "暂无可展示的进程快照" : "当前视图未接入进程快照"}
      </div>
      <div className="mt-1 text-xs leading-relaxed">
        {hasRealtimeSource
          ? "当沙箱启动并产生活动后，这里会显示真实的进程表。"
          : "这里保留给会话沙箱的实时进程监视器使用。"}
      </div>
    </div>
  );
}

function changeTypeIcon(changeType: FileChange["changeType"]) {
  switch (changeType) {
    case "created":
      return <FilePlus className="h-3.5 w-3.5 text-success" />;
    case "modified":
      return <FilePenLine className="h-3.5 w-3.5 text-warning" />;
    case "deleted":
      return <FileX className="h-3.5 w-3.5 text-error" />;
  }
}

function changeTypeLabel(changeType: FileChange["changeType"]) {
  switch (changeType) {
    case "created":
      return "新建";
    case "modified":
      return "修改";
    case "deleted":
      return "删除";
  }
}

const FileChangeItem = memo(function FileChangeItem({
  change,
}: {
  change: FileChange;
}) {
  const [expanded, setExpanded] = useState(false);
  const fileName = change.path.split("/").pop() ?? change.path;
  const dirPath = change.path.split("/").slice(0, -1).join("/");
  const hasDiff = !!change.diff;
  const hasContent = !!change.content;

  const toggleExpand = useCallback(() => {
    if (hasDiff || hasContent) {
      setExpanded((prev) => !prev);
    }
  }, [hasDiff, hasContent]);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={toggleExpand}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-elevated/50 transition-colors",
          (hasDiff || hasContent) && "cursor-pointer",
        )}
      >
        {hasDiff || hasContent ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {changeTypeIcon(change.changeType)}
        <span className="font-mono text-foreground truncate">{fileName}</span>
        {dirPath && (
          <span className="text-muted-foreground truncate ml-auto text-[10px]">
            {dirPath}
          </span>
        )}
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded shrink-0",
            change.changeType === "created" && "bg-success/15 text-success",
            change.changeType === "modified" && "bg-warning/15 text-warning",
            change.changeType === "deleted" && "bg-error/15 text-error",
          )}
        >
          {changeTypeLabel(change.changeType)}
        </span>
      </button>

      {expanded && (hasDiff || hasContent) && (
        <div className="px-3 pb-2">
          <pre className="bg-background rounded-md p-2 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
            {change.diff ? (
              <DiffHighlight diff={change.diff} />
            ) : (
              <span className="text-foreground/80">{change.content}</span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
});

function DiffHighlight({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        let lineClass = "text-foreground/80";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          lineClass = "text-success bg-success/10";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          lineClass = "text-error bg-error/10";
        } else if (line.startsWith("@@")) {
          lineClass = "text-info";
        }
        return (
          <div key={`${i}-${line.slice(0, 20)}`} className={lineClass}>
            {line}
          </div>
        );
      })}
    </>
  );
}

function FileChangesView({ changes }: { changes: FileChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <FileCode className="h-4 w-4 mr-2 opacity-50" />
        <span>暂无文件变更</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {changes.map((change, index) => (
        <FileChangeItem key={`${change.path}-${index}`} change={change} />
      ))}
    </div>
  );
}

/** 活跃工具调用详情面板 */
function ActiveToolView({ toolCall }: { toolCall: ToolCallData }) {
  const renderer = getToolRenderer(toolCall.tool) ?? defaultRendererDefinition;
  const state = deriveRenderState(toolCall.status);
  const Icon = renderer.icon;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-mono font-medium text-foreground truncate">
          {toolCall.tool}
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] px-1.5 py-0.5 rounded",
            state === "completed" && "bg-success/15 text-success",
            state === "failed" && "bg-error/15 text-error",
            (state === "pending" || state === "streaming") &&
              "bg-info/15 text-info",
          )}
        >
          {state === "completed"
            ? "完成"
            : state === "failed"
              ? "失败"
              : "执行中"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <renderer.Detail toolCall={toolCall} state={state} />
      </div>
    </div>
  );
}

function ToolIdleView() {
  return (
    <div
      data-testid="sandbox-tool-empty"
      className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground"
    >
      <Wrench className="mb-3 h-5 w-5 opacity-50" />
      <div className="text-sm">本轮执行已开始，等待工具调用</div>
      <div className="mt-1 text-xs leading-relaxed">
        如果 Agent
        正在思考或只输出文本，这里会暂时保持空态；一旦调用工具，详情会实时更新。
      </div>
    </div>
  );
}

type PanelTab = "process" | "changes" | "tool";

export function SandboxComputerPanel({
  conversationId,
  agentName,
  terminalEntries,
  fileChanges,
  sandboxStatus,
  isExecuting,
  suspendPolling = false,
  activeToolCall,
}: SandboxComputerPanelProps) {
  const polledSandboxStatus = suspendPolling ? "idle" : sandboxStatus;
  const [activeTab, setActiveTab] = useState<PanelTab>(() =>
    isExecuting ? "tool" : "process",
  );
  const prevExecutingRef = useRef(isExecuting);
  const { data: sandboxStats } = useConversationSandboxStats(
    conversationId,
    polledSandboxStatus,
  );
  const { data: sandboxProcesses, isLoading: isProcessLoading } =
    useConversationSandboxProcesses(conversationId, polledSandboxStatus);
  const fallbackItems = useMemo(
    () =>
      buildFallbackActivityItems({
        terminalEntries,
        sandboxStatus,
        activeToolCall,
      }),
    [terminalEntries, sandboxStatus, activeToolCall],
  );
  const visibleProcessCount =
    sandboxProcesses && sandboxProcesses.length > 0
      ? sandboxProcesses.length
      : fallbackItems.length;
  const diskPercent = sandboxStats ? getSandboxDiskPercent(sandboxStats) : null;
  const cpuLabel = sandboxStats
    ? `${safeSandboxPercent(sandboxStats.cpuPercent)}%`
    : "--";
  const memoryLabel = sandboxStats
    ? `${formatSandboxMegabytes(sandboxStats.memoryUsageMb)} / ${formatSandboxMegabytes(sandboxStats.memoryLimitMb)}`
    : "--";
  const diskLabel =
    sandboxStats &&
    sandboxStats.diskUsage != null &&
    sandboxStats.diskTotal != null &&
    diskPercent !== null
      ? `${formatSandboxBytes(sandboxStats.diskUsage)} / ${formatSandboxBytes(sandboxStats.diskTotal)}`
      : "--";
  const showToolTab = isExecuting || Boolean(activeToolCall);
  const visibleActiveTab =
    activeTab === "tool" && !showToolTab ? "process" : activeTab;

  useEffect(() => {
    if (isExecuting && !prevExecutingRef.current) {
      setActiveTab("tool");
    }
    prevExecutingRef.current = isExecuting;
  }, [isExecuting]);

  useEffect(() => {
    if (!showToolTab && activeTab === "tool") {
      setActiveTab("process");
    }
  }, [activeTab, showToolTab]);

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-info" />
          <span className="text-sm font-medium text-foreground">
            {agentName}的电脑
          </span>
          <StatusDot status={sandboxStatus} />
        </div>

        <div className="flex items-center gap-2">
          <HeaderMetric icon={Cpu} label="CPU" value={cpuLabel} />
          <HeaderMetric label="MEM" value={memoryLabel} />
          <HeaderMetric icon={HardDrive} label="DISK" value={diskLabel} />
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("process")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
            visibleActiveTab === "process"
              ? "text-foreground border-b-2 border-info"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Cpu className="h-3 w-3" />
          进程
          {visibleProcessCount > 0 && (
            <span className="text-[10px] bg-surface-elevated px-1 rounded">
              {visibleProcessCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("changes")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
            visibleActiveTab === "changes"
              ? "text-foreground border-b-2 border-info"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileCode className="h-3 w-3" />
          文件变更
          {fileChanges.length > 0 && (
            <span className="text-[10px] bg-surface-elevated px-1 rounded">
              {fileChanges.length}
            </span>
          )}
        </button>
        {showToolTab && (
          <button
            type="button"
            onClick={() => setActiveTab("tool")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
              visibleActiveTab === "tool"
                ? "text-foreground border-b-2 border-info"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Wrench className="h-3 w-3" />
            工具
          </button>
        )}
      </div>

      {visibleActiveTab === "tool" ? (
        activeToolCall ? (
          <ActiveToolView toolCall={activeToolCall} />
        ) : (
          <ToolIdleView />
        )
      ) : visibleActiveTab === "process" ? (
        <ProcessMonitorView
          processes={sandboxProcesses ?? null}
          isLoading={isProcessLoading}
          fallbackItems={fallbackItems}
          hasRealtimeSource={Boolean(conversationId)}
        />
      ) : (
        <FileChangesView changes={fileChanges} />
      )}
    </div>
  );
}
