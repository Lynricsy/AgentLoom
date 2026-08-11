import { useState, useCallback, useMemo } from "react";
import {
  Search,
  Plus,
  Zap,
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  Eye,
  Loader2,
  FolderSync,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { NativeSelect } from "@/shared/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import {
  useSkillList,
  useDeleteSkill,
  useArchiveSkill,
} from "../api/skillQueries";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { SkillDetailDialog } from "./SkillDetailDialog";
import type { Skill, SkillStatus } from "../types";
import type { ListSkillsParams } from "../api/skillApi";

const PAGE_SIZE = 20;

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
        活跃
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-medium text-yellow-500">
      已归档
    </span>
  );
}

function BuiltinBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-400">
      <ShieldCheck className="h-3 w-3" />
      内置
    </span>
  );
}

interface SkillCardActionsProps {
  skill: Skill;
  onView: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onArchive: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onConvertSource: (skill: Skill) => void;
}

function SkillCardActions({
  skill,
  onView,
  onEdit,
  onArchive,
  onDelete,
  onConvertSource,
}: SkillCardActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => onView(skill)}>
          <Eye className="h-3.5 w-3.5" />
          查看详情
        </DropdownMenuItem>
        {!skill.isBuiltin && (
          <>
            <DropdownMenuItem onClick={() => onEdit(skill)}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </DropdownMenuItem>
            {skill.sourceKind === "share_imported" && (
              <DropdownMenuItem onClick={() => onConvertSource(skill)}>
                <FolderSync className="h-3.5 w-3.5" />
                转为自己创建
              </DropdownMenuItem>
            )}
            {skill.status === "active" && (
              <DropdownMenuItem onClick={() => onArchive(skill)}>
                <Archive className="h-3.5 w-3.5" />
                归档
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => onDelete(skill)}>
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkillBrowsePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [builtinFilter, setBuiltinFilter] = useState<string>("all");
  const [sourceKindFilter, setSourceKindFilter] =
    useState<ResourceSourceKind>("manual");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Skill | null>(null);

  const deleteMutation = useDeleteSkill();
  const archiveMutation = useArchiveSkill();

  const params = useMemo<ListSkillsParams>(() => {
    const p: ListSkillsParams = { page, pageSize: PAGE_SIZE };
    if (search.trim()) p.search = search.trim();
    if (statusFilter !== "all") p.status = statusFilter as SkillStatus;
    if (builtinFilter !== "all") p.isBuiltin = builtinFilter === "builtin";
    p.sourceKind = sourceKindFilter;
    return p;
  }, [page, search, statusFilter, builtinFilter, sourceKindFilter]);

  const { data, isLoading, isError, refetch } = useSkillList(params);
  const skills = data?.data ?? [];
  const meta = data?.meta;

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleBuiltinChange = useCallback((value: string) => {
    setBuiltinFilter(value);
    setPage(1);
  }, []);

  const handleSourceKindChange = useCallback((value: ResourceSourceKind) => {
    setSourceKindFilter(value);
    setPage(1);
  }, []);

  const hasListFilters =
    search.trim() !== "" || statusFilter !== "all" || builtinFilter !== "all";

  const handleView = useCallback((skill: Skill) => {
    setViewingSkill(skill);
  }, []);

  const handleEdit = useCallback((skill: Skill) => {
    setEditingSkill(skill);
  }, []);

  const handleArchive = useCallback(
    (skill: Skill) => {
      archiveMutation.mutate(skill.id);
    },
    [archiveMutation],
  );

  const handleDelete = useCallback((skill: Skill) => {
    setConfirmDelete(skill);
  }, []);

  const handleConvertSource = useCallback(
    async (skill: Skill) => {
      try {
        await convertResourceSourceToManual("skill", skill.id);
        await refetch();
      } catch {
        // noop
      }
    },
    [refetch],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => setConfirmDelete(null),
    });
  }, [confirmDelete, deleteMutation]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">技能管理</h1>
          <p className="text-sm text-muted-foreground">
            管理 Agent 可使用的技能，包括内置技能和自定义技能
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          新建技能
        </Button>
      </div>

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={handleSourceKindChange}
      />

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索技能名称或描述..."
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={statusFilter}
          onValueChange={handleStatusChange}
          className="w-32"
        >
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </NativeSelect>
        <NativeSelect
          value={builtinFilter}
          onValueChange={handleBuiltinChange}
          className="w-32"
        >
          <option value="all">全部类型</option>
          <option value="builtin">内置技能</option>
          <option value="custom">自定义技能</option>
        </NativeSelect>
      </div>

      {/* 列表内容 */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
          <Zap className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium">技能列表加载失败</p>
          <p className="text-sm text-muted-foreground">请稍后重试</p>
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
        </div>
      ) : skills.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20">
          <Zap className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {hasListFilters
              ? "没有匹配的技能"
              : sourceKindFilter === "manual"
                ? "还没有自己创建的技能，点击右上角新建"
                : `还没有${getResourceSourceLabel(sourceKindFilter)}的技能`}
          </p>
        </div>
      ) : (
        <>
          {/* 卡片列表 */}
          <div className="grid gap-4 xl:grid-cols-2">
            {skills.map((skill) => (
              <article
                key={skill.id}
                className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-colors hover:border-border/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Zap className="h-4 w-4" />
                      </div>
                      <button
                        type="button"
                        className="cursor-pointer truncate text-sm font-semibold text-foreground hover:text-primary"
                        onClick={() => handleView(skill)}
                      >
                        {skill.name}
                      </button>
                      {skill.isBuiltin && <BuiltinBadge />}
                      <StatusBadge status={skill.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {skill.description || "暂无描述"}
                    </p>
                  </div>
                  <SkillCardActions
                    skill={skill}
                    onView={handleView}
                    onEdit={handleEdit}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onConvertSource={handleConvertSource}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {skill.fileCount} 个文件
                    {skill.totalSizeBytes > 0 && (
                      <span className="text-muted-foreground/60">
                        ({formatBytes(skill.totalSizeBytes)})
                      </span>
                    )}
                  </span>
                  <span>更新于 {formatTimestamp(skill.updatedAt)}</span>
                </div>
              </article>
            ))}
          </div>

          {/* 分页 */}
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      {/* 新建/编辑对话框 */}
      <CreateSkillDialog
        open={createDialogOpen || editingSkill !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditingSkill(null);
          }
        }}
        skill={editingSkill}
      />

      {/* 详情对话框 */}
      <SkillDetailDialog
        skill={viewingSkill}
        open={viewingSkill !== null}
        onOpenChange={(open) => {
          if (!open) setViewingSkill(null);
        }}
      />

      {/* 删除确认对话框 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">确认删除</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              确定要删除技能「{confirmDelete.name}」吗？此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
