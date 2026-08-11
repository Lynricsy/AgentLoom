import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  FolderSync,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { ResourceSourceCategoryTabs } from "@/shared/components";
import { EntityIcon } from "@/shared/components/entity-icon";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
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
import { useToast } from "@/shared/ui/toast";
import { formatRelativeTime } from "@/features/canvas";
import { useExportWorkflow } from "../api/workflowMutations";
import { useWorkflowList } from "../api/workflowQueries";
import { downloadWorkflowExport } from "../lib/workflowExportImport";
import { useWorkflowStore } from "../stores/workflowStore";
import { CreateWorkflowDialog } from "./CreateWorkflowDialog";
import { ArchiveDialog } from "./ArchiveDialog";
import type { WorkflowDefinition, WorkflowStatus } from "../types";

type ViewMode = "grid" | "list";

/** Radix Select 不接受空串 value，用哨兵值表示「不过滤」 */
const ANY_STATUS = "__any__";

const STATUS_OPTIONS = [
  { value: ANY_STATUS, label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
] as const;

/** 工作流列表统一使用编排类别色，与画布 routing 节点同源 */
const WORKFLOW_TONE = "var(--color-node-routing)";

type StatusVariant = "success" | "secondary" | "warning";

function getStatusVariant(status: WorkflowStatus): StatusVariant {
  switch (status) {
    case "published":
      return "success";
    case "archived":
      return "secondary";
    default:
      return "warning";
  }
}

function getStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case "published":
      return "已发布";
    case "archived":
      return "已归档";
    default:
      return "草稿";
  }
}

/** 已发布工作流展示发布版本号；未发布只有草稿快照 */
function getWorkflowReleaseLabel(workflow: WorkflowDefinition): string {
  if (workflow.status !== "published") {
    return "快照";
  }

  return `v${String(workflow.publishedReleaseNumber ?? 1)}`;
}

interface WorkflowRowActionsProps {
  workflow: WorkflowDefinition;
  onEdit: (workflow: WorkflowDefinition) => void;
  onExport: (workflow: WorkflowDefinition) => void;
  onArchive: (workflow: WorkflowDefinition) => void;
  onConvertSource: (workflow: WorkflowDefinition) => void;
}

/** hover 快捷操作：编辑 / 导出常驻按钮 + 低频项收进菜单 */
const WorkflowRowActions = memo(function WorkflowRowActions({
  workflow,
  onEdit,
  onExport,
  onArchive,
  onConvertSource,
}: WorkflowRowActionsProps) {
  const sourceKind = workflow.resourceSourceKind ?? "manual";

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`编辑 ${workflow.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(workflow);
        }}
      >
        <Edit3 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`导出 ${workflow.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onExport(workflow);
        }}
      >
        <Download className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`更多操作 ${workflow.name}`}
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
                  onConvertSource(workflow);
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
              onArchive(workflow);
            }}
          >
            <Archive className="h-4 w-4" />
            归档
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

interface WorkflowCardProps {
  workflow: WorkflowDefinition;
  selected: boolean;
  batchMode: boolean;
  onSelect: (id: string) => void;
  onClick: (workflow: WorkflowDefinition) => void;
  onEdit: (workflow: WorkflowDefinition) => void;
  onExport: (workflow: WorkflowDefinition) => void;
  onArchive: (workflow: WorkflowDefinition) => void;
  onConvertSource: (workflow: WorkflowDefinition) => void;
}

const WorkflowCard = memo(function WorkflowCard({
  workflow,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onExport,
  onArchive,
  onConvertSource,
}: WorkflowCardProps) {
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
            backgroundColor: `color-mix(in srgb, ${WORKFLOW_TONE} 14%, transparent)`,
            color: WORKFLOW_TONE,
          }}
        >
          <EntityIcon icon={workflow.icon} fallback={Workflow} size={20} />
        </span>

        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(workflow.status)}>
            {getStatusLabel(workflow.status)}
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
              onCheckedChange={() => onSelect(workflow.id)}
              aria-label={`选择 ${workflow.name}`}
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
            onClick={() => onClick(workflow)}
          >
            {workflow.name}
          </button>
        </h3>
        <p className="line-clamp-2 text-xs text-muted">
          {workflow.description || "暂无描述"}
        </p>
      </div>

      <div className="flex h-8 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 truncate text-xs text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            {formatRelativeTime(new Date(workflow.updatedAt))}
          </span>
          <Badge variant="outline" size="sm">
            {getWorkflowReleaseLabel(workflow)}
          </Badge>
        </span>

        <span className="relative z-10 shrink-0">
          <WorkflowRowActions
            workflow={workflow}
            onEdit={onEdit}
            onExport={onExport}
            onArchive={onArchive}
            onConvertSource={onConvertSource}
          />
        </span>
      </div>
    </Card>
  );
});

type WorkflowListItemProps = WorkflowCardProps;

const WorkflowListItem = memo(function WorkflowListItem({
  workflow,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onExport,
  onArchive,
  onConvertSource,
}: WorkflowListItemProps) {
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
          onCheckedChange={() => onSelect(workflow.id)}
          aria-label={`选择 ${workflow.name}`}
          onClick={(event) => event.stopPropagation()}
        />
      </span>

      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-card"
        style={{
          backgroundColor: `color-mix(in srgb, ${WORKFLOW_TONE} 14%, transparent)`,
          color: WORKFLOW_TONE,
        }}
      >
        <EntityIcon icon={workflow.icon} fallback={Workflow} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
            <button
              type="button"
              className="max-w-full truncate rounded-sm after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => onClick(workflow)}
            >
              {workflow.name}
            </button>
          </h3>
          <Badge variant="outline" size="sm">
            {getWorkflowReleaseLabel(workflow)}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {workflow.description || "暂无描述"}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <Badge variant={getStatusVariant(workflow.status)}>
          {getStatusLabel(workflow.status)}
        </Badge>
        <span className="hidden items-center gap-1 text-xs text-muted lg:flex">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(new Date(workflow.updatedAt))}
        </span>
      </div>

      <div className="relative z-10 shrink-0">
        <WorkflowRowActions
          workflow={workflow}
          onEdit={onEdit}
          onExport={onExport}
          onArchive={onArchive}
          onConvertSource={onConvertSource}
        />
      </div>
    </Card>
  );
});

function WorkflowCardSkeleton() {
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

export function WorkflowListPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const filters = useWorkflowStore((s) => s.filters);
  const setFilters = useWorkflowStore((s) => s.setFilters);
  const setPage = useWorkflowStore((s) => s.setPage);
  const selectedWorkflowIds = useWorkflowStore((s) => s.selectedWorkflowIds);
  const toggleSelection = useWorkflowStore((s) => s.toggleSelection);
  const selectAll = useWorkflowStore((s) => s.selectAll);
  const clearSelection = useWorkflowStore((s) => s.clearSelection);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState(filters.search);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkflowDefinition | null>(
    null,
  );

  const exportWorkflow = useExportWorkflow();

  const { data, isLoading, isError, refetch } = useWorkflowList({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
    sourceKind: filters.sourceKind,
  });

  const workflows = useMemo(() => data?.data ?? [], [data?.data]);
  const meta = data?.meta;

  const batchMode = selectedWorkflowIds.size > 0;

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "加载失败",
      description: "工作流列表拉取失败，请稍后重试",
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

  const handleWorkflowClick = useCallback(
    (workflow: WorkflowDefinition) => {
      navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: workflow.id },
      });
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (workflow: WorkflowDefinition) => {
      navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: workflow.id },
      });
    },
    [navigate],
  );

  const handleExport = useCallback(
    async (workflow: WorkflowDefinition) => {
      try {
        const data = await exportWorkflow.mutateAsync(workflow.id);
        downloadWorkflowExport(data, workflow.slug);
        notify({ description: "工作流导出成功", variant: "success" });
      } catch {
        notify({
          title: "导出失败",
          description: "请稍后重试",
          variant: "error",
        });
      }
    },
    [exportWorkflow, notify],
  );

  const handleArchive = useCallback((workflow: WorkflowDefinition) => {
    setArchiveTarget(workflow);
  }, []);

  const handleConvertSource = useCallback(
    async (workflow: WorkflowDefinition) => {
      try {
        await convertResourceSourceToManual("workflow_definition", workflow.id);
        await refetch();
        notify({ description: "已转为自己创建", variant: "success" });
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

  const handleSelectAll = useCallback(() => {
    if (selectedWorkflowIds.size === workflows.length) {
      clearSelection();
    } else {
      selectAll(workflows.map((w) => w.id));
    }
  }, [clearSelection, selectAll, selectedWorkflowIds.size, workflows]);

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
          title="工作流"
          description="管理和配置你的工作流"
          icon={Workflow}
          tone={WORKFLOW_TONE}
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
              placeholder="搜索工作流..."
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
              aria-label="搜索工作流"
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
                selectedWorkflowIds.size === workflows.length
                  ? true
                  : selectedWorkflowIds.size > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={handleSelectAll}
              aria-label="全选"
            />
            <span className="text-sm text-foreground">
              已选择 {selectedWorkflowIds.size} 项
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={clearSelection}>
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
              <WorkflowCardSkeleton key={`skeleton-${String(i)}`} />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            tone={WORKFLOW_TONE}
            title={
              isFiltered
                ? "没有找到匹配的工作流"
                : `还没有${getResourceSourceLabel(filters.sourceKind)}的工作流`
            }
            description={
              isFiltered
                ? "换个关键词或状态筛选试试"
                : "工作流把触发器、模型与工具编排成一条可执行链路"
            }
            action={
              !isFiltered && filters.sourceKind === "manual" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  创建第一个工作流
                </Button>
              ) : null
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow, i) => (
              <motion.div key={workflow.id} {...staggerList(i)}>
                <WorkflowCard
                  workflow={workflow}
                  selected={selectedWorkflowIds.has(workflow.id)}
                  batchMode={batchMode}
                  onSelect={toggleSelection}
                  onClick={handleWorkflowClick}
                  onEdit={handleEdit}
                  onExport={handleExport}
                  onArchive={handleArchive}
                  onConvertSource={handleConvertSource}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workflows.map((workflow, i) => (
              <motion.div key={workflow.id} {...staggerList(i)}>
                <WorkflowListItem
                  workflow={workflow}
                  selected={selectedWorkflowIds.has(workflow.id)}
                  batchMode={batchMode}
                  onSelect={toggleSelection}
                  onClick={handleWorkflowClick}
                  onEdit={handleEdit}
                  onExport={handleExport}
                  onArchive={handleArchive}
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
            {meta.total} 个工作流, 第 {meta.page}/{meta.totalPages} 页
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

      <CreateWorkflowDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {archiveTarget && (
        <ArchiveDialog
          open
          workflowId={archiveTarget.id}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        />
      )}
    </div>
  );
}
