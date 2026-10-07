import { memo, useEffect, useMemo, useRef } from "react";
import { Activity, Cpu } from "lucide-react";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { HarnessTraceEntry } from "../types";

interface HarnessTracePanelProps {
  entries: HarnessTraceEntry[];
}

interface TraceTurnGroup {
  key: string;
  turn?: number;
  entries: HarnessTraceEntry[];
}

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * 按 turn 切分时间线：遇到 `turn/start` 或新的 turn 编号就开新组；不带 turn 的事件
 * （如 user/message、system/message）归入当前组，避免打散一轮的上下文。
 * dsh 会话被重建时 turn 编号会从 1 重新开始，因此不能只比较编号。
 */
function groupByTurn(entries: HarnessTraceEntry[]): TraceTurnGroup[] {
  const groups: TraceTurnGroup[] = [];

  for (const entry of entries) {
    const current = groups[groups.length - 1];
    if (
      current &&
      entry.kind !== "turn/start" &&
      (entry.turn === undefined ||
        current.turn === undefined ||
        current.turn === entry.turn)
    ) {
      current.turn ??= entry.turn;
      current.entries.push(entry);
      continue;
    }

    groups.push({ key: entry.id, turn: entry.turn, entries: [entry] });
  }

  return groups;
}

function readNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/** 按 kind 提炼一行摘要；未知 kind 不展示 data，避免把任意载荷铺满面板 */
function summarizeTraceData(entry: HarnessTraceEntry): string | null {
  const data = entry.data ?? {};

  switch (entry.kind) {
    case "tool/call":
      return typeof data.name === "string" ? data.name : null;
    case "tool/result":
      return data.isError === true ? "失败" : "成功";
    case "turn/end":
      return typeof data.reason === "string" ? data.reason : null;
    case "assistant/message": {
      const usage =
        typeof data.usage === "object" && data.usage !== null
          ? (data.usage as Record<string, unknown>)
          : null;
      if (!usage) {
        return null;
      }
      const input = readNumber(usage, ["input", "inputTokens", "input_tokens"]);
      const output = readNumber(usage, [
        "output",
        "outputTokens",
        "output_tokens",
      ]);
      if (input === undefined && output === undefined) {
        return null;
      }
      return `输入 ${input ?? "-"} / 输出 ${output ?? "-"} tokens`;
    }
    default:
      return null;
  }
}

function formatTraceTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : TIME_FORMATTER.format(date);
}

const TraceRow = memo(function TraceRow({ entry }: { entry: HarnessTraceEntry }) {
  const summary = summarizeTraceData(entry);
  const isFailure =
    (entry.kind === "tool/result" && entry.data?.isError === true) ||
    (entry.kind === "turn/end" &&
      typeof entry.data?.reason === "string" &&
      entry.data.reason !== "completed");

  return (
    <li
      className="flex items-baseline gap-2 px-3 py-1 text-xs"
      data-testid="harness-trace-row"
    >
      <span className="w-14 shrink-0 font-mono text-2xs text-muted-foreground">
        {formatTraceTime(entry.timestamp)}
      </span>
      <code className="shrink-0 font-mono text-foreground">{entry.kind}</code>
      {entry.step !== undefined ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          step {entry.step}
        </span>
      ) : null}
      {summary ? (
        <span
          className={cn(
            "min-w-0 truncate",
            isFailure ? "text-error" : "text-muted-foreground",
          )}
          title={summary}
        >
          {summary}
        </span>
      ) : null}
    </li>
  );
});

/** 对话页右栏「Harness」tab：dsh 会话事件按 turn 分组的实时时间线 */
export function HarnessTracePanel({ entries }: HarnessTracePanelProps) {
  const groups = useMemo(() => groupByTurn(entries), [entries]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries.length]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface"
      data-testid="harness-trace-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">
            Harness 轨迹
          </span>
          <Badge variant="secondary" size="sm">
            dsh
          </Badge>
        </div>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {entries.length} 条事件
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <EmptyState
            icon={Activity}
            title="等待 dsh 事件…"
            description="Agent 开始执行后，这里按轮次显示 dsh 运行时的会话事件。"
            className="w-full border-none py-8"
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {groups.map((group) => (
            <section key={group.key} className="pb-1">
              <h4 className="sticky top-0 bg-surface px-3 py-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.turn !== undefined ? `Turn ${group.turn}` : "会话"}
              </h4>
              <ol>
                {group.entries.map((entry) => (
                  <TraceRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
