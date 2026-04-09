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
  ImageIcon,
  FileText,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { useToast } from "@/shared/ui/toast";
import { useAuthToken } from "@/features/auth/hooks/useAuthToken";
import { useAgent } from "@/features/agent/api/agentQueries";
import { SubAgentNavContext } from "@/shared/components/tool-renderers/renderers/SubAgentRenderer";
import { resolveSubAgentView } from "../subAgentView";
import { resolveConversationWorkspacePreviewId } from "../workspacePreview";
import { MessageList } from "./MessageList";
import { SandboxComputerPanel } from "./SandboxComputerPanel";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { AgentViewBreadcrumb } from "./AgentViewBreadcrumb";
import type {
  ConversationAttachment,
  OutgoingConversationMessage,
} from "../types";
import {
  describeConversationAttachmentsSummary,
  inferConversationAttachmentContentType,
  getConversationAttachmentTotalBytes,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES,
  MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES,
  TEXT_ATTACHMENT_EXTENSIONS,
} from "../attachmentUtils";
import type { ToolCallData } from "@/shared/components/tool-renderers/types";
import {
  useConversationMessages,
  useConversationStatus,
  useConversationActions,
  useLoadedPublishedVersionId,
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

async function buildImageConversationAttachment(
  file: File,
): Promise<ConversationAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择有效的图片文件");
  }

  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("图片大小不能超过 1.5 MB");
  }

  const dataUrl = await readFileAsDataUrl(file);

  return {
    kind: "image",
    fileName: file.name,
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    dataBase64: extractBase64Payload(dataUrl),
  };
}

async function buildFileConversationAttachment(
  file: File,
): Promise<ConversationAttachment> {
  if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
    throw new Error("文件大小不能超过 1.5 MB");
  }

  const mimeType = file.type || "application/octet-stream";

  if (isLikelyTextAttachment(file)) {
    const textContent = await file.text();
    const textBytes = new TextEncoder().encode(textContent).byteLength;

    if (textBytes <= MAX_CONVERSATION_TEXT_ATTACHMENT_BYTES) {
      return {
        kind: "file",
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        textContent,
      };
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    kind: "file",
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    dataBase64: extractBase64Payload(dataUrl),
  };
}

function buildAttachmentConversationMessage(
  content: string,
  attachments: ConversationAttachment[],
): OutgoingConversationMessage {
  const contentType = inferConversationAttachmentContentType(attachments);

  return {
    content,
    contentType,
    metadata: {
      contentType,
      attachments,
      ...(attachments.length === 1 ? { attachment: attachments[0] } : {}),
    },
  };
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
  const [pendingAttachments, setPendingAttachments] = useState<
    ConversationAttachment[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 && pendingAttachments.length === 0) return;
    try {
      if (pendingAttachments.length === 0) {
        await Promise.resolve(onSend(trimmed));
      } else {
        const content =
          trimmed || describeConversationAttachmentsSummary(pendingAttachments);
        await Promise.resolve(
          onSend(
            buildAttachmentConversationMessage(content, pendingAttachments),
          ),
        );
      }
      setDraft("");
      setPendingAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      // 父组件负责展示错误，composer 只保留输入内容。
    }
  }, [draft, onSend, pendingAttachments]);

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

  const handleAttachmentSelected = useCallback(
    async (files: FileList | null, kind: "file" | "image") => {
      if (!files || files.length === 0) {
        return;
      }

      try {
        const nextAttachments = await Promise.all(
          Array.from(files).map((file) =>
            kind === "image"
              ? buildImageConversationAttachment(file)
              : buildFileConversationAttachment(file),
          ),
        );
        const mergedAttachments = [
          ...pendingAttachments,
          ...nextAttachments,
        ] satisfies ConversationAttachment[];
        if (
          getConversationAttachmentTotalBytes(mergedAttachments) >
          MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES
        ) {
          throw new Error("单条消息附件总大小不能超过 10 MB");
        }

        setPendingAttachments(mergedAttachments);
      } catch (error) {
        notify({
          title: "上传失败",
          description:
            error instanceof Error ? error.message : "文件读取失败，请重试",
          variant: "error",
        });
      }
    },
    [notify, pendingAttachments],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleAttachmentSelected(event.target.files, "file");
      event.target.value = "";
    },
    [handleAttachmentSelected],
  );

  const handleImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleAttachmentSelected(event.target.files, "image");
      event.target.value = "";
    },
    [handleAttachmentSelected],
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setPendingAttachments((current) =>
      current.filter((_, attachmentIndex) => attachmentIndex !== index),
    );
  }, []);

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
      {pendingAttachments.length > 0 ? (
        <div
          className="mb-3 flex flex-wrap gap-2"
          data-testid="attachment-draft-list"
        >
          {pendingAttachments.map((attachment, index) => (
            <div
              key={`${attachment.fileName}-${attachment.sizeBytes}-${index}`}
              className="flex min-w-0 max-w-full items-start gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2"
            >
              <div className="mt-0.5 rounded-md bg-foreground/5 p-2 text-muted-foreground">
                {attachment.kind === "image" ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {attachment.fileName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {attachment.mimeType} ·{" "}
                  {attachment.sizeBytes < 1024 * 1024
                    ? `${(attachment.sizeBytes / 1024).toFixed(1)} KB`
                    : `${(attachment.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAttachment(index)}
                disabled={isBusy}
                className="ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`移除附件 ${attachment.fileName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="conversation-file-input"
          onChange={handleFileChange}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
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
            disabled={
              draft.trim().length === 0 && pendingAttachments.length === 0
            }
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
  const { notify } = useToast();
  const navigate = useNavigate();
  const agentQuery = useAgent(agentId);
  const messages = useConversationMessages();
  const status = useConversationStatus();
  const actions = useConversationActions();
  const loadedPublishedVersionId = useLoadedPublishedVersionId();
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
  const [isRestartingConversation, setIsRestartingConversation] =
    useState(false);

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
    if (status !== "executing" || isRestartingConversation) {
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
  }, [conversationId, hasSandbox, isRestartingConversation, status]);

  useEffect(() => {
    if (
      !hasSandbox ||
      sandboxStatus !== "running" ||
      isRestartingConversation
    ) {
      return;
    }

    void actionsRef.current.loadWorkspaceTree(conversationId);
  }, [conversationId, hasSandbox, isRestartingConversation, sandboxStatus]);

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
  const currentSubAgentView = useMemo(
    () =>
      currentHandle
        ? resolveSubAgentView(
            currentHandle,
            subAgentStreams[currentHandle] ?? null,
            messages,
          )
        : null,
    [currentHandle, messages, subAgentStreams],
  );
  const breadcrumbLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const handle of agentViewStack) {
      const resolvedView = resolveSubAgentView(
        handle,
        subAgentStreams[handle] ?? null,
        messages,
      );
      labels[handle] = resolvedView?.alias ?? handle;
    }
    return labels;
  }, [agentViewStack, messages, subAgentStreams]);
  const displayMessages = useMemo(
    () => currentSubAgentView?.messages ?? messages,
    [currentSubAgentView, messages],
  );

  const handleDrillIn = useCallback(
    (handle: string) => {
      if (currentHandle === handle) {
        return;
      }

      const nextView = resolveSubAgentView(
        handle,
        subAgentStreams[handle] ?? null,
        messages,
      );
      if (!nextView) {
        notify({
          description:
            "当前没有可恢复的子代理视图数据。完整子代理瀑布仅在实时执行期间可见。",
          variant: "warning",
        });
        return;
      }

      actions.pushAgentView(handle);
    },
    [actions, currentHandle, messages, notify, subAgentStreams],
  );

  const subAgentNavValue = useMemo(
    () => ({ onDrillIn: handleDrillIn }),
    [handleDrillIn],
  );

  const handleRestartConversation = useCallback(async () => {
    if (isRestartingConversation) {
      return;
    }

    setIsRestartingConversation(true);

    try {
      const nextConversationId = await actions.restartToLatestVersion();
      if (!nextConversationId) {
        notify({
          title: "刷新失败",
          description: "服务端没有返回会话 ID，请稍后重试。",
          variant: "error",
        });
        return;
      }

      if (nextConversationId !== conversationId) {
        navigate({
          to: "/agents/$agentId/conversations/$conversationId",
          params: {
            agentId,
            conversationId: nextConversationId,
          },
        });
        return;
      }

      await actions.loadHistory(conversationId);
      if (hasSandbox) {
        await actions.loadWorkspaceTree(conversationId);
      }

      notify({
        title: "已刷新当前对话",
        description: "后续继续对话会使用当前已发布的 Agent 配置。",
        variant: "success",
      });
    } catch (error) {
      notify({
        title: "刷新失败",
        description:
          error instanceof Error
            ? error.message
            : "刷新当前对话失败，请稍后重试。",
        variant: "error",
      });
    } finally {
      setIsRestartingConversation(false);
    }
  }, [
    actions,
    agentId,
    conversationId,
    hasSandbox,
    isRestartingConversation,
    navigate,
    notify,
  ]);

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
            labelsByHandle={breadcrumbLabels}
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
            className={cn(
              "flex min-w-0 flex-col overflow-hidden",
              hasSandbox ? "shrink-0" : "flex-1",
            )}
            style={
              hasSandbox
                ? { width: `${currentLeftWidth}px`, minWidth: MIN_LEFT_WIDTH }
                : undefined
            }
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <MessageList
                messages={displayMessages}
                isExecuting={isExecuting && !isSubAgentView}
                runtimeMode={
                  runtimeMode === "no_sandbox" ? "no_sandbox" : "sandbox"
                }
                loadedPublishedVersionId={loadedPublishedVersionId}
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
                data-testid="agent-conversation-context-pane"
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
                    isExecuting={isExecuting}
                    suspendPolling={isRestartingConversation}
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
          ) : null}
        </div>
      </div>
    </SubAgentNavContext.Provider>
  );
}
