import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Loader2,
  Trash2,
} from "lucide-react";

import { useTitleUpdateCounter } from "../stores/agent-conversation.store";
import { conversationKeys } from "../api/conversationKeys";
import { useConversationList } from "../api/conversationQueries";
import { useDeleteConversation } from "../api/conversationMutations";
import type { ConversationListItem } from "../api/conversationApi";

const STORAGE_KEY = "agentloom-conv-sidebar-collapsed";

/** 从标题中提取首个 emoji，fallback 到默认 */
function extractEmoji(title: string | null): string {
  if (!title) return "💬";
  const emojiMatch = title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
  return emojiMatch ? emojiMatch[0] : "💬";
}

/** 从标题中提取 emoji 之后的文本部分 */
function extractText(title: string | null): string {
  if (!title) return "未命名";
  return (
    title.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u, "").trim() ||
    "未命名"
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString();
}

interface ConversationSidebarProps {
  agentId: string;
  currentConversationId?: string | null;
}

export const ConversationSidebar = memo(function ConversationSidebar({
  agentId,
  currentConversationId,
}: ConversationSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleUpdateCounter = useTitleUpdateCounter();
  const { data, isLoading } = useConversationList(agentId, { limit: 50 });
  const deleteMutation = useDeleteConversation(agentId);

  const conversations = data?.data ?? [];

  // 当 Socket.IO 推送标题更新时，刷新对话列表
  useEffect(() => {
    if (titleUpdateCounter > 0) {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(),
      });
    }
  }, [titleUpdateCounter, queryClient]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const handleNewConversation = useCallback(() => {
    navigate({
      to: "/agents/$agentId/conversations/new",
      params: { agentId },
    });
  }, [navigate, agentId]);

  const handleSelect = useCallback(
    (conv: ConversationListItem) => {
      if (conv.id === currentConversationId) return;
      navigate({
        to: "/agents/$agentId/conversations/$conversationId",
        params: { agentId, conversationId: conv.id },
      });
    },
    [navigate, agentId, currentConversationId],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation();
      if (confirm("确认删除此对话？")) {
        deleteMutation.mutate(conversationId, {
          onSuccess: () => {
            if (conversationId === currentConversationId) {
              handleNewConversation();
            }
          },
        });
      }
    },
    [deleteMutation, currentConversationId, handleNewConversation],
  );

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-xl transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-2 py-2">
        {!collapsed && (
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            <MessageSquarePlus className="h-4 w-4" />
            新建
          </button>
        )}
        {collapsed && (
          <button
            onClick={handleNewConversation}
            className="mx-auto flex items-center justify-center rounded-md p-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
            title="新建对话"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        )}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="rounded-md p-1.5 text-foreground/60 hover:bg-accent hover:text-foreground"
            title="收起侧边栏"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          </div>
        ) : conversations.length === 0 ? (
          !collapsed && (
            <p className="p-4 text-center text-xs text-foreground/40">
              暂无对话
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-0.5 p-1">
            {conversations.map((conv) => {
              const isActive = conv.id === currentConversationId;
              const emoji = extractEmoji(conv.title);

              if (collapsed) {
                return (
                  <li key={conv.id}>
                    <button
                      onClick={() => handleSelect(conv)}
                      className={`flex w-full items-center justify-center rounded-md p-2 text-lg transition-colors ${
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-foreground/60 hover:bg-accent/50 hover:text-foreground"
                      }`}
                      title={conv.title ?? "未命名"}
                    >
                      {emoji}
                    </button>
                  </li>
                );
              }

              return (
                <li key={conv.id} className="group relative">
                  <button
                    onClick={() => handleSelect(conv)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-10 text-left transition-colors ${
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-foreground/70 hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <span className="shrink-0 text-base">{emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {extractText(conv.title)}
                      </p>
                      <p className="text-xs text-foreground/40">
                        {formatTime(conv.updatedAt)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="absolute right-2 top-1/2 shrink-0 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Expand button (collapsed state) */}
      {collapsed && (
        <div className="border-t border-border p-2">
          <button
            onClick={toggleCollapsed}
            className="mx-auto flex items-center justify-center rounded-md p-1.5 text-foreground/60 hover:bg-accent hover:text-foreground"
            title="展开侧边栏"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
});
