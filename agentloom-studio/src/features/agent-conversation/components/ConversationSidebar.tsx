import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  MessagesSquare,
  Trash2,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { DUR, EASE, staggerList } from "@/shared/lib/motion";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import { useMediaQuery } from "@/shared/hooks/use-media-query";

import { useTitleUpdateCounter } from "../stores/agent-conversation.store";
import { conversationKeys } from "../api/conversationKeys";
import { useConversationList } from "../api/conversationQueries";
import { useDeleteConversation } from "../api/conversationMutations";
import type { ConversationListItem } from "../api/conversationApi";

const STORAGE_KEY = "agentloom-conv-sidebar-collapsed";

/** 侧栏在 md 以下强制收起为图标轨道，保证 375px 下正文仍有可用宽度 */
const SIDEBAR_EXPAND_QUERY = "(min-width: 768px)";

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

function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2" data-testid="conversation-list-skeleton">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-2.5 w-10 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ConversationSidebarProps {
  agentId: string;
  currentConversationId?: string | null;
}

export const ConversationSidebar = memo(function ConversationSidebar({
  agentId,
  currentConversationId,
}: ConversationSidebarProps) {
  const [userCollapsed, setUserCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const canExpand = useMediaQuery(SIDEBAR_EXPAND_QUERY);
  const collapsed = userCollapsed || !canExpand;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const titleUpdateCounter = useTitleUpdateCounter();
  const { data, isLoading, isError, error } = useConversationList(agentId, {
    limit: 50,
  });
  const deleteMutation = useDeleteConversation(agentId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const conversations = data?.data ?? [];

  // 当 Socket.IO 推送标题更新时，刷新对话列表
  useEffect(() => {
    if (titleUpdateCounter > 0) {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.lists(),
      });
    }
  }, [titleUpdateCounter, queryClient]);

  // 列表加载失败走 toast，侧栏本身保持可用（仍可新建对话）
  useEffect(() => {
    if (!isError) {
      return;
    }

    notify({
      title: "对话列表加载失败",
      description:
        error instanceof Error ? error.message : "请稍后重试或刷新页面。",
      variant: "error",
    });
  }, [error, isError, notify]);

  const toggleCollapsed = useCallback(() => {
    setUserCollapsed((prev) => {
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

  const handleConfirmDelete = useCallback(() => {
    const conversationId = pendingDeleteId;
    if (!conversationId) {
      return;
    }

    setPendingDeleteId(null);
    deleteMutation.mutate(conversationId, {
      onSuccess: () => {
        if (conversationId === currentConversationId) {
          handleNewConversation();
        }
      },
      onError: (cause) => {
        notify({
          title: "删除失败",
          description:
            cause instanceof Error ? cause.message : "删除对话失败，请稍后重试。",
          variant: "error",
        });
      },
    });
  }, [
    currentConversationId,
    deleteMutation,
    handleNewConversation,
    notify,
    pendingDeleteId,
  ]);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200",
        collapsed ? "w-14" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleNewConversation}
            className="mx-auto text-muted-foreground"
            title="新建对话"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="flex-1 justify-start text-foreground"
            >
              <MessageSquarePlus className="h-4 w-4" />
              新建
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              className="text-muted-foreground"
              title="收起侧边栏"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          collapsed ? (
            <div className="flex flex-col gap-1 p-2">
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-8 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <ConversationListSkeleton />
          )
        ) : conversations.length === 0 ? (
          collapsed ? null : (
            <EmptyState
              className="mx-2 mt-4 gap-2 border-0 px-3 py-8"
              icon={MessagesSquare}
              title="暂无对话"
              description="从「新建」开始第一次对话。"
              action={
                <Button variant="secondary" size="sm" onClick={handleNewConversation}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  新建对话
                </Button>
              }
            />
          )
        ) : (
          <ul className="flex flex-col gap-0.5 p-2">
            {conversations.map((conv, index) => {
              const isActive = conv.id === currentConversationId;
              const emoji = extractEmoji(conv.title);

              if (collapsed) {
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(conv)}
                      className={cn(
                        "flex w-full items-center justify-center rounded-md p-2 text-lg transition-colors",
                        isActive
                          ? "bg-primary/12"
                          : "hover:bg-surface-elevated",
                      )}
                      title={conv.title ?? "未命名"}
                    >
                      {emoji}
                    </button>
                  </li>
                );
              }

              return (
                <motion.li
                  key={conv.id}
                  {...staggerList(index)}
                  className="group relative"
                >
                  {isActive ? (
                    <motion.span
                      aria-hidden
                      layoutId="conversation-active-indicator"
                      transition={{ duration: DUR.fast, ease: EASE }}
                      className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleSelect(conv)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md py-1.5 pr-9 pl-2.5 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-surface-elevated",
                    )}
                  >
                    <span className="shrink-0 text-base">{emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {extractText(conv.title)}
                      </p>
                      <p
                        className={cn(
                          "text-[11px]",
                          isActive ? "text-primary/70" : "text-muted-foreground",
                        )}
                      >
                        {formatTime(conv.updatedAt)}
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDeleteId(conv.id)}
                    className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity hover:bg-error/10 hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
                    title="删除"
                    aria-label={`删除对话 ${extractText(conv.title)}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Expand button (collapsed state) */}
      {collapsed && canExpand && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            className="mx-auto text-muted-foreground"
            title="展开侧边栏"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除此对话？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后该对话的消息记录将无法恢复。
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error hover:bg-error/90"
              onClick={handleConfirmDelete}
            >
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
});
