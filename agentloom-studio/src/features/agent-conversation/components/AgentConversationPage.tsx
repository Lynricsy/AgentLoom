import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Send,
  Square,
  Paperclip,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { useAuthToken } from "@/features/auth/hooks/useAuthToken";
import { useAgent } from "@/features/agent/api/agentQueries";
import { SubAgentNavContext } from "@/shared/components/tool-renderers/renderers/SubAgentRenderer";
import { MessageList } from "./MessageList";
import { SandboxComputerPanel } from "./SandboxComputerPanel";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { AgentViewBreadcrumb } from "./AgentViewBreadcrumb";
import type { ConversationMessage, SubAgentStream, ToolCall } from "../types";
import type { ToolCallData } from "@/shared/components/tool-renderers/types";
import {
  useConversationMessages,
  useConversationStatus,
  useConversationActions,
  useTerminalEntries,
  useFileTree,
  useFileChanges,
  useSandboxStatus,
  useSelectedFilePath,
  useAgentName,
  useAgentViewStack,
  useSubAgentStreams,
  useExecutionError,
  useConversationConnectionError,
} from "../stores/agent-conversation.store";

interface AgentConversationPageProps {
  agentId: string;
  conversationId: string;
  onBack?: () => void;
}

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_LEFT_RATIO = 0.6;

function buildSubAgentMessages(stream: SubAgentStream): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let assistantIdx = -1;

  function ensureAssistant(): ConversationMessage {
    if (assistantIdx >= 0) return messages[assistantIdx]!;
    const msg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolCalls: [],
      segments: [],
      isStreaming: true,
      createdAt: Date.now(),
    };
    messages.push(msg);
    assistantIdx = messages.length - 1;
    return msg;
  }

  for (const event of stream.events) {
    switch (event.type) {
      case "message_chunk": {
        const msg = ensureAssistant();
        const payload = event.payload as { chunk?: string };
        const chunk = payload.chunk ?? "";
        msg.content += chunk;
        // 维护 segments
        const lastSeg = msg.segments[msg.segments.length - 1];
        if (lastSeg && lastSeg.type === "text") {
          lastSeg.content += chunk;
        } else {
          msg.segments.push({ type: "text", content: chunk });
        }
        break;
      }
      case "thinking": {
        const msg = ensureAssistant();
        const payload = event.payload as { content?: string };
        const content = payload.content ?? "";
        msg.thinking = (msg.thinking ?? "") + content;
        const lastSeg = msg.segments[msg.segments.length - 1];
        if (lastSeg && lastSeg.type === "thinking") {
          lastSeg.content += content;
        } else {
          msg.segments.push({ type: "thinking", content });
        }
        break;
      }
      case "tool_call": {
        const msg = ensureAssistant();
        const p = event.payload as {
          toolCallId?: string;
          tool?: string;
          toolName?: string;
          name?: string;
          args?: unknown;
          status?: string;
        };
        const toolCallId = p.toolCallId ?? event.id;
        if (!msg.toolCalls.some((tc) => tc.id === toolCallId)) {
          msg.toolCalls.push({
            id: toolCallId,
            tool: p.tool ?? p.toolName ?? p.name ?? "unknown",
            args: p.args,
            status: (p.status as ToolCall["status"]) ?? "pending",
            startedAt: event.timestamp,
            updatedAt: event.timestamp,
          });
          msg.segments.push({ type: "tool_call", toolCallId });
        }
        break;
      }
      case "tool_result": {
        const msg = ensureAssistant();
        const p = event.payload as {
          toolCallId?: string;
          tool?: string;
          toolName?: string;
          name?: string;
          args?: unknown;
          result?: unknown;
          error?: string;
          status?: string;
        };
        const toolCallId = p.toolCallId ?? event.id;
        const existing = msg.toolCalls.find((tc) => tc.id === toolCallId);
        if (existing) {
          if (p.result !== undefined) existing.result = p.result;
          if (p.error) existing.error = p.error;
          existing.status = (p.status as ToolCall["status"]) ?? "completed";
          existing.updatedAt = event.timestamp;
        } else {
          msg.toolCalls.push({
            id: toolCallId,
            tool: p.tool ?? p.toolName ?? p.name ?? "unknown",
            args: p.args,
            result: p.result,
            error: p.error,
            status: (p.status as ToolCall["status"]) ?? "completed",
            startedAt: event.timestamp,
            updatedAt: event.timestamp,
          });
          msg.segments.push({ type: "tool_call", toolCallId });
        }
        break;
      }
      case "done": {
        if (assistantIdx >= 0) {
          messages[assistantIdx]!.isStreaming = false;
          assistantIdx = -1;
        }
        break;
      }
    }
  }

  return messages;
}

function ResizableDivider({
  onResize,
  direction,
}: {
  onResize: (delta: number) => void;
  direction: "horizontal" | "vertical";
}) {
  const startPosRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startPosRef.current = direction === "horizontal" ? e.clientX : e.clientY;
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [direction],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    },
    [direction, onResize],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isDraggingRef.current = false;
      (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  return (
    <div
      className={cn(
        "shrink-0 transition-colors hover:bg-info/30 active:bg-info/50",
        direction === "horizontal"
          ? "w-1 cursor-col-resize hover:w-1.5"
          : "h-1 cursor-row-resize hover:h-1.5",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

function MessageInput({
  onSend,
  isExecuting,
  onCancel,
}: {
  onSend: (content: string) => void;
  isExecuting: boolean;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [draft, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleFileClick = useCallback(() => undefined, []);

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <div className="flex items-end gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleFileClick}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="上传文件"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFileClick}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="上传图片"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              isExecuting
                ? "Agent 正在思考中..."
                : "输入消息，Enter 发送，Shift+Enter 换行"
            }
            className={cn(
              "w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-info/50 focus:border-info/50",
              "min-h-[40px] max-h-[160px]",
            )}
            rows={1}
            disabled={isExecuting}
          />
        </div>

        {isExecuting ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="shrink-0 text-error border-error/30 hover:bg-error/10"
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            停止
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!draft.trim()}
            className="shrink-0"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectionError({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-error/10 border-b border-error/20 text-xs text-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>连接错误: {error}</span>
    </div>
  );
}

function RuntimeError({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-error/10 border-b border-error/20 text-xs text-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>运行失败: {error}</span>
    </div>
  );
}

export function AgentConversationPage({
  agentId,
  conversationId,
  onBack,
}: AgentConversationPageProps) {
  const navigate = useNavigate();
  const agentQuery = useAgent(agentId);
  const messages = useConversationMessages();
  const status = useConversationStatus();
  const actions = useConversationActions();
  const terminalEntries = useTerminalEntries();
  const fileTree = useFileTree();
  const fileChanges = useFileChanges();
  const sandboxStatus = useSandboxStatus();
  const selectedFilePath = useSelectedFilePath();
  const agentName = useAgentName();
  const authToken = useAuthToken();
  const agentViewStack = useAgentViewStack();
  const subAgentStreams = useSubAgentStreams();
  const executionError = useExecutionError();
  const connectionError = useConversationConnectionError();
  const runtimeMode = agentQuery.data?.runtimeMode;
  const hasSandbox = runtimeMode === "sandbox";
  const runtimeModeLabel =
    runtimeMode === "sandbox"
      ? "有沙箱"
      : runtimeMode === "no_sandbox"
        ? "无沙箱"
        : "加载中";

  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [rightTopHeight, setRightTopHeight] = useState<number | null>(null);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  useEffect(() => {
    if (!agentQuery.data) {
      return;
    }

    const a = actionsRef.current;
    const token = authTokenRef.current;
    a.connect({
      conversationId,
      agentId,
      agentName: "",
      runtimeMode: agentQuery.data.runtimeMode,
      authToken: token,
    });
    a.loadHistory(conversationId);
    if (hasSandbox) {
      void a.loadWorkspaceTree(conversationId);
    }

    return () => {
      a.disconnect();
    };
  }, [agentId, agentQuery.data, conversationId, hasSandbox, runtimeMode]);

  const initLeftWidth = useCallback(() => {
    if (leftWidth !== null) return leftWidth;
    const container = containerRef.current;
    if (!container) return MIN_LEFT_WIDTH;
    return container.offsetWidth * DEFAULT_LEFT_RATIO;
  }, [leftWidth]);

  const handleHorizontalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.offsetWidth;
      const current = leftWidth ?? totalW * DEFAULT_LEFT_RATIO;
      const next = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(totalW - MIN_RIGHT_WIDTH, current + delta),
      );
      setLeftWidth(next);
    },
    [leftWidth],
  );

  const handleVerticalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rightColumn = container.querySelector("[data-right-column]");
      if (!rightColumn) return;
      const totalH = rightColumn.clientHeight;
      const minH = 120;
      const current = rightTopHeight ?? totalH * 0.6;
      const next = Math.max(minH, Math.min(totalH - minH, current + delta));
      setRightTopHeight(next);
    },
    [rightTopHeight],
  );

  const isExecuting = status === "executing";
  const currentLeftWidth = leftWidth ?? initLeftWidth();

  const isSubAgentView = agentViewStack.length > 0;
  const currentHandle = isSubAgentView
    ? agentViewStack[agentViewStack.length - 1]
    : null;
  const currentStream = currentHandle ? subAgentStreams[currentHandle] : null;
  const displayMessages = useMemo(
    () => (currentStream ? buildSubAgentMessages(currentStream) : messages),
    [currentStream, messages],
  );

  const subAgentNavValue = useMemo(
    () => ({ onDrillIn: actions.pushAgentView }),
    [actions.pushAgentView],
  );

  const handleRestartConversation = useCallback(async () => {
    const nextConversationId = await actions.restartToLatestVersion();
    if (!nextConversationId) {
      return;
    }

    navigate({
      to: "/agents/$agentId/conversations/$conversationId",
      params: {
        agentId,
        conversationId: nextConversationId,
      },
    });
  }, [actions, agentId, navigate]);

  // 从最新的 assistant 消息中提取当前活跃的工具调用（用于 Computer 面板联动）
  const activeToolCall = useMemo<ToolCallData | undefined>(() => {
    if (!isExecuting) return undefined;
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const msg = displayMessages[i]!;
      if (msg.role !== "assistant") continue;
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const tc = msg.toolCalls[j]!;
        if (
          tc.status === "pending" ||
          tc.status === "in_progress" ||
          tc.status === "awaiting_permission"
        ) {
          return {
            id: tc.id,
            tool: tc.tool,
            args: tc.args,
            result: tc.result,
            error: tc.error,
            status: tc.status,
          };
        }
      }
      // 没有活跃工具但有最近完成的，也展示
      if (msg.toolCalls.length > 0) {
        const tc = msg.toolCalls[msg.toolCalls.length - 1]!;
        return {
          id: tc.id,
          tool: tc.tool,
          args: tc.args,
          result: tc.result,
          error: tc.error,
          status: tc.status,
        };
      }
    }
    return undefined;
  }, [displayMessages, isExecuting]);

  return (
    <SubAgentNavContext.Provider value={subAgentNavValue}>
      <div className="flex flex-col h-full bg-background">
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface shrink-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                status === "connected" || status === "executing"
                  ? "bg-success"
                  : status === "connecting"
                    ? "bg-warning animate-pulse"
                    : status === "error"
                      ? "bg-error"
                      : "bg-muted-foreground",
              )}
            />
            <h1 className="text-sm font-medium text-foreground">
              {agentName || "Agent"} 对话
            </h1>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {runtimeModeLabel}
            </span>
          </div>
          {isExecuting && (
            <div className="flex items-center gap-1.5 text-xs text-info ml-auto">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>处理中</span>
            </div>
          )}
        </header>

        {isSubAgentView && (
          <AgentViewBreadcrumb
            agentName={agentName || "Agent"}
            viewStack={agentViewStack}
            subAgentStreams={subAgentStreams}
            onNavigate={actions.navigateToAgentView}
          />
        )}

        {connectionError ? (
          <ConnectionError error={connectionError} />
        ) : executionError ? (
          <RuntimeError error={executionError} />
        ) : null}

        <div ref={containerRef} className="flex flex-1 overflow-hidden">
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{ width: `${currentLeftWidth}px`, minWidth: MIN_LEFT_WIDTH }}
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <MessageList
                messages={displayMessages}
                isExecuting={isExecuting && !isSubAgentView}
                runtimeMode={runtimeMode === "no_sandbox" ? "no_sandbox" : "sandbox"}
                onRestartConversation={handleRestartConversation}
              />
            </div>
            {!isSubAgentView && (
              <MessageInput
                onSend={actions.sendMessage}
                isExecuting={isExecuting}
                onCancel={actions.cancelExecution}
              />
            )}
          </div>

          {hasSandbox ? (
            <>
              <ResizableDivider
                onResize={handleHorizontalResize}
                direction="horizontal"
              />

              <div
                data-right-column
                className="flex flex-col flex-1 overflow-hidden"
                style={{ minWidth: MIN_RIGHT_WIDTH }}
              >
                <div
                  className="overflow-hidden"
                  style={{
                    height: rightTopHeight ? `${rightTopHeight}px` : "60%",
                  }}
                >
                  <SandboxComputerPanel
                    conversationId={conversationId}
                    agentName={agentName || "Agent"}
                    terminalEntries={terminalEntries}
                    fileChanges={fileChanges}
                    sandboxStatus={sandboxStatus}
                    activeToolCall={activeToolCall}
                  />
                </div>

                <ResizableDivider
                  onResize={handleVerticalResize}
                  direction="vertical"
                />

                <div className="flex-1 overflow-hidden">
                  <WorkspaceFileTree
                    tree={fileTree}
                    selectedPath={selectedFilePath}
                    onSelectFile={actions.selectFile}
                  />
                </div>
              </div>
            </>
          ) : runtimeMode === "no_sandbox" ? (
            <div className="flex min-w-0 flex-1 items-start justify-center border-l border-border bg-surface p-6">
              <div className="max-w-sm rounded-lg border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted-foreground">
                无沙箱 Agent
                不提供工作区、终端和文件变更面板；Skill、知识库、Memory、HTTP
                MCP 与自进化能力仍会在对话消息流中展示。
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-start justify-center border-l border-border bg-surface p-6">
              <div className="max-w-sm rounded-lg border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted-foreground">
                正在加载 Agent 运行模式...
              </div>
            </div>
          )}
        </div>
      </div>
    </SubAgentNavContext.Provider>
  );
}
