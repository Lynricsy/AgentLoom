import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  FolderSync,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ResourceSourceCategoryTabs } from "@/shared/components";
import { EntityIcon } from "@/shared/components/entity-icon";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { staggerList } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { useToast } from "@/shared/ui/toast";
import { formatRelativeTime } from "@/features/canvas";
import { useAgentList } from "../api/agentQueries";
import { useDeleteAgent } from "../api/agentMutations";
import { useAgentStore } from "../stores/agentStore";
import { CreateOrchestrationDialog } from "./CreateOrchestrationDialog";
import type { AgentDefinitionSummary, AgentStatus } from "../types";

type ViewMode = "grid" | "list";

/** Radix Select 不接受空串 value，用哨兵值表示「不过滤」 */
const ANY_STATUS = "__any__";

const STATUS_OPTIONS = [
  { value: ANY_STATUS, label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
] as const;

/** Agent 列表统一使用 agent 类别色，与画布 agent 节点同源 */
const AGENT_TONE = "var(--color-node-agent)";

type StatusVariant = "success" | "secondary" | "warning";

function getStatusVariant(status: AgentStatus): StatusVariant {
  switch (status) {
    case "published":
      return "success";
    case "archived":
      return "secondary";
    default:
      return "warning";
  }
}

function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case "published":
      return "已发布";
    case "archived":
      return "已归档";
    default:
      return "草稿";
  }
}

/** 已发布 Agent 展示发布版本号；未发布只有草稿快照 */
function getAgentReleaseLabel(agent: AgentDefinitionSummary): string {
  if (agent.status !== "published") {
    return "快照";
  }

  return `v${String(agent.version)}`;
}

interface AgentRowActionsProps {
  agent: AgentDefinitionSummary;
  onEdit: (agent: AgentDefinitionSummary) => void;
  onDelete: (agent: AgentDefinitionSummary) => void;
  onConvertSource: (agent: AgentDefinitionSummary) => void;
}

/** hover 快捷操作：编排编辑常驻按钮 + 低频项收进菜单 */
const AgentRowActions = memo(function AgentRowActions({
  agent,
  onEdit,
  onDelete,
  onConvertSource,
}: AgentRowActionsProps) {
  const sourceKind = agent.resourceSourceKind ?? "manual";

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`编辑 ${agent.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(agent);
        }}
      >
        <Edit3 className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`更多操作 ${agent.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sourceKind === "share_imported" ? (
            <>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onConvertSource(agent);
                }}
              >
                <FolderSync className="h-4 w-4" />
                转为自己创建
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            destructive
            onClick={(event) => {
              event.stopPropagation();
              onDelete(agent);
            }}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

interface AgentCardProps {
  agent: AgentDefinitionSummary;
  selected: boolean;
  batchMode: boolean;
  onSelect: (id: string) => void;
  onClick: (agent: AgentDefinitionSummary) => void;
  onEdit: (agent: AgentDefinitionSummary) => void;
  onDelete: (agent: AgentDefinitionSummary) => void;
  onConvertSource: (agent: AgentDefinitionSummary) => void;
}

const AgentCard = memo(function AgentCard({
  agent,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onDelete,
  onConvertSource,
}: AgentCardProps) {
  return (
    <Card
      interactive
      className={cn(
        "group relative flex h-full flex-col gap-3 p-4",
        selected && "border-primary shadow-node-selected",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-card"
          style={{
            backgroundColor: `color-mix(in srgb, ${AGENT_TONE} 14%, transparent)`,
            color: AGENT_TONE,
          }}
        >
          <EntityIcon icon={agent.icon} fallback={Bot} size={20} />
        </span>

        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(agent.status)}>
            {getStatusLabel(agent.status)}
          </Badge>
          <span
            className={cn(
              "z-10 transition-opacity",
              batchMode
                ? "opacity-100"
                : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
            )}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(agent.id)}
              aria-label={`选择 ${agent.name}`}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {/* 标题按钮拉伸覆盖整张卡片，保证唯一可访问名同时整卡可点 */}
          <button
            type="button"
            className="max-w-full truncate rounded-sm after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={() => onClick(agent)}
          >
            {agent.name}
          </button>
        </h3>
        <p className="line-clamp-2 text-xs text-muted">
          {agent.description || "暂无描述"}
        </p>
      </div>

      <div className="flex h-8 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 truncate text-xs text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            {formatRelativeTime(new Date(agent.updatedAt))}
          </span>
          <Badge variant="outline" size="sm">
            {getAgentReleaseLabel(agent)}
          </Badge>
        </span>

        <span className="relative z-10 shrink-0">
          <AgentRowActions
            agent={agent}
            onEdit={onEdit}
            onDelete={onDelete}
            onConvertSource={onConvertSource}
          />
        </span>
      </div>
    </Card>
  );
});

type AgentListItemProps = AgentCardProps;

const AgentListItem = memo(function AgentListItem({
  agent,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onDelete,
  onConvertSource,
}: AgentListItemProps) {
  return (
    <Card
      interactive
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3",
        selected && "border-primary shadow-node-selected",
      )}
    >
      <span
        className={cn(
          "z-10 shrink-0 transition-opacity",
          batchMode
            ? "opacity-100"
            : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(agent.id)}
          aria-label={`选择 ${agent.name}`}
          onClick={(event) => event.stopPropagation()}
        />
      </span>

      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
        style={{
          backgroundColor: `color-mix(in srgb, ${AGENT_TONE} 14%, transparent)`,
          color: AGENT_TONE,
        }}
      >
        <EntityIcon icon={agent.icon} fallback={Bot} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
            <button
              type="button"
              className="max-w-full truncate rounded-sm after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => onClick(agent)}
            >
              {agent.name}
            </button>
          </h3>
          <Badge variant="outline" size="sm">
            {getAgentReleaseLabel(agent)}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {agent.description || "暂无描述"}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <Badge variant={getStatusVariant(agent.status)}>
          {getStatusLabel(agent.status)}
        </Badge>
        <span className="hidden items-center gap-1 text-xs text-muted lg:flex">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(new Date(agent.updatedAt))}
        </span>
      </div>

      <div className="relative z-10 shrink-0">
        <AgentRowActions
          agent={agent}
          onEdit={onEdit}
          onDelete={onDelete}
          onConvertSource={onConvertSource}
        />
      </div>
    </Card>
  );
});

function AgentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-card" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-4 w-3/5 rounded" />
      <Skeleton className="h-3 w-full rounded" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
      </div>
    </Card>
  );
}

export function AgentListPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const filters = useAgentStore((s) => s.filters);
  const setFilters = useAgentStore((s) => s.setFilters);
  const setPage = useAgentStore((s) => s.setPage);
  const selectedAgentIds = useAgentStore((s) => s.selectedAgentIds);
  const toggleAgentSelection = useAgentStore((s) => s.toggleAgentSelection);
  const selectAllAgents = useAgentStore((s) => s.selectAllAgents);
  const clearAgentSelection = useAgentStore((s) => s.clearAgentSelection);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState(filters.search);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentDefinitionSummary | null>(
    null,
  );

  const deleteAgent = useDeleteAgent();

  const { data, isLoading, isError, refetch } = useAgentList({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
    sourceKind: filters.sourceKind,
  });

  const agents = useMemo(() => data?.data ?? [], [data?.data]);
  const meta = data?.meta;

  const batchMode = selectedAgentIds.size > 0;

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "加载失败",
      description: "Agent 列表拉取失败，请稍后重试",
      variant: "error",
    });
  }, [isError, notify]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      setFilters({ search: value });
    },
    [setFilters],
  );

  const handleStatusFilter = useCallback(
    (value: string) => {
      setFilters({ status: value === ANY_STATUS ? "" : value });
    },
    [setFilters],
  );

  const handleSourceKindChange = useCallback(
    (value: ResourceSourceKind) => {
      setFilters({ sourceKind: value });
    },
    [setFilters],
  );

  const handleAgentClick = useCallback(
    (agent: AgentDefinitionSummary) => {
      navigate({
        to: "/agents/$agentId/conversations/new",
        params: { agentId: agent.id },
      });
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (agent: AgentDefinitionSummary) => {
      navigate({ to: "/agents/$agentId", params: { agentId: agent.id } });
    },
    [navigate],
  );

  const handleDelete = useCallback((agent: AgentDefinitionSummary) => {
    setDeleteTarget(agent);
  }, []);

  const handleConvertSource = useCallback(
    async (agent: AgentDefinitionSummary) => {
      try {
        await convertResourceSourceToManual("agent_definition", agent.id);
        notify({ description: "已转为自己创建", variant: "success" });
        await refetch();
      } catch {
        notify({
          title: "转换失败",
          description: "请稍后重试",
          variant: "error",
        });
      }
    },
    [notify, refetch],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteAgent.mutateAsync(deleteTarget.id);
      notify({ description: "Agent 已删除", variant: "success" });
      setDeleteTarget(null);
    } catch {
      notify({
        title: "删除失败",
        description: "请稍后重试",
        variant: "error",
      });
    }
  }, [deleteTarget, deleteAgent, notify]);

  const handleSelectAll = useCallback(() => {
    if (selectedAgentIds.size === agents.length) {
      clearAgentSelection();
    } else {
      selectAllAgents(agents.map((a) => a.id));
    }
  }, [clearAgentSelection, selectAllAgents, selectedAgentIds.size, agents]);

  const handlePrevPage = useCallback(() => {
    if (filters.page > 1) {
      setPage(filters.page - 1);
    }
  }, [filters.page, setPage]);

  const handleNextPage = useCallback(() => {
    if (meta && filters.page < meta.totalPages) {
      setPage(filters.page + 1);
    }
  }, [filters.page, meta, setPage]);

  const isFiltered = Boolean(filters.search || filters.status);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <PageHeader
          title="Agent"
          description="管理和配置你的智能体"
          icon={Bot}
          tone={AGENT_TONE}
          actions={
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              新建
            </Button>
          }
        />

        <div className="mt-4">
          <ResourceSourceCategoryTabs
            value={filters.sourceKind}
            onChange={handleSourceKindChange}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="搜索 Agent..."
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              aria-label="搜索 Agent"
            />
          </div>

          <Select
            value={filters.status || ANY_STATUS}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="w-36" aria-label="状态筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("grid")}
              aria-label="网格视图"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("list")}
              aria-label="列表视图"
              aria-pressed={viewMode === "list"}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {batchMode && (
          <div className="mt-3 flex items-center gap-3 rounded-card bg-primary/5 px-3 py-2">
            <Checkbox
              checked={
                selectedAgentIds.size === agents.length
                  ? true
                  : selectedAgentIds.size > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={handleSelectAll}
              aria-label="全选"
            />
            <span className="text-sm text-foreground">
              已选择 {selectedAgentIds.size} 项
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={clearAgentSelection}>
              <X className="h-3.5 w-3.5" />
              取消选择
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <AgentCardSkeleton key={`skeleton-${String(i)}`} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            icon={isFiltered ? Search : MessageSquare}
            tone={AGENT_TONE}
            title={
              isFiltered
                ? "没有找到匹配的 Agent"
                : `还没有${getResourceSourceLabel(filters.sourceKind)}的 Agent`
            }
            description={
              isFiltered
                ? "换个关键词或状态筛选试试"
                : "Agent 把模型、工具与记忆编排成可对话的智能体"
            }
            action={
              !isFiltered && filters.sourceKind === "manual" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  创建第一个 Agent
                </Button>
              ) : null
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent, i) => (
              <motion.div key={agent.id} {...staggerList(i)}>
                <AgentCard
                  agent={agent}
                  selected={selectedAgentIds.has(agent.id)}
                  batchMode={batchMode}
                  onSelect={toggleAgentSelection}
                  onClick={handleAgentClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onConvertSource={handleConvertSource}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent, i) => (
              <motion.div key={agent.id} {...staggerList(i)}>
                <AgentListItem
                  agent={agent}
                  selected={selectedAgentIds.has(agent.id)}
                  batchMode={batchMode}
                  onSelect={toggleAgentSelection}
                  onClick={handleAgentClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onConvertSource={handleConvertSource}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
          <span className="text-xs text-muted">
            {meta.total} 个 Agent, 第 {meta.page}/{meta.totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handlePrevPage}
              disabled={filters.page <= 1}
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNextPage}
              disabled={filters.page >= meta.totalPages}
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CreateOrchestrationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 Agent &ldquo;{deleteTarget?.name}&rdquo;
            吗？此操作不可撤销，所有关联数据将被永久移除。
          </AlertDialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-error text-white hover:bg-error/90"
              onClick={handleConfirmDelete}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
