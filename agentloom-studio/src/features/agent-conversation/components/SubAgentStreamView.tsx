import { memo, useState, useEffect, useRef, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Bot,
  Brain,
  Wrench,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import type {
  SubAgentStream,
  SubAgentRunStatus,
  SubAgentEvent,
  SubAgentHandle,
} from '../types';

const STATUS_CONFIG: Record<
  SubAgentRunStatus,
  {
    emoji: string;
    label: string;
    tone: StatusTone;
    textClass: string;
    icon: ReactNode;
  }
> = {
  pending: {
    emoji: '⏳',
    label: '等待中',
    tone: 'info',
    textClass: 'text-info',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  running: {
    emoji: '⏳',
    label: '运行中',
    tone: 'info',
    textClass: 'text-info',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  completed: {
    emoji: '✅',
    label: '完成',
    tone: 'success',
    textClass: 'text-success',
    icon: <CheckCircle2 className="size-3" />,
  },
  failed: {
    emoji: '❌',
    label: '失败',
    tone: 'error',
    textClass: 'text-error',
    icon: <XCircle className="size-3" />,
  },
  timeout: {
    emoji: '⏱️',
    label: '超时',
    tone: 'warning',
    textClass: 'text-warning',
    icon: <Clock className="size-3" />,
  },
  cancelled: {
    emoji: '🚫',
    label: '已取消',
    tone: 'neutral',
    textClass: 'text-muted-foreground',
    icon: <Ban className="size-3" />,
  },
};

function ElapsedTime({
  startedAt,
  completedAt,
}: {
  startedAt: number;
  completedAt?: number;
}) {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (completedAt) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [completedAt]);

  const elapsed = (completedAt ?? now) - startedAt;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const display =
    minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;

  return (
    <span className="text-2xs tabular-nums text-muted-foreground">
      {display}
    </span>
  );
}

function SubAgentCollapsible({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-1.5">
      <Button
        variant="ghost"
        size="xs"
        className="h-auto cursor-pointer justify-start gap-1.5 px-0 py-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown /> : <ChevronRight />}
        {icon}
        <span>{title}</span>
      </Button>
      {open && <div className="mt-1 pl-5">{children}</div>}
    </div>
  );
}

function SubAgentEventList({ events }: { events: SubAgentEvent[] }) {
  const thinkingChunks = events
    .filter((e) => e.type === 'thinking')
    .map((e) => {
      const p = e.payload as { content?: string };
      return p.content ?? '';
    });
  const thinkingText = thinkingChunks.join('');

  const messageChunks = events
    .filter((e) => e.type === 'message_chunk')
    .map((e) => {
      const p = e.payload as { chunk?: string };
      return p.chunk ?? '';
    });
  const messageText = messageChunks.join('');

  const toolCallEvents = events.filter((e) => e.type === 'tool_call');
  const toolResultEvents = events.filter((e) => e.type === 'tool_result');

  const toolCalls = toolCallEvents.map((tce) => {
    const tp = tce.payload as {
      toolCallId?: string;
      tool?: string;
      name?: string;
      args?: unknown;
      status?: string;
    };
    const resultEvent = toolResultEvents.find((tre) => {
      const rp = tre.payload as { toolCallId?: string };
      return rp.toolCallId === tp.toolCallId;
    });
    const rp = resultEvent?.payload as {
      result?: unknown;
      error?: string;
      status?: string;
    } | undefined;

    return {
      id: tp.toolCallId ?? tce.id,
      name: tp.tool ?? tp.name ?? 'unknown',
      args: tp.args,
      result: rp?.result,
      error: rp?.error,
      status: rp?.status ?? tp.status ?? 'running',
    };
  });

  const nestedSubAgentEvents = events.filter((e) => e.subagent);
  const nestedStreams = new Map<string, SubAgentStream>();
  for (const evt of nestedSubAgentEvents) {
    if (!evt.subagent) continue;
    const handle = evt.subagent.handle;
    if (!nestedStreams.has(handle)) {
      nestedStreams.set(handle, {
        handle: evt.subagent.handle,
        alias: evt.subagent.alias,
        depth: evt.subagent.depth,
        parentToolCallId: evt.subagent.parentToolCallId,
        status: 'running',
        events: [],
        startedAt: evt.timestamp,
      });
    }
    nestedStreams.get(handle)!.events.push(evt);
    if (evt.type === 'done') {
      const stream = nestedStreams.get(handle)!;
      stream.status = 'completed';
      stream.completedAt = evt.timestamp;
    }
  }

  return (
    <div className="space-y-1">
      {thinkingText && (
        <SubAgentCollapsible
          title="思考中"
          icon={<Brain className="size-3" />}
        >
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {thinkingText}
          </p>
        </SubAgentCollapsible>
      )}

      {toolCalls.length > 0 && (
        <SubAgentCollapsible
          title={`工具调用 (${toolCalls.filter((t) => t.status !== 'running' && t.status !== 'pending' && t.status !== 'awaiting_permission' && t.status !== 'in_progress').length}/${toolCalls.length})`}
          icon={<Wrench className="size-3" />}
          defaultOpen={toolCalls.some((t) => t.status === 'running' || t.status === 'pending' || t.status === 'in_progress')}
        >
          <div className="space-y-1">
            {toolCalls.map((tc) => (
              <div key={tc.id} className="flex items-start gap-2 py-1.5 text-xs">
                <SubAgentToolStatusIcon
                  status={
                    tc.status as
                      | 'running'
                      | 'pending'
                      | 'awaiting_permission'
                      | 'in_progress'
                      | 'completed'
                      | 'failed'
                      | 'denied'
                  }
                />
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-medium text-foreground">
                    {tc.name}
                  </span>
                  {tc.args !== undefined && (
                    <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-2xs leading-relaxed text-muted-foreground">
                      {formatValue(tc.args)}
                    </pre>
                  )}
                  {tc.result !== undefined && (
                    <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-2xs leading-relaxed text-muted-foreground max-h-40 overflow-y-auto">
                      {formatValue(tc.result)}
                    </pre>
                  )}
                  {tc.error && (
                    <pre className="mt-1 overflow-x-auto rounded bg-error/10 p-2 text-2xs leading-relaxed text-error max-h-40 overflow-y-auto">
                      {tc.error}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SubAgentCollapsible>
      )}

      {messageText && (
        <MarkdownRenderer content={messageText} className="text-xs" />
      )}

      {nestedStreams.size > 0 && (
        <div className="mt-2 space-y-2">
          {Array.from(nestedStreams.values()).map((nested) => (
            <SubAgentStreamView key={nested.handle} stream={nested} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubAgentToolStatusIcon({
  status,
}: {
  status:
    | 'running'
    | 'pending'
    | 'awaiting_permission'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'denied';
}) {
  switch (status) {
    case 'running':
    case 'pending':
    case 'awaiting_permission':
    case 'in_progress':
      return <Loader2 className="size-3.5 animate-spin text-info" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-success" />;
    case 'denied':
    case 'failed':
      return <XCircle className="size-3.5 text-error" />;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  if (value == null) {
    return 'null';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export interface SubAgentStreamViewProps {
  stream: SubAgentStream;
  nestedSubAgentStreams?: Map<string, SubAgentStream>;
}

export const SubAgentStreamView = memo(function SubAgentStreamView({
  stream,
  nestedSubAgentStreams,
}: SubAgentStreamViewProps) {
  const { depth, alias, handle, status, startedAt, completedAt, error, events } =
    stream;
  const defaultOpen = depth <= 1;
  const [open, setOpen] = useState(defaultOpen);
  const statusConfig = STATUS_CONFIG[status];
  const isTerminal =
    status === 'completed' ||
    status === 'failed' ||
    status === 'timeout' ||
    status === 'cancelled';

  const indentPx = Math.min((depth - 1) * 16, 64);

  const allEvents = [...events];
  if (nestedSubAgentStreams) {
    for (const nested of nestedSubAgentStreams.values()) {
      if (nested.parentToolCallId) {
        const hasParent = events.some(
          (e) =>
            e.type === 'tool_call' &&
            (e.payload as { toolCallId?: string }).toolCallId ===
              nested.parentToolCallId,
        );
        if (!hasParent) continue;
      }
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted',
        !isTerminal && 'border-l-2 border-l-primary/50',
      )}
      style={{ marginLeft: `${indentPx}px` }}
    >
      <Button
        variant="ghost"
        size="xs"
        className="h-auto w-full cursor-pointer justify-start gap-2 rounded-none px-3 py-2 text-left font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="shrink-0 text-muted-foreground" />
        )}

        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--color-node-agent) 15%, transparent)',
            color: 'var(--color-node-agent)',
          }}
        >
          <Bot className="size-3" />
        </span>

        <span className="truncate text-xs font-medium text-foreground">
          {statusConfig.emoji} {alias}
        </span>
        <span className="truncate font-mono text-2xs text-muted-foreground">
          {handle}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          <ElapsedTime startedAt={startedAt} completedAt={completedAt} />
          <StatusBadge tone={statusConfig.tone} size="sm">
            {statusConfig.icon}
            {statusConfig.label}
          </StatusBadge>
        </span>
      </Button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {error && (
            <div className="mb-2 rounded bg-error/10 px-2.5 py-1.5 text-xs text-error">
              {error}
            </div>
          )}

          <SubAgentEventList events={allEvents} />

          {nestedSubAgentStreams &&
            Array.from(nestedSubAgentStreams.values())
              .filter((ns) => ns.depth === depth + 1)
              .map((nested) => (
                <div key={nested.handle} className="mt-2">
                  <SubAgentStreamView stream={nested} />
                </div>
              ))}
        </div>
      )}
    </div>
  );
});

export interface SubAgentCompletionNoticeProps {
  alias: string;
  status: SubAgentRunStatus;
  handle: SubAgentHandle;
  error?: string;
}

export const SubAgentCompletionNotice = memo(
  function SubAgentCompletionNotice({
    alias,
    status,
    handle,
    error,
  }: SubAgentCompletionNoticeProps) {
    const config = STATUS_CONFIG[status];

    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
          <span className={config.textClass}>{config.icon}</span>
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{alias}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className={cn('text-2xs', config.textClass)}>
              {config.label}
            </span>
            {error && (
              <span className="ml-1.5 truncate text-2xs text-error">
                — {error}
              </span>
            )}
          </span>
          <span className="ml-auto font-mono text-2xs text-muted-foreground">
            {handle}
          </span>
        </div>
      </div>
    );
  },
);
