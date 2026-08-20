import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  FileText,
  ImageIcon,
  ImagePlus,
  Loader2,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import {
  describeConversationAttachmentsSummary,
  getConversationAttachmentTotalBytes,
  MAX_CONVERSATION_ATTACHMENT_TOTAL_BYTES,
} from "../attachmentUtils";
import {
  buildAttachmentConversationMessage,
  buildFileConversationAttachment,
  buildImageConversationAttachment,
} from "../lib/conversation-attachment-drafts";
import type {
  ConversationAttachment,
  OutgoingConversationMessage,
} from "../types";

export interface ConversationComposerProps {
  onSend: (
    message: string | OutgoingConversationMessage,
  ) => void | Promise<void>;
  isBusy: boolean;
  onCancel?: () => void;
  idlePlaceholder?: string;
  busyPlaceholder?: string;
  busyActionLabel?: string;
}

/**
 * 对话输入区：草稿、附件暂存与发送 / 停止动作。
 * 发送失败时保留输入内容，由父组件负责错误提示。
 */
export function ConversationComposer({
  onSend,
  isBusy,
  onCancel,
  idlePlaceholder,
  busyPlaceholder,
  busyActionLabel,
}: ConversationComposerProps) {
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
    <div className="shrink-0 px-4 pt-2 pb-4">
      <div className="mx-auto w-full max-w-3xl rounded-panel border border-border bg-surface shadow-popover">
        {pendingAttachments.length > 0 ? (
          <div
            className="flex flex-wrap gap-2 border-b border-border px-3 py-3"
            data-testid="attachment-draft-list"
          >
            {pendingAttachments.map((attachment, index) => (
              <div
                key={`${attachment.fileName}-${attachment.sizeBytes}-${index}`}
                className="flex min-w-0 max-w-full items-start gap-2 rounded-card border border-border bg-surface-elevated px-3 py-2"
              >
                <div className="mt-0.5 rounded-md bg-surface p-2 text-muted-foreground">
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveAttachment(index)}
                  disabled={isBusy}
                  className="ml-1 h-6 w-6 shrink-0 text-muted-foreground"
                  aria-label={`移除附件 ${attachment.fileName}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

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

        <Textarea
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
            "max-h-[160px] min-h-[44px] resize-none rounded-none border-0 bg-transparent px-4 py-3",
            "focus-visible:ring-0",
          )}
          rows={1}
          disabled={isBusy}
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleFileClick}
            disabled={isBusy}
            className="text-muted-foreground"
            title="上传文件"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleImageClick}
            disabled={isBusy}
            className="text-muted-foreground"
            title="上传图片"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Enter 发送 · Shift+Enter 换行
            </span>

            {isBusy && onCancel ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="border-error/40 text-error hover:border-error/60 hover:bg-error/10"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : isBusy ? (
              <Button size="sm" disabled>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {busyActionLabel ?? "发送中"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void handleSend()}
                disabled={
                  draft.trim().length === 0 && pendingAttachments.length === 0
                }
              >
                <Send className="h-3.5 w-3.5" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
