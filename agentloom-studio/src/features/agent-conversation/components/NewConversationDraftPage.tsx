import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAgent } from "@/features/agent/api/agentQueries";
import { useStartConversation } from "../api/conversationMutations";
import type { OutgoingConversationMessage } from "../types";
import { ConversationComposer } from "./AgentConversationPage";

interface NewConversationDraftPageProps {
  agentId: string;
  onBack?: () => void;
}

function normalizeOutgoingMessage(
  message: string | OutgoingConversationMessage,
): OutgoingConversationMessage {
  return typeof message === "string" ? { content: message } : message;
}

export function NewConversationDraftPage({
  agentId,
  onBack,
}: NewConversationDraftPageProps) {
  const navigate = useNavigate();
  const agentQuery = useAgent(agentId);
  const startConversation = useStartConversation(agentId);
  const [error, setError] = useState<string | null>(null);

  const runtimeModeLabel =
    agentQuery.data?.runtimeMode === "no_sandbox" ? "无沙箱" : "有沙箱";

  const handleSend = useCallback(
    async (message: string | OutgoingConversationMessage) => {
      const outgoing = normalizeOutgoingMessage(message);
      setError(null);

      try {
        const conversation = await startConversation.mutateAsync({
          content: outgoing.content,
          ...(outgoing.contentType
            ? { contentType: outgoing.contentType }
            : {}),
          ...(outgoing.metadata ? { metadata: outgoing.metadata } : {}),
        });

        navigate({
          to: "/agents/$agentId/conversations/$conversationId",
          params: { agentId, conversationId: conversation.id },
          replace: true,
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "创建对话失败，请重试",
        );
        throw cause;
      }
    },
    [agentId, navigate, startConversation],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 shrink-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              startConversation.isPending
                ? "bg-warning animate-pulse"
                : "bg-muted-foreground"
            }`}
          />
          <h1 className="text-sm font-medium text-foreground">Agent 新对话</h1>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {runtimeModeLabel}
          </span>
        </div>
        {startConversation.isPending ? (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-info">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>正在创建并发送</span>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="flex items-center gap-2 border-b border-error/20 bg-error/10 px-4 py-2 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-elevated text-muted-foreground">
              <Loader2 className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              首条消息发送后再创建对话
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              这里是草稿态。输入文字或上传附件后，系统会创建真实 conversation，
              然后立刻进入正式对话页继续执行。
            </p>
          </div>
        </div>

        <ConversationComposer
          onSend={handleSend}
          isBusy={startConversation.isPending}
          busyPlaceholder="正在创建并发送..."
          busyActionLabel="发送中"
        />
      </div>
    </div>
  );
}
