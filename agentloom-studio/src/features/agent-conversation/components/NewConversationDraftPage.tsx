import { ArrowLeft, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Alert } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/components/spinner/Spinner";
import { StatusDot } from "@/shared/ui/status-badge";
import { WorkbenchHeader } from "@/shared/components/workbench-header";
import { useAgent } from "@/features/agent";
import { fetchWorkspaceFileTree } from "@/features/workspace";
import { useStartConversation } from "../api/conversationMutations";
import type { FileTreeNode, OutgoingConversationMessage } from "../types";
import { resolveConversationWorkspacePreviewId } from "../workspacePreview";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationLayout } from "./ConversationLayout";
import { ErrorBanner } from "./ErrorBanner";
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
      <WorkbenchHeader
        leading={
          <div className="flex shrink-0 items-center gap-2">
            {onBack ? (
              <Button
                aria-label="返回"
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                className="text-muted-foreground"
              >
                <ArrowLeft />
              </Button>
            ) : null}
            <StatusDot
              tone={startConversation.isPending ? "warning" : "neutral"}
              pulse={startConversation.isPending}
            />
          </div>
        }
        title="Agent 新对话"
        status={
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" size="sm">
              {runtimeModeLabel}
            </Badge>
            {startConversation.isPending ? (
              <Badge variant="info" size="sm">
                <Spinner size="sm" className="text-info" label="正在创建并发送" />
                正在创建并发送
              </Badge>
            ) : null}
          </div>
        }
      />

      <ErrorBanner error={error} />

      <ConversationLayout
        hasSandbox={hasSandbox}
        messages={
          <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-6">
            <EmptyState
              className="border-0"
              icon={MessagesSquare}
              title="开始一个新对话"
              description="描述你希望 Agent 完成的任务，也可以先带上文件或截图作为上下文。"
            />
          </div>
        }
        composer={
          <ConversationComposer
            onSend={handleSend}
            isBusy={startConversation.isPending}
            busyPlaceholder="正在创建并发送…"
            busyActionLabel="发送中"
          />
        }
        computerPanel={
          <SandboxComputerPanel
            conversationId={null}
            agentName={agentName}
            terminalEntries={[]}
            fileChanges={[]}
            sandboxStatus="idle"
            isExecuting={false}
          />
        }
        workspacePanel={
          <>
            {workspacePreviewId ? (
              <Alert
                variant="info"
                data-testid="workspace-snapshot-preview-hint"
                className="shrink-0"
              >
                当前显示的是持久化工作区目录预览；对话开始并恢复沙箱后，这里会切换为实时工作区。
              </Alert>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              <WorkspaceFileTree
                tree={previewTree}
                selectedPath={selectedPreviewPath}
                onSelectFile={setSelectedPreviewPath}
                isLoading={isPreviewLoading}
              />
            </div>
          </>
        }
      />
    </div>
  );
}
