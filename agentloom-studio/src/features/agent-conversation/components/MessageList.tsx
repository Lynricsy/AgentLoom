import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Bot,
  ChevronDown,
  Brain,
  AlertTriangle,
  FileText,
  ImageIcon,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { ToolCallCard } from "@/shared/components/tool-renderers";
import type { ToolCallData } from "@/shared/components/tool-renderers";
import type { AgentRuntimeMode } from "@/features/agent";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Alert } from "@/shared/ui/alert";
import { Collapse } from "@/shared/components/collapse/Collapse";
import { DUR, EASE, fadeInUp } from "@/shared/lib/motion";
import { formatBytes, formatTime } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type {
  ConversationAttachment,
  ConversationMessage,
  MessageSegment,
  SubAgentHandle,
  SubAgentRunStatus,
  ToolCall,
} from "../types";
import {
  getConversationAttachments,
  isConversationAttachmentAutoSummary,
} from "../attachmentUtils";
import {
  useConversationActions,
  useSubAgentStreams,
  usePreparationPhase,
  usePreparationStartTime,
  useSandboxReused,
  usePreparationError,
  usePreparationFailedPhase,
} from "../stores/agent-conversation.store";
import { SubAgentCompletionNotice } from "./SubAgentStreamView";
import { PreparationCard } from "./PreparationCard";

function isAttachmentAutoSummary(message: ConversationMessage): boolean {
  return isConversationAttachmentAutoSummary(
    message.content,
    getConversationAttachments(message.metadata),
  );
}

function truncateAttachmentText(content: string): string {
  if (content.length <= 240) {
    return content;
  }

  return `${content.slice(0, 240)}\n…`;
}

/** 助手头像 —— 消息、准备卡片、执行指示器共用，保证左栏基线一致 */
function AssistantAvatar() {
  return (
    <Avatar className="mt-0.5">
      <AvatarFallback className="bg-primary/12 text-primary">
        <Bot className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

const AttachmentCard = memo(function AttachmentCard({
  attachment,
}: {
  attachment: ConversationAttachment;
}) {
  if (attachment.kind === "image") {
    const imageSrc = attachment.dataBase64
      ? `data:${attachment.mimeType};base64,${attachment.dataBase64}`
      : null;

    return (
      <Card className="overflow-hidden">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={attachment.fileName}
            className="max-h-72 w-full bg-muted object-contain"
          />
        ) : (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span>图片已随消息发送给 Agent。</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-2xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">
            {attachment.fileName}
          </span>
          <span className="shrink-0 tabular-nums">
            {formatBytes(attachment.sizeBytes)}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="px-3 py-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {attachment.fileName}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
          </p>
          {attachment.sandboxPath ? (
            <p className="mt-1 break-all text-2xs text-muted-foreground">
              工作区路径：{attachment.sandboxPath}
            </p>
          ) : null}
        </div>
      </div>

      {attachment.textContent ? (
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted px-3 py-2 text-2xs leading-relaxed text-foreground whitespace-pre-wrap">
          {truncateAttachmentText(attachment.textContent)}
        </pre>
      ) : (
        <p className="mt-3 text-2xs text-muted-foreground">
          文件内容已随消息发送给 Agent。
        </p>
      )}
    </Card>
  );
});

const AttachmentPreview = memo(function AttachmentPreview({
  message,
}: {
  message: ConversationMessage;
}) {
  const attachments = getConversationAttachments(message.metadata);
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {attachments.map((attachment, index) => (
        <AttachmentCard
          key={`${attachment.fileName}-${attachment.sizeBytes}-${index}`}
          attachment={attachment}
        />
      ))}
    </div>
  );
});

/** 将 conversation ToolCall 转为 ToolCallCard 所需的 ToolCallData */
function toToolCallData(tc: ToolCall): ToolCallData {
  const isSettled =
    tc.status === "completed" || tc.status === "failed" || tc.status === "denied";

  return {
    id: tc.id,
    tool: tc.tool,
    args: tc.args,
    result: tc.result,
    error: tc.error,
    status: tc.status,
    startedAt: tc.startedAt,
    ...(isSettled ? { completedAt: tc.updatedAt } : {}),
    permissionDescription: tc.permissionRequest?.description,
    permissionResourcePaths: tc.permissionRequest?.resourcePaths,
    permissionDomain: tc.permissionRequest?.domain,
    permissionCategory: tc.permissionRequest?.category,
    permissionRiskLevel: tc.permissionRequest?.riskLevel,
    permissionSourceLabel: tc.permissionRequest?.sourceLabel,
    permissionTargetType: tc.permissionRequest?.targetType,
    permissionTargetLabel: tc.permissionRequest?.targetLabel,
    permissionApproveEffect: tc.permissionRequest?.approveEffect,
    permissionDenyEffect: tc.permissionRequest?.denyEffect,
    permissionDiffPreview: tc.permissionRequest?.diffPreview,
    permissionRememberable: tc.permissionRequest?.rememberable,
  };
}

function extractRestartSuggestion(toolCall: ToolCall): {
  publishedVersionId: string;
  publishedVersionNumber?: number;
} | null {
  const root = readRecordLike(toolCall.result);
  if (!root) {
    return null;
  }

  const data = readRecordLike(root.data);
  const restartSuggestion = readRecordLike(data?.restartSuggestion);

  if (
    !restartSuggestion ||
    restartSuggestion.available !== true ||
    typeof restartSuggestion.publishedVersionId !== "string"
  ) {
    return null;
  }

  return {
    publishedVersionId: restartSuggestion.publishedVersionId,
    ...(typeof restartSuggestion.publishedVersionNumber === "number"
      ? { publishedVersionNumber: restartSuggestion.publishedVersionNumber }
      : {}),
  };
}

function readRecordLike(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return readRecordLike(parsed);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const content = record.content;
  if (Array.isArray(content) && content.length > 0) {
    const text = content
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }

        return item.type === "text" && typeof item.text === "string"
          ? item.text
          : null;
      })
      .filter((item): item is string => item !== null)
      .join("");

    if (text.length > 0) {
      const parsed = readRecordLike(text);
      if (parsed) {
        return parsed;
      }
    }
  }

  return record;
}

/** 自进化升级提示卡片 —— 交互语义与回调保持不变，仅视觉套用 Card */
function RestartToLatestVersionCard({
  publishedVersionNumber,
  onRestart,
}: {
  publishedVersionNumber?: number;
  onRestart: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleRestart = useCallback(async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onRestart();
    } finally {
      setSubmitting(false);
    }
  }, [onRestart, submitting]);

  return (
    <Card className="border-primary/30 bg-primary/[0.06] p-4 shadow-none">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            Agent 已升级到最新已发布版本
            {typeof publishedVersionNumber === "number"
              ? ` v${publishedVersionNumber}`
              : ""}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            当前对话后续继续时会自动使用最新已发布配置。点击下方按钮可立即刷新当前运行态，不会新建会话。
          </p>
          <div className="mt-3">
            <Button
              size="sm"
              onClick={() => void handleRestart()}
              disabled={submitting}
            >
              {submitting ? "刷新中…" : "刷新当前对话"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

const THINKING_PREVIEW_LENGTH = 60;

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const preview =
    content.length > THINKING_PREVIEW_LENGTH
      ? `${content.slice(0, THINKING_PREVIEW_LENGTH)}…`
      : content;
  return (
    <div className="rounded-lg border border-border bg-muted px-2 py-1">
      <Button
        variant="ghost"
        size="xs"
        aria-expanded={open}
        className="w-full justify-start px-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            !open && "-rotate-90",
          )}
        />
        <Brain className="text-primary" />
        <span className="shrink-0 font-medium">思考过程</span>
        {!open && preview.length > 0 && (
          <span className="ml-auto min-w-0 truncate text-2xs text-muted-foreground">
            {preview}
          </span>
        )}
      </Button>
      <Collapse open={open}>
        <div className="my-1 ml-1 border-l-2 border-primary/25 pl-5">
          <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
            {content}
          </p>
        </div>
      </Collapse>
    </div>
  );
}

/** 流式输出光标 —— 呼吸节奏取自全局动画规范 */
function StreamingCaret() {
  return (
    <motion.span
      aria-hidden
      data-testid="streaming-caret"
      className="inline-block h-4 w-[2px] rounded-full bg-primary align-text-bottom"
      animate={{ opacity: 0.15 }}
      transition={{
        duration: DUR.slow,
        ease: EASE,
        repeat: Infinity,
        repeatType: "reverse",
      }}
    />
  );
}

/** 等待首个 token 时的三点指示器 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1.5" aria-label="Agent 正在输入">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: 0.2 }}
          transition={{
            duration: DUR.slow,
            ease: EASE,
            repeat: Infinity,
            repeatType: "reverse",
            delay: index * DUR.fast,
          }}
        />
      ))}
    </div>
  );
}

/** 用户消息 —— 右对齐气泡 */
const UserBubble = memo(function UserBubble({
  message,
}: {
  message: ConversationMessage;
}) {
  const shouldShowText =
    message.content.trim().length > 0 && !isAttachmentAutoSummary(message);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[88%] min-w-0 rounded-xl bg-primary/10 px-4 py-2.5 text-sm leading-relaxed text-foreground sm:max-w-[75%]">
        {shouldShowText ? (
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        ) : null}
        <AttachmentPreview message={message} />
      </div>
      <span className="text-2xs tabular-nums text-muted-foreground">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
});

/** 助手消息 —— 无框全宽，按 segments 瀑布流渲染 */
const AssistantMessage = memo(function AssistantMessage({
  message,
  loadedPublishedVersionId,
  onRestartConversation,
}: {
  message: ConversationMessage;
  loadedPublishedVersionId?: string | null;
  onRestartConversation: () => Promise<void>;
}) {
  const { resolveToolPermission } = useConversationActions();

  const handleResolvePermission = useCallback(
    async (
      toolCallId: string,
      action: "approve" | "deny",
      rememberScope?: "none" | "conversation_category",
    ) => {
      await resolveToolPermission(toolCallId, action, rememberScope);
    },
    [resolveToolPermission],
  );
  const restartSuggestion = message.toolCalls
    .map((toolCall) => extractRestartSuggestion(toolCall))
    .find((suggestion) => suggestion !== null);
  const activeRestartSuggestion =
    restartSuggestion &&
    restartSuggestion.publishedVersionId !== loadedPublishedVersionId
      ? restartSuggestion
      : null;

  const segments = message.segments;
  const showEmptyTurnPlaceholder =
    !message.content &&
    !message.isStreaming &&
    message.metadata?.emptyTurn === true;
  const incompleteError =
    message.isStreaming || message.metadata?.incomplete !== true
      ? null
      : typeof message.metadata?.errorMessage === "string" &&
          message.metadata.errorMessage.length > 0
        ? message.metadata.errorMessage
        : null;

  return (
    <div className="flex gap-3">
      <AssistantAvatar />

      <div className="min-w-0 flex-1 space-y-3">
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
          <p className="text-sm text-muted-foreground italic">
            本轮未返回可展示内容
          </p>
        ) : null}

        {/* 流式输出时最后一个 segment 后的光标 */}
        {message.isStreaming && segments.length > 0 && <StreamingCaret />}

        {incompleteError && (
          <Alert variant="error" icon={AlertTriangle}>
            <span className="whitespace-pre-wrap">
              本轮在输出过程中中断：{incompleteError}
            </span>
          </Alert>
        )}

        {activeRestartSuggestion && (
          <RestartToLatestVersionCard
            publishedVersionNumber={
              activeRestartSuggestion.publishedVersionNumber
            }
            onRestart={onRestartConversation}
          />
        )}

        <span className="block text-2xs tabular-nums text-muted-foreground">
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
  onResolvePermission: (
    toolCallId: string,
    action: "approve" | "deny",
    rememberScope?: "none" | "conversation_category",
  ) => Promise<void>;
}) {
  switch (segment.type) {
    case "text":
      return (
        <MarkdownRenderer
          content={segment.content}
          className="text-sm break-words"
        />
      );
    case "thinking":
      return <ThinkingBlock content={segment.content} />;
    case "tool_call": {
      const tc = message.toolCalls.find((t) => t.id === segment.toolCallId);
      if (!tc) return null;
      return (
        <ToolCallCard
          toolCall={toToolCallData(tc)}
          defaultExpanded={false}
          onResolvePermission={onResolvePermission}
        />
      );
    }
  }
});

function segmentKey(seg: MessageSegment, index: number): string {
  if (seg.type === "tool_call") return `tc-${seg.toolCallId}`;
  return `${seg.type}-${index}`;
}

function isCompletionNotice(message: ConversationMessage): boolean {
  return message.metadata?.type === "subagent_completion_notice";
}

export interface MessageListProps {
  messages: ConversationMessage[];
  isExecuting: boolean;
  runtimeMode: AgentRuntimeMode;
  loadedPublishedVersionId?: string | null;
  onRestartConversation: () => Promise<void>;
}

export function MessageList({
  messages,
  isExecuting,
  runtimeMode,
  loadedPublishedVersionId,
  onRestartConversation,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** 用户是否停留在底部附近（距底 <80px）—— 只有此时才跟随新内容滚动 */
  const stickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  /**
   * 首批非空消息（历史）的 id：这些消息不做入场动画，
   * 之后追加的消息用无 delay 的 fadeInUp。
   */
  const [historyIds, setHistoryIds] = useState<ReadonlySet<string> | null>(
    () => (messages.length > 0 ? new Set(messages.map((m) => m.id)) : null),
  );
  if (historyIds === null && messages.length > 0) {
    setHistoryIds(new Set(messages.map((m) => m.id)));
  }
  useSubAgentStreams(); // 保持订阅

  const preparationPhase = usePreparationPhase();
  const preparationStartTime = usePreparationStartTime();
  const sandboxReused = useSandboxReused();
  const preparationError = usePreparationError();
  const preparationFailedPhase = usePreparationFailedPhase();

  // Show the preparation card only for sandbox agents (no-sandbox agents skip straight to the generic typing indicator)
  const showPreparationCard =
    runtimeMode === "sandbox" &&
    (preparationPhase !== null || preparationStartTime !== null);

  // 内容变化（含流式 token 增长）后同步跟随到底部；新发出的用户消息总是滚到底
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const isNewUserMessage =
      last !== undefined &&
      last.id !== lastMessageIdRef.current &&
      last.role === "user" &&
      lastMessageIdRef.current !== null;
    lastMessageIdRef.current = last?.id ?? null;
    if (isNewUserMessage) {
      stickToBottomRef.current = true;
      el.scrollTo?.({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isExecuting, preparationPhase]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      {messages.length === 0 && !showPreparationCard ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            className="border-0"
            icon={MessagesSquare}
            title="与 Agent 开始对话吧"
            description="在下方输入需求，或直接拖入文件与截图作为上下文。"
          />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((msg) =>
            isCompletionNotice(msg) ? (
              <SubAgentCompletionNotice
                key={msg.id}
                handle={
                  (msg.metadata?.handle ??
                    msg.metadata?.subagentHandle ??
                    "sa_unknown") as string as SubAgentHandle
                }
                alias={
                  (msg.metadata?.alias ??
                    msg.metadata?.subagentAlias ??
                    "Sub-Agent") as string
                }
                status={
                  (msg.metadata?.status ??
                    msg.metadata?.subagentStatus ??
                    "completed") as SubAgentRunStatus
                }
                error={
                  (msg.metadata?.error ?? msg.metadata?.subagentError) as
                    | string
                    | undefined
                }
              />
            ) : (
              <motion.div
                key={msg.id}
                initial={
                  historyIds === null || historyIds.has(msg.id)
                    ? false
                    : fadeInUp.initial
                }
                animate={fadeInUp.animate}
                transition={fadeInUp.transition}
              >
                {msg.role === "user" ? (
                  <UserBubble message={msg} />
                ) : (
                  <AssistantMessage
                    message={msg}
                    loadedPublishedVersionId={loadedPublishedVersionId}
                    onRestartConversation={onRestartConversation}
                  />
                )}
              </motion.div>
            ),
          )}

          {/* Preparation card in the agent message position */}
          {showPreparationCard && (
            <div className="flex gap-3">
              <AssistantAvatar />
              <div className="min-w-0 flex-1">
                <PreparationCard
                  phase={preparationPhase}
                  startTime={preparationStartTime}
                  sandboxReused={sandboxReused}
                  showSandboxPhase={runtimeMode === "sandbox"}
                  error={preparationError}
                  failedPhase={preparationFailedPhase}
                />
              </div>
            </div>
          )}

          {/* Generic executing indicator (only when no preparation card and no streaming message) */}
          {isExecuting &&
            !showPreparationCard &&
            !messages.some((m) => m.role === "assistant" && m.isStreaming) && (
              <div className="flex gap-3">
                <AssistantAvatar />
                <TypingIndicator />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
