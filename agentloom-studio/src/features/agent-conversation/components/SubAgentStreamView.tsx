import { memo, useState, useEffect, useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
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
import type {
  SubAgentStream,
  SubAgentRunStatus,
  SubAgentEvent,
  SubAgentHandle,
} from '../types';

const STATUS_CONFIG: Record<
  SubAgentRunStatus,
  { emoji: string; label: string; colorClass: string; icon: ReactNode }
> = {
  pending: {
    emoji: '⏳',
    label: '等待中',
    colorClass: 'text-cyan-400 bg-cyan-400/15',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  running: {
    emoji: '⏳',
    label: '运行中',
    colorClass: 'text-cyan-400 bg-cyan-400/15',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  completed: {
    emoji: '✅',
    label: '完成',
    colorClass: 'text-success bg-success/15',
    icon: <CheckCircle2 className="size-3" />,
  },
  failed: {
    emoji: '❌',
    label: '失败',
    colorClass: 'text-error bg-error/15',
    icon: <XCircle className="size-3" />,
  },
  timeout: {
    emoji: '⏱️',
    label: '超时',
    colorClass: 'text-amber-400 bg-amber-400/15',
    icon: <Clock className="size-3" />,
  },
  cancelled: {
    emoji: '🚫',
    label: '已取消',
    colorClass: 'text-neutral-400 bg-neutral-400/15',
    icon: <Ban className="size-3" />,
  },
};

function StatusBadge({ status }: { status: SubAgentRunStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        config.colorClass,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

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
    <span className="text-[10px] tabular-nums text-muted-foreground/60">
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
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {icon}
        <span>{title}</span>
      </button>
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
                    <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px] leading-relaxed text-muted-foreground">
                      {formatValue(tc.args)}
                    </pre>
                  )}
                  {tc.result !== undefined && (
                    <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px] leading-relaxed text-muted-foreground max-h-40 overflow-y-auto">
                      {formatValue(tc.result)}
                    </pre>
                  )}
                  {tc.error && (
                    <pre className="mt-1 overflow-x-auto rounded bg-error/10 p-2 text-[11px] leading-relaxed text-error max-h-40 overflow-y-auto">
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
        <div className="prose prose-invert prose-sm max-w-none text-xs [&_pre]:bg-background [&_pre]:rounded [&_pre]:p-3 [&_code]:text-info [&_a]:text-info">
          <ReactMarkdown>{messageText}</ReactMarkdown>
        </div>
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
        'rounded-lg border border-neutral-700/50 bg-neutral-900/50',
        !isTerminal && 'border-l-2 border-l-cyan-500/40',
      )}
      style={{ marginLeft: `${indentPx}px` }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-800/50 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}

        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-400">
          <Bot className="size-3" />
        </div>

        <span className="text-xs font-medium text-foreground truncate">
          {statusConfig.emoji} {alias}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50 truncate">
          {handle}
        </span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ElapsedTime startedAt={startedAt} completedAt={completedAt} />
          <StatusBadge status={status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-700/30 px-3 py-2">
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
      <div className="flex items-center gap-2 px-4 py-1.5">
        <div className="flex flex-1 items-center gap-2 rounded-md bg-neutral-800/40 px-3 py-1.5">
          {config.icon}
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{alias}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span className={cn('text-[10px]', config.colorClass.split(' ')[0])}>
              {config.label}
            </span>
            {error && (
              <span className="ml-1.5 text-[10px] text-error/70 truncate">
                — {error}
              </span>
            )}
          </span>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
            {handle}
          </span>
        </div>
      </div>
    );
  },
);
