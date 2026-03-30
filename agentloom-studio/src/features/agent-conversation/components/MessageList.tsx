import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  User,
  Brain,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { ToolCallCard } from '@/shared/components/tool-renderers';
import type { ToolCallData } from '@/shared/components/tool-renderers';
import type {
  ConversationMessage,
  SubAgentHandle,
  SubAgentRunStatus,
  ToolCall,
} from '../types';
import {
  useConversationActions,
  useSubAgentStreams,
} from '../stores/agent-conversation.store';
import { SubAgentCompletionNotice } from './SubAgentStreamView';

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

/** 将 conversation ToolCall 转为 ToolCallCard 所需的 ToolCallData */
function toToolCallData(tc: ToolCall): ToolCallData {
  return {
    id: tc.id,
    tool: tc.tool,
    args: tc.args,
    result: tc.result,
    error: tc.error,
    status: tc.status,
    permissionDescription: tc.permissionRequest?.description,
    permissionResourcePaths: tc.permissionRequest?.resourcePaths,
  };
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
}: {
  message: ConversationMessage;
}) {
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinking;
  const showEmptyTurnPlaceholder =
    !isUser &&
    !message.content &&
    !message.isStreaming &&
    message.metadata?.emptyTurn === true;

  const { resolveToolPermission } = useConversationActions();

  const handleResolvePermission = useCallback(
    async (toolCallId: string, action: 'approve' | 'deny') => {
      await resolveToolPermission(toolCallId, action);
    },
    [resolveToolPermission],
  );

  const { runningCount } = useMemo(() => {
    let running = 0;
    for (const tc of message.toolCalls) {
      if (
        tc.status === 'pending' ||
        tc.status === 'awaiting_permission' ||
        tc.status === 'in_progress'
      ) {
        running++;
      }
    }
    return { runningCount: running };
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
            <MarkdownRenderer content={message.content} />
          ) : message.isStreaming ? (
            <TypingIndicator />
          ) : showEmptyTurnPlaceholder ? (
            <p className="italic text-muted-foreground">本轮未返回可展示内容</p>
          ) : null}
        </div>

        {!isUser && hasThinking && (
          <CollapsibleSection title="Thinking" icon={<Brain className="size-3" />} muted>
            <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {message.thinking}
            </p>
          </CollapsibleSection>
        )}

        {!isUser && message.toolCalls.length > 0 && (
          <div className="mt-2 w-full space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={toToolCallData(tc)}
                defaultExpanded={
                  runningCount > 0 &&
                  (tc.status === 'pending' ||
                    tc.status === 'awaiting_permission' ||
                    tc.status === 'in_progress')
                }
                onResolvePermission={handleResolvePermission}
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
  useSubAgentStreams(); // 保持订阅

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
              与 Agent 开始对话吧
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
                  ((msg.metadata?.handle ?? msg.metadata?.subagentHandle ?? 'sa_unknown') as string) as SubAgentHandle
                }
                alias={((msg.metadata?.alias ?? msg.metadata?.subagentAlias ?? 'Sub-Agent') as string)}
                status={
                  ((msg.metadata?.status ?? msg.metadata?.subagentStatus ?? 'completed') as SubAgentRunStatus)
                }
                error={(msg.metadata?.error ?? msg.metadata?.subagentError) as string | undefined}
              />
            ) : (
              <MessageBubble
                key={msg.id}
                message={msg}
              />
            ),
          )}
          {isExecuting &&
            !messages.some(
              (m) => m.role === 'assistant' && m.isStreaming,
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
