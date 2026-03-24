import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  User,
  Wrench,
  Brain,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type {
  ConversationMessage,
  SubAgentHandle,
  SubAgentRunStatus,
  ToolCall,
  ToolCallStatus,
} from '../types';
import { useSubAgentStreams } from '../stores/agent-conversation.store';
import {
  SubAgentStreamView,
  SubAgentCompletionNotice,
} from './SubAgentStreamView';

function ToolStatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-info" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-success" />;
    case 'failed':
      return <XCircle className="size-3.5 text-error" />;
  }
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  muted = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('mt-2', muted && 'opacity-70')}>
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
      {open && <div className="mt-1.5 pl-5">{children}</div>}
    </div>
  );
}

const SUB_AGENT_TOOL_NAMES = new Set(['call_subagent', 'spawn_subagent']);

function isSubAgentToolCall(toolCall: ToolCall): boolean {
  return SUB_AGENT_TOOL_NAMES.has(toolCall.name);
}

function extractSubAgentHandle(toolCall: ToolCall): string | null {
  if (!toolCall.args) return null;
  try {
    const parsed = JSON.parse(toolCall.args);
    return parsed.handle ?? parsed.subagentHandle ?? null;
  } catch {
    return null;
  }
}

const ToolCallItem = memo(function ToolCallItem({
  toolCall,
}: {
  toolCall: ToolCall;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-xs">
      <ToolStatusIcon status={toolCall.status} />
      <div className="min-w-0 flex-1">
        <span className="font-mono font-medium text-foreground">
          {toolCall.name}
        </span>
        {toolCall.args && (
          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px] leading-relaxed text-muted-foreground">
            {formatToolArgs(toolCall.args)}
          </pre>
        )}
        {toolCall.result && (
          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px] leading-relaxed text-muted-foreground max-h-40 overflow-y-auto">
            {toolCall.result}
          </pre>
        )}
      </div>
    </div>
  );
});

const SubAgentToolCallItem = memo(function SubAgentToolCallItem({
  toolCall,
  subAgentStreams,
}: {
  toolCall: ToolCall;
  subAgentStreams: Record<string, import('../types').SubAgentStream>;
}) {
  const handle = extractSubAgentHandle(toolCall);
  const stream = handle ? subAgentStreams[handle] : undefined;

  if (!stream) {
    return <ToolCallItem toolCall={toolCall} />;
  }

  return <SubAgentStreamView stream={stream} />;
});

function formatToolArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  subAgentStreams,
}: {
  message: ConversationMessage;
  subAgentStreams: Record<string, import('../types').SubAgentStream>;
}) {
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinking;

  const { regularTools, subAgentTools, runningCount, completedCount } =
    useMemo(() => {
      const regular: ToolCall[] = [];
      const subAgent: ToolCall[] = [];
      let running = 0;
      let completed = 0;

      for (const tc of message.toolCalls) {
        if (isSubAgentToolCall(tc)) {
          subAgent.push(tc);
        } else {
          regular.push(tc);
        }
        if (tc.status === 'running') running++;
        else completed++;
      }

      return {
        regularTools: regular,
        subAgentTools: subAgent,
        runningCount: running,
        completedCount: completed,
      };
    }, [message.toolCalls]);

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-foreground/10 text-foreground'
            : 'bg-info/15 text-info',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-md bg-foreground/10 text-foreground'
              : 'rounded-bl-md bg-surface text-foreground',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-background [&_pre]:rounded [&_pre]:p-3 [&_code]:text-info [&_a]:text-info">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : message.isStreaming ? (
            <TypingIndicator />
          ) : null}
        </div>

        {!isUser && hasThinking && (
          <CollapsibleSection title="Thinking" icon={<Brain className="size-3" />} muted>
            <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {message.thinking}
            </p>
          </CollapsibleSection>
        )}

        {!isUser && regularTools.length > 0 && (
          <CollapsibleSection
            title={`Tool calls (${completedCount}/${message.toolCalls.length})`}
            icon={<Wrench className="size-3" />}
            defaultOpen={runningCount > 0}
          >
            <div className="space-y-1">
              {regularTools.map((tc) => (
                <ToolCallItem key={tc.id} toolCall={tc} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {!isUser && subAgentTools.length > 0 && (
          <div className="mt-2 w-full space-y-2">
            {subAgentTools.map((tc) => (
              <SubAgentToolCallItem
                key={tc.id}
                toolCall={tc}
                subAgentStreams={subAgentStreams}
              />
            ))}
          </div>
        )}

        <span className="px-1 text-[10px] text-muted-foreground/60">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isCompletionNotice(message: ConversationMessage): boolean {
  return message.metadata?.type === 'subagent_completion_notice';
}

export interface MessageListProps {
  messages: ConversationMessage[];
  isExecuting: boolean;
}

export function MessageList({ messages, isExecuting }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevMessageCount = useRef(messages.length);
  const subAgentStreams = useSubAgentStreams();

  if (messages.length !== prevMessageCount.current) {
    prevMessageCount.current = messages.length;
    if (autoScroll) {
      queueMicrotask(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Bot className="mx-auto size-12 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              Start a conversation with the agent
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1 py-4">
          {messages.map((msg) =>
            isCompletionNotice(msg) ? (
              <SubAgentCompletionNotice
                key={msg.id}
                handle={
                  ((msg.metadata?.subagentHandle as string) ?? 'sa_unknown') as SubAgentHandle
                }
                alias={(msg.metadata?.subagentAlias as string) ?? 'Sub-Agent'}
                status={
                  (msg.metadata?.subagentStatus as SubAgentRunStatus) ??
                  'completed'
                }
                error={msg.metadata?.subagentError as string | undefined}
              />
            ) : (
              <MessageBubble
                key={msg.id}
                message={msg}
                subAgentStreams={subAgentStreams}
              />
            ),
          )}
          {isExecuting &&
            !messages.some(
              (m) => m.role === 'agent' && m.isStreaming,
            ) && (
              <div className="flex gap-3 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-surface px-4 py-2.5">
                  <TypingIndicator />
                </div>
              </div>
            )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
