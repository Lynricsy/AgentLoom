import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";
import { useAuthToken } from "@/features/auth/hooks/useAuthToken";
import { useAgent } from "@/features/agent/api/agentQueries";
import { SubAgentNavContext } from "@/shared/components/tool-renderers/renderers/SubAgentRenderer";
import { resolveSubAgentView } from "../subAgentView";
import { resolveConversationWorkspacePreviewId } from "../workspacePreview";
import { useConversationWorkspaceSync } from "../hooks/useConversationWorkspaceSync";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationLayout } from "./ConversationLayout";
import { MessageList } from "./MessageList";
import { SandboxComputerPanel } from "./SandboxComputerPanel";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { AgentViewBreadcrumb } from "./AgentViewBreadcrumb";
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
  useWorkspaceTreeLoading,
} from "../stores/agent-conversation.store";

interface AgentConversationPageProps {
  agentId: string;
  conversationId: string;
  onBack?: () => void;
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
  const workspaceTreeLoading = useWorkspaceTreeLoading();
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

  const [isRestartingConversation, setIsRestartingConversation] =
    useState(false);

  useConversationWorkspaceSync({
    agentId,
    conversationId,
    agent: agentQuery.data,
    hasSandbox,
    workspacePreviewId,
    status,
    sandboxStatus,
    isRestartingConversation,
    authToken,
    actions,
  });

  const isExecuting = status === "executing";

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
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              className="text-muted-foreground"
              title="返回"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                status === "connected" || status === "executing"
                  ? "bg-success"
                  : status === "connecting"
                    ? "bg-warning animate-pulse"
                    : status === "error"
                      ? "bg-error"
                      : "bg-muted-foreground",
              )}
            />
            <h1 className="truncate text-sm font-semibold text-foreground">
              {agentName || "Agent"} 对话
            </h1>
            <Badge variant="secondary" size="sm" className="shrink-0">
              {runtimeModeLabel}
            </Badge>
          </div>
          {isExecuting && (
            <Badge variant="info" size="sm" className="ml-auto shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" />
              处理中
            </Badge>
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

        <ConversationLayout
          hasSandbox={hasSandbox}
          messages={
            <MessageList
              messages={displayMessages}
              isExecuting={isExecuting && !isSubAgentView}
              runtimeMode={runtimeMode === "no_sandbox" ? "no_sandbox" : "sandbox"}
              loadedPublishedVersionId={loadedPublishedVersionId}
              onRestartConversation={handleRestartConversation}
            />
          }
          composer={
            !isSubAgentView ? (
              <ConversationComposer
                onSend={actions.sendMessage}
                isBusy={isExecuting}
                onCancel={actions.cancelExecution}
              />
            ) : null
          }
          computerPanel={
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
          }
          workspacePanel={
            <>
              {workspaceSource === "snapshot_preview" ? (
                <div
                  data-testid="workspace-snapshot-preview-hint"
                  className="rounded-card border border-info/30 bg-info/10 px-3 py-2 text-xs text-info"
                >
                  当前显示的是持久化工作区目录预览；对话开始并恢复沙箱后，这里会切换为实时工作区。
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-hidden">
                <WorkspaceFileTree
                  tree={fileTree}
                  selectedPath={selectedFilePath}
                  onSelectFile={actions.selectFile}
                  isLoading={workspaceTreeLoading}
                />
              </div>
            </>
          }
        />
      </div>
    </SubAgentNavContext.Provider>
  );
}
