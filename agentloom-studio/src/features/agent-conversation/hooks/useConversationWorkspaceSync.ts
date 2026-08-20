import { useEffect, useRef } from "react";
import type { AgentRuntimeMode } from "@/features/agent/types/agentRuntimeMode";
import type { ConversationStatus, SandboxStatus } from "../types";

const EXECUTING_HISTORY_SYNC_INTERVAL_MS = 3_000;

/** 本 hook 只用到的 store actions 子集 */
interface ConversationSyncActions {
  connect: (params: {
    conversationId: string;
    agentId: string;
    agentName: string;
    runtimeMode: AgentRuntimeMode;
    authToken?: string;
  }) => void;
  disconnect: () => void;
  loadHistory: (conversationId: string) => Promise<void>;
  loadWorkspacePreview: (
    conversationId: string,
    workspaceId: string,
  ) => Promise<void>;
  loadWorkspaceTree: (conversationId: string) => Promise<void>;
}

export interface UseConversationWorkspaceSyncOptions {
  agentId: string;
  conversationId: string;
  agent: { runtimeMode: AgentRuntimeMode } | undefined;
  hasSandbox: boolean;
  workspacePreviewId: string | null;
  status: ConversationStatus;
  sandboxStatus: SandboxStatus;
  isRestartingConversation: boolean;
  authToken: string | undefined;
  actions: ConversationSyncActions;
}

/**
 * 对话 socket 生命周期与工作区同步。
 * 执行中按固定间隔补拉历史与文件树（socket 丢事件的兜底）；重启会话期间暂停轮询。
 * `actions` / `authToken` 走 ref，避免 store 引用变化重连 socket。
 */
export function useConversationWorkspaceSync({
  agentId,
  conversationId,
  agent,
  hasSandbox,
  workspacePreviewId,
  status,
  sandboxStatus,
  isRestartingConversation,
  authToken,
  actions,
}: UseConversationWorkspaceSyncOptions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  useEffect(() => {
    if (!agent) {
      return;
    }

    const a = actionsRef.current;
    const token = authTokenRef.current;
    a.connect({
      conversationId,
      agentId,
      agentName: "",
      runtimeMode: agent.runtimeMode,
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
  }, [agentId, agent, conversationId, hasSandbox, workspacePreviewId]);

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
}
