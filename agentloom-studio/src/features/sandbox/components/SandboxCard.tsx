import { memo } from "react";
import { Container, MoreVertical, Square, Play, Trash2 } from "lucide-react";
import { normalizeSandboxConversationIdleAutoEndMinutes } from "@/shared/lib/sandboxConversationIdleAutoEnd";
import { formatRelativeTime } from "@/features/canvas";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useSandboxStats } from "../api/sandboxQueries";
import { formatSandboxBytes, getSandboxDiskPercent } from "../lib/sandboxStats";
import { SandboxStatsDisplay } from "./SandboxStatsDisplay";
import type { SandboxSession, SandboxStatus } from "../types";

interface SandboxCardProps {
  session: SandboxSession;
  onStop: (session: SandboxSession) => void;
  onStart: (session: SandboxSession) => void;
  onDelete: (session: SandboxSession) => void;
}

const STATUS_META: Record<
  SandboxStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  creating: { label: "创建中", variant: "warning" },
  ready: { label: "就绪", variant: "success" },
  busy: { label: "运行中", variant: "info" },
  stopping: { label: "停止中", variant: "secondary" },
  stopped: { label: "已停止", variant: "secondary" },
  failed: { label: "失败", variant: "error" },
};

const RUNNING_STATUSES: Partial<Record<SandboxStatus, true>> = {
  creating: true,
  ready: true,
  busy: true,
};

const BINDING_META: Record<
  NonNullable<SandboxSession["bindingType"]>,
  { label: string; tone: string }
> = {
  resource: { label: "资源", tone: "var(--color-type-sandbox)" },
  conversation: { label: "对话", tone: "var(--color-type-text)" },
  execution: { label: "执行", tone: "var(--color-type-exec)" },
};

function formatTimeoutLabel(config: SandboxSession["config"]): string {
  if (typeof config.timeoutSeconds === "number" && config.timeoutSeconds > 0) {
    return `${config.timeoutSeconds}s`;
  }

  if (
    (typeof config.timeoutSeconds === "number" && config.timeoutSeconds <= 0) ||
    config.timeout <= 0
  ) {
    return "不超时";
  }

  return `${config.timeout}h`;
}

function CardActions({
  session,
  onStop,
  onStart,
  onDelete,
}: {
  session: SandboxSession;
  onStop: (session: SandboxSession) => void;
  onStart: (session: SandboxSession) => void;
  onDelete: (session: SandboxSession) => void;
}) {
  const isPersistent = session.config.lifecycleMode === "persistent";
  const isRunning = RUNNING_STATUSES[session.status] === true;
  const isStopped = session.status === "stopped";

  const hasActions = isRunning || (isStopped && isPersistent) || isPersistent;
  if (!hasActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="更多操作">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {isRunning && (
          <DropdownMenuItem onSelect={() => onStop(session)}>
            <Square className="h-3.5 w-3.5" />
            停止
          </DropdownMenuItem>
        )}
        {isStopped && isPersistent && (
          <DropdownMenuItem onSelect={() => onStart(session)}>
            <Play className="h-3.5 w-3.5" />
            启动
          </DropdownMenuItem>
        )}
        {isPersistent && (
          <DropdownMenuItem destructive onSelect={() => onDelete(session)}>
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const SandboxCard = memo(function SandboxCard({
  session,
  onStop,
  onStart,
  onDelete,
}: SandboxCardProps) {
  const isPersistent = session.config.lifecycleMode === "persistent";
  const isRunning = RUNNING_STATUSES[session.status] === true;
  const displayName = session.config.name || session.id.slice(0, 8);
  const bindingType = session.bindingType ?? "resource";
  const statusMeta = STATUS_META[session.status];
  const binding = BINDING_META[bindingType];

  const { data: stats } = useSandboxStats(session.id, session.status);
  const diskPercent = stats ? getSandboxDiskPercent(stats) : null;

  return (
    <Card className="p-5">
      <article>
        {/* 头部：图标芯片 + 名称 + 状态 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--color-type-sandbox) 14%, transparent)",
                color: "var(--color-type-sandbox)",
              }}
            >
              <Container className="h-4 w-4" />
            </span>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </h2>
            <Badge size="sm" variant={statusMeta.variant}>
              {statusMeta.label}
            </Badge>
          </div>
          <CardActions
            session={session}
            onStop={onStop}
            onStart={onStart}
            onDelete={onDelete}
          />
        </div>

        {/* 配置摘要 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
          <Badge size="sm" variant={isPersistent ? "info" : "warning"}>
            {isPersistent ? "持久" : "临时"}
          </Badge>
          <Badge size="sm" tone={binding.tone}>
            {binding.label}
          </Badge>
          <span className="tabular-nums">{session.config.cpu} C</span>
          <span aria-hidden>&middot;</span>
          <span className="tabular-nums">{session.config.memory} MB</span>
          <span aria-hidden>&middot;</span>
          <span className="tabular-nums">{session.config.disk} GB</span>
          <span aria-hidden>&middot;</span>
          <span>{formatTimeoutLabel(session.config)}</span>
          <span aria-hidden>&middot;</span>
          <span>
            空闲{" "}
            {normalizeSandboxConversationIdleAutoEndMinutes(
              session.config.conversationIdleAutoEndMinutes,
            )}
            m 自动结束
          </span>
        </div>

        {/* 资源水位：运行中给实时三项，停止后只保留磁盘 */}
        {isRunning && stats && (
          <div className="mt-4">
            <SandboxStatsDisplay stats={stats} />
          </div>
        )}

        {!isRunning &&
          stats?.diskUsage != null &&
          stats.diskTotal != null &&
          diskPercent !== null && (
            <div className="mt-4 text-xs text-muted">
              <div className="mb-1 flex items-center justify-between">
                <span>磁盘</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatSandboxBytes(stats.diskUsage)} /{" "}
                  {formatSandboxBytes(stats.diskTotal)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${Math.min(100, diskPercent)}%` }}
                />
              </div>
            </div>
          )}

        <p className="mt-4 text-xs text-muted">
          创建于 {formatRelativeTime(new Date(session.createdAt))}
        </p>
      </article>
    </Card>
  );
});
