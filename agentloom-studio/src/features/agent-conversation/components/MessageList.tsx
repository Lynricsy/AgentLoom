import {
  memo,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  User,
  Brain,
} from 'lucide-react';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { ToolCallCard } from '@/shared/components/tool-renderers';
import type { ToolCallData } from '@/shared/components/tool-renderers';
import type {
  ConversationMessage,
  MessageSegment,
  SubAgentHandle,
  SubAgentRunStatus,
  ToolCall,
} from '../types';
import {
  useConversationActions,
  useSubAgentStreams,
  usePreparationPhase,
  usePreparationStartTime,
  useSandboxReused,
  usePreparationError,
  usePreparationFailedPhase,
} from '../stores/agent-conversation.store';
import { SubAgentCompletionNotice } from './SubAgentStreamView';
import { PreparationCard } from './PreparationCard';

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

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-surface-elevated/30 px-3 py-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Brain className="size-3 text-primary/60" />
        <span className="font-medium">思考过程</span>
        {!open && content.length > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {content.slice(0, 60)}...
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 pl-5 border-l-2 border-primary/20">
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

/** 用户消息气泡（保持原有气泡风格） */
const UserBubble = memo(function UserBubble({
  message,
}: {
  message: ConversationMessage;
}) {
  return (
    <div className="flex gap-3 px-4 py-3 flex-row-reverse">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
        <User className="size-4" />
      </div>
      <div className="flex max-w-[80%] flex-col gap-1 items-end">
        <div className="rounded-2xl rounded-br-md bg-foreground/10 text-foreground px-4 py-2.5 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground/60">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
});

/** 助手消息 - 按 segments 瀑布流渲染 */
const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: ConversationMessage;
}) {
  const { resolveToolPermission } = useConversationActions();

  const handleResolvePermission = useCallback(
    async (toolCallId: string, action: 'approve' | 'deny') => {
      await resolveToolPermission(toolCallId, action);
    },
    [resolveToolPermission],
  );

  const segments = message.segments;
  const showEmptyTurnPlaceholder =
    !message.content &&
    !message.isStreaming &&
    message.metadata?.emptyTurn === true;

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info mt-0.5">
        <Bot className="size-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {segments.length > 0 ? (
          segments.map((seg, i) => (
            <SegmentRenderer
              key={segmentKey(seg, i)}
              segment={seg}
              message={message}
              onResolvePermission={handleResolvePermission}
            />
          ))
        ) : message.isStreaming ? (
          <TypingIndicator />
        ) : showEmptyTurnPlaceholder ? (
          <p className="italic text-muted-foreground text-sm">本轮未返回可展示内容</p>
        ) : null}

        {/* 流式输出时最后一个 segment 后的光标 */}
        {message.isStreaming && segments.length > 0 && (
          <TypingIndicator />
        )}

        <span className="block px-1 text-[10px] text-muted-foreground/60">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
});

/** 单个 segment 渲染 */
const SegmentRenderer = memo(function SegmentRenderer({
  segment,
  message,
  onResolvePermission,
}: {
  segment: MessageSegment;
  message: ConversationMessage;
  onResolvePermission: (toolCallId: string, action: 'approve' | 'deny') => Promise<void>;
}) {
  switch (segment.type) {
    case 'text':
      return <MarkdownRenderer content={segment.content} />;
    case 'thinking':
      return <ThinkingBlock content={segment.content} />;
    case 'tool_call': {
      const tc = message.toolCalls.find((t) => t.id === segment.toolCallId);
      if (!tc) return null;
      const isActive =
        tc.status === 'pending' ||
        tc.status === 'in_progress' ||
        tc.status === 'awaiting_permission';
      return (
        <ToolCallCard
          toolCall={toToolCallData(tc)}
          defaultExpanded={isActive}
          onResolvePermission={onResolvePermission}
        />
      );
    }
  }
});

function segmentKey(seg: MessageSegment, index: number): string {
  if (seg.type === 'tool_call') return `tc-${seg.toolCallId}`;
  return `${seg.type}-${index}`;
}

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

  const preparationPhase = usePreparationPhase();
  const preparationStartTime = usePreparationStartTime();
  const sandboxReused = useSandboxReused();
  const preparationError = usePreparationError();
  const preparationFailedPhase = usePreparationFailedPhase();

  // Show the preparation card when actively preparing or just collapsed (phase went null but startTime exists)
  const showPreparationCard =
    preparationPhase !== null || preparationStartTime !== null;

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
      className="h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      {messages.length === 0 && !showPreparationCard ? (
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
            ) : msg.role === 'user' ? (
              <UserBubble key={msg.id} message={msg} />
            ) : (
              <AssistantMessage key={msg.id} message={msg} />
            ),
          )}

          {/* Preparation card in the agent message position */}
          {showPreparationCard && (
            <div className="flex gap-3 px-4 py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info mt-0.5">
                <Bot className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <PreparationCard
                  phase={preparationPhase}
                  startTime={preparationStartTime}
                  sandboxReused={sandboxReused}
                  error={preparationError}
                  failedPhase={preparationFailedPhase}
                />
              </div>
            </div>
          )}

          {/* Generic executing indicator (only when no preparation card and no streaming message) */}
          {isExecuting &&
            !showPreparationCard &&
            !messages.some(
              (m) => m.role === 'assistant' && m.isStreaming,
            ) && (
              <div className="flex gap-3 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
                  <Bot className="size-4" />
                </div>
                <div className="py-2.5">
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
