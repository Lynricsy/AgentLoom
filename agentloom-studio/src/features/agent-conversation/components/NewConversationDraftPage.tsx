import { AlertCircle, ArrowLeft, FolderTree, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAgent } from "@/features/agent/api/agentQueries";
import { fetchWorkspaceFileTree } from "@/features/workspace/api/workspaceApi";
import { useStartConversation } from "../api/conversationMutations";
import type { FileTreeNode, OutgoingConversationMessage } from "../types";
import { resolveConversationWorkspacePreviewId } from "../workspacePreview";
import { ConversationComposer } from "./AgentConversationPage";
import { SandboxComputerPanel } from "./SandboxComputerPanel";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

interface NewConversationDraftPageProps {
  agentId: string;
  onBack?: () => void;
}

function normalizeOutgoingMessage(
  message: string | OutgoingConversationMessage,
): OutgoingConversationMessage {
  return typeof message === "string" ? { content: message } : message;
}

function fileExistsInTree(
  tree: readonly FileTreeNode[],
  targetPath: string,
): boolean {
  for (const node of tree) {
    if (node.path === targetPath) {
      return true;
    }

    if (node.children && fileExistsInTree(node.children, targetPath)) {
      return true;
    }
  }

  return false;
}

export function NewConversationDraftPage({
  agentId,
  onBack,
}: NewConversationDraftPageProps) {
  const navigate = useNavigate();
  const agentQuery = useAgent(agentId);
  const startConversation = useStartConversation(agentId);
  const [error, setError] = useState<string | null>(null);
  const [previewTree, setPreviewTree] = useState<FileTreeNode[]>([]);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState<string | null>(
    null,
  );
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const runtimeMode = agentQuery.data?.runtimeMode;
  const hasSandbox = runtimeMode === "sandbox";
  const workspacePreviewId = resolveConversationWorkspacePreviewId(
    agentQuery.data,
  );
  const agentName = agentQuery.data?.name?.trim() || "Agent";

  const runtimeModeLabel =
    runtimeMode === "sandbox"
      ? "有沙箱"
      : runtimeMode === "no_sandbox"
        ? "无沙箱"
        : "加载中";

  useEffect(() => {
    let cancelled = false;

    if (!hasSandbox || !workspacePreviewId) {
      setPreviewTree([]);
      setSelectedPreviewPath(null);
      setIsPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPreviewLoading(true);

    void fetchWorkspaceFileTree(workspacePreviewId)
      .then((tree) => {
        if (cancelled) {
          return;
        }

        setPreviewTree(tree);
        setSelectedPreviewPath((current) => {
          if (!current || fileExistsInTree(tree, current)) {
            return current;
          }

          return null;
        });
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        console.error(
          "[AgentConversation] Failed to load draft workspace preview:",
          cause,
        );
        setPreviewTree([]);
        setSelectedPreviewPath(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasSandbox, workspacePreviewId]);

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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 bg-background" />

          <ConversationComposer
            onSend={handleSend}
            isBusy={startConversation.isPending}
            busyPlaceholder="正在创建并发送..."
            busyActionLabel="发送中"
          />
        </div>

        {hasSandbox ? (
          <div
            data-testid="draft-conversation-context-pane"
            className="flex min-w-[320px] flex-1 flex-col gap-2 border-l border-border bg-surface p-2"
          >
            <div className="min-h-[220px] flex-[3] overflow-hidden">
              <SandboxComputerPanel
                conversationId={null}
                agentName={agentName}
                terminalEntries={[]}
                fileChanges={[]}
                sandboxStatus="idle"
                isExecuting={false}
              />
            </div>

            <div className="min-h-0 flex-[2] overflow-hidden">
              <div className="flex h-full flex-col gap-2 overflow-hidden">
                {workspacePreviewId ? (
                  <div
                    data-testid="workspace-snapshot-preview-hint"
                    className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info"
                  >
                    当前显示的是持久化工作区目录预览；对话开始并恢复沙箱后，这里会切换为实时工作区。
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-hidden">
                  {isPreviewLoading ? (
                    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
                      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated/50 px-3 py-2">
                        <FolderTree className="h-4 w-4 text-warning/80" />
                        <span className="text-sm font-medium text-foreground">
                          工作区
                        </span>
                      </div>
                      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>正在加载目录预览</span>
                      </div>
                    </div>
                  ) : (
                    <WorkspaceFileTree
                      tree={previewTree}
                      selectedPath={selectedPreviewPath}
                      onSelectFile={setSelectedPreviewPath}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
