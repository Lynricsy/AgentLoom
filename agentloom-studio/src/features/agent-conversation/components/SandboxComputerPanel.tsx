import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Monitor,
  Terminal,
  Cpu,
  HardDrive,
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileX,
  FilePenLine,
  Wrench,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useConversationSandboxStats } from "../api/conversationQueries";
import {
  formatSandboxBytes,
  formatSandboxMegabytes,
  getSandboxDiskPercent,
  safeSandboxPercent,
} from "@/features/sandbox/lib/sandboxStats";
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
  /** 当前活跃的工具调用（正在执行的），传入后自动切到工具详情 tab */
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

interface ProcessItem {
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
  return value.replace(/\u001b\[[0-9;]*m/g, "");
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

function buildProcessItems(params: {
  terminalEntries: TerminalEntry[];
  sandboxStatus: SandboxStatus;
  activeToolCall?: ToolCallData;
}): ProcessItem[] {
  const { terminalEntries, sandboxStatus, activeToolCall } = params;
  const items: ProcessItem[] = [];

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

const ProcessCard = memo(function ProcessCard({ item }: { item: ProcessItem }) {
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

function ProcessMonitorView({ items }: { items: ProcessItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <Cpu className="mb-3 h-5 w-5 opacity-50" />
        <div className="text-sm">暂无可观测进程</div>
        <div className="mt-1 text-xs leading-relaxed">
          当 Agent 触发工具调用或产生终端活动时，这里会显示结构化运行卡片。
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-3 rounded-md border border-info/20 bg-info/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        这里只重组当前会话里的运行活动；更详细的工具结果仍在“工具”标签页查看。
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <ProcessCard key={item.id} item={item} />
        ))}
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
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
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

type PanelTab = "process" | "changes" | "tool";

export function SandboxComputerPanel({
  conversationId,
  agentName,
  terminalEntries,
  fileChanges,
  sandboxStatus,
  activeToolCall,
}: SandboxComputerPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("process");
  const prevToolRef = useRef<string | undefined>(undefined);
  const { data: sandboxStats } = useConversationSandboxStats(
    conversationId,
    sandboxStatus,
  );
  const processItems = useMemo(
    () =>
      buildProcessItems({
        terminalEntries,
        sandboxStatus,
        activeToolCall,
      }),
    [terminalEntries, sandboxStatus, activeToolCall],
  );
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

  // 当有新的活跃工具调用时自动切到 tool tab
  useEffect(() => {
    if (activeToolCall && activeToolCall.id !== prevToolRef.current) {
      prevToolRef.current = activeToolCall.id;
      setActiveTab("tool");
    } else if (!activeToolCall && activeTab === "tool") {
      setActiveTab("process");
    }
  }, [activeToolCall, activeTab]);

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
            activeTab === "process"
              ? "text-foreground border-b-2 border-info"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Cpu className="h-3 w-3" />
          进程
          {processItems.length > 0 && (
            <span className="text-[10px] bg-surface-elevated px-1 rounded">
              {processItems.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("changes")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
            activeTab === "changes"
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
        {activeToolCall && (
          <button
            type="button"
            onClick={() => setActiveTab("tool")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
              activeTab === "tool"
                ? "text-foreground border-b-2 border-info"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Wrench className="h-3 w-3" />
            工具
          </button>
        )}
      </div>

      {activeTab === "tool" && activeToolCall ? (
        <ActiveToolView toolCall={activeToolCall} />
      ) : activeTab === "process" ? (
        <ProcessMonitorView items={processItems} />
      ) : (
        <FileChangesView changes={fileChanges} />
      )}
    </div>
  );
}
