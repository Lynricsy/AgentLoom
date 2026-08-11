import { AlertCircle, ArrowLeft, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/components/spinner/Spinner";
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
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        {onBack ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="text-muted-foreground"
            title="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              startConversation.isPending
                ? "bg-warning animate-pulse"
                : "bg-muted-foreground"
            }`}
          />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Agent 新对话
          </h1>
          <Badge variant="secondary" size="sm" className="shrink-0">
            {runtimeModeLabel}
          </Badge>
        </div>
        {startConversation.isPending ? (
          <Badge variant="info" size="sm" className="ml-auto shrink-0">
            <Spinner size="sm" className="text-info" label="正在创建并发送" />
            正在创建并发送
          </Badge>
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
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
            <EmptyState
              className="border-0"
              icon={MessagesSquare}
              title="开始一个新对话"
              description="描述你希望 Agent 完成的任务，也可以先带上文件或截图作为上下文。"
            />
          </div>

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
            className="hidden min-w-[320px] flex-1 flex-col gap-2 border-l border-border bg-surface p-2 lg:flex"
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
                    className="rounded-card border border-info/30 bg-info/10 px-3 py-2 text-xs text-info"
                  >
                    当前显示的是持久化工作区目录预览；对话开始并恢复沙箱后，这里会切换为实时工作区。
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-hidden">
                  <WorkspaceFileTree
                    tree={previewTree}
                    selectedPath={selectedPreviewPath}
                    onSelectFile={setSelectedPreviewPath}
                    isLoading={isPreviewLoading}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
