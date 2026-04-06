import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ChangeEvent,
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
import { useToast } from "@/shared/ui/toast";
import { useAuthToken } from "@/features/auth/hooks/useAuthToken";
import { useAgent } from "@/features/agent/api/agentQueries";
import { SubAgentNavContext } from "@/shared/components/tool-renderers/renderers/SubAgentRenderer";
import { resolveConversationWorkspacePreviewId } from "../workspacePreview";
import { MessageList } from "./MessageList";
import { SandboxComputerPanel } from "./SandboxComputerPanel";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { AgentViewBreadcrumb } from "./AgentViewBreadcrumb";
import type {
  ConversationMessage,
  OutgoingConversationMessage,
  SubAgentStream,
  ToolCall,
} from "../types";
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
  useWorkspaceSource,
} from "../stores/agent-conversation.store";

interface AgentConversationPageProps {
  agentId: string;
  conversationId: string;
  onBack?: () => void;
}

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_LEFT_RATIO = 0.6;
const EXECUTING_HISTORY_SYNC_INTERVAL_MS = 3_000;
const MAX_CONVERSATION_ATTACHMENT_BYTES = 1_500_000;
const MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES = 200_000;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "xml",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "sql",
  "html",
  "css",
  "scss",
  "sh",
  "bash",
  "zsh",
  "env",
  "toml",
  "ini",
  "log",
]);

function describeAttachmentContent(
  kind: "image" | "file",
  fileName: string,
): string {
  return `已上传${kind === "image" ? "图片" : "文件"} ${fileName}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取结果无效"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("文件读取失败"));
    };
    reader.readAsDataURL(file);
  });
}

function extractBase64Payload(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(",");
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
}

function isLikelyTextAttachment(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("text/")) {
    return true;
  }

  if (
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript" ||
    mimeType === "application/typescript" ||
    mimeType === "application/x-sh" ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  ) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? TEXT_ATTACHMENT_EXTENSIONS.has(extension) : false;
}

async function buildImageConversationMessage(
  file: File,
  content?: string,
): Promise<OutgoingConversationMessage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择有效的图片文件");
  }

  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("图片大小不能超过 1.5 MB");
  }

  const dataUrl = await readFileAsDataUrl(file);

  return {
    content: content?.trim() || describeAttachmentContent("image", file.name),
    contentType: "image",
    metadata: {
      attachment: {
        kind: "image",
        fileName: file.name,
        mimeType: file.type || "image/png",
        sizeBytes: file.size,
        dataBase64: extractBase64Payload(dataUrl),
      },
    },
  };
}

async function buildFileConversationMessage(
  file: File,
  content?: string,
): Promise<OutgoingConversationMessage> {
  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("文件大小不能超过 1.5 MB");
  }

  const mimeType = file.type || "application/octet-stream";
  const baseMessage = {
    content: content?.trim() || describeAttachmentContent("file", file.name),
    contentType: "file" as const,
  };

  if (isLikelyTextAttachment(file)) {
    const textContent = await file.text();
    const textBytes = new TextEncoder().encode(textContent).byteLength;

    if (textBytes <= MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES) {
      return {
        ...baseMessage,
        metadata: {
          attachment: {
            kind: "file",
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            textContent,
          },
        },
      };
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    ...baseMessage,
    metadata: {
      attachment: {
        kind: "file",
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        dataBase64: extractBase64Payload(dataUrl),
      },
    },
  };
}

function buildSubAgentMessages(stream: SubAgentStream): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let assistantIdx = -1;

  function ensureAssistant(): ConversationMessage {
    if (assistantIdx >= 0) return messages[assistantIdx]!;
    const msg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      contentType: "text",
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

export function ConversationComposer({
  onSend,
  isBusy,
  onCancel,
  idlePlaceholder,
  busyPlaceholder,
  busyActionLabel,
}: {
  onSend: (
    message: string | OutgoingConversationMessage,
  ) => void | Promise<void>;
  isBusy: boolean;
  onCancel?: () => void;
  idlePlaceholder?: string;
  busyPlaceholder?: string;
  busyActionLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await Promise.resolve(onSend(trimmed));
      setDraft("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      // 父组件负责展示错误，composer 只保留输入内容。
    }
  }, [draft, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void handleSend();
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

  const clearDraftInput = useCallback(() => {
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, []);

  const handleAttachmentSelected = useCallback(
    async (file: File | null, kind: "file" | "image") => {
      if (!file) {
        return;
      }

      try {
        const trimmed = draft.trim();
        const outgoing =
          kind === "image"
            ? await buildImageConversationMessage(file, trimmed)
            : await buildFileConversationMessage(file, trimmed);

        await Promise.resolve(onSend(outgoing));
        if (trimmed.length > 0) {
          clearDraftInput();
        }
      } catch (error) {
        notify({
          title: "上传失败",
          description:
            error instanceof Error ? error.message : "文件读取失败，请重试",
          variant: "error",
        });
      }
    },
    [clearDraftInput, draft, notify, onSend],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleAttachmentSelected(file, "file");
      event.target.value = "";
    },
    [handleAttachmentSelected],
  );

  const handleImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void handleAttachmentSelected(file, "image");
      event.target.value = "";
    },
    [handleAttachmentSelected],
  );

  const handleFileClick = useCallback(() => {
    if (!isBusy) {
      fileInputRef.current?.click();
    }
  }, [isBusy]);

  const handleImageClick = useCallback(() => {
    if (!isBusy) {
      imageInputRef.current?.click();
    }
  }, [isBusy]);

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          data-testid="conversation-file-input"
          onChange={handleFileChange}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="conversation-image-input"
          onChange={handleImageChange}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleFileClick}
            disabled={isBusy}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title="上传文件"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleImageClick}
            disabled={isBusy}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
              isBusy
                ? (busyPlaceholder ?? "Agent 正在思考中...")
                : (idlePlaceholder ?? "输入消息，Enter 发送，Shift+Enter 换行")
            }
            className={cn(
              "w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-info/50 focus:border-info/50",
              "min-h-[40px] max-h-[160px]",
            )}
            rows={1}
            disabled={isBusy}
          />
        </div>

        {isBusy && onCancel ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="shrink-0 text-error border-error/30 hover:bg-error/10"
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            停止
          </Button>
        ) : isBusy ? (
          <Button size="sm" disabled className="shrink-0">
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            {busyActionLabel ?? "发送中"}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void handleSend()}
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
  const workspaceSource = useWorkspaceSource();
  const runtimeMode = agentQuery.data?.runtimeMode;
  const workspacePreviewId = resolveConversationWorkspacePreviewId(
    agentQuery.data,
  );
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
    if (hasSandbox) {
      if (workspacePreviewId) {
        void a.loadWorkspacePreview(conversationId, workspacePreviewId);
      }
      void a.loadWorkspaceTree(conversationId);
    }
    void a.loadHistory(conversationId).finally(() => {
      if (hasSandbox) {
        void a.loadWorkspaceTree(conversationId);
      }
    });

    return () => {
      a.disconnect();
    };
  }, [
    agentId,
    agentQuery.data,
    conversationId,
    hasSandbox,
    workspacePreviewId,
  ]);

  useEffect(() => {
    if (status !== "executing") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const a = actionsRef.current;
      void a.loadHistory(conversationId);
      if (hasSandbox) {
        void a.loadWorkspaceTree(conversationId);
      }
    }, EXECUTING_HISTORY_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [conversationId, hasSandbox, status]);

  useEffect(() => {
    if (!hasSandbox || sandboxStatus !== "running") {
      return;
    }

    void actionsRef.current.loadWorkspaceTree(conversationId);
  }, [conversationId, hasSandbox, sandboxStatus]);

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
                runtimeMode={
                  runtimeMode === "no_sandbox" ? "no_sandbox" : "sandbox"
                }
                onRestartConversation={handleRestartConversation}
              />
            </div>
            {!isSubAgentView && (
              <ConversationComposer
                onSend={actions.sendMessage}
                isBusy={isExecuting}
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

                <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 pt-0">
                  {workspaceSource === "snapshot_preview" ? (
                    <div
                      data-testid="workspace-snapshot-preview-hint"
                      className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info"
                    >
                      当前显示的是持久化工作区目录预览；对话开始并恢复沙箱后，这里会切换为实时工作区。
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-hidden">
                    <WorkspaceFileTree
                      tree={fileTree}
                      selectedPath={selectedFilePath}
                      onSelectFile={actions.selectFile}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : runtimeMode === "no_sandbox" ? (
            <div className="flex min-w-0 flex-1 items-start justify-center border-l border-border bg-surface p-6">
              <div className="max-w-sm rounded-lg border border-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted-foreground">
                无沙箱 Agent
                不提供工作区、进程和文件变更面板；Skill、知识库、Memory、HTTP
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
