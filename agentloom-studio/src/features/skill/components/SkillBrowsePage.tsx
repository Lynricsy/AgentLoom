import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "motion/react";
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
  AlertCircle,
} from "lucide-react";
import { convertResourceSourceToManual } from "@/shared/api/resourceSourceApi";
import {
  getResourceSourceLabel,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { staggerList } from "@/shared/lib/motion";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { PageHeader } from "@/shared/components/page-header/PageHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import { Pagination, ResourceSourceCategoryTabs } from "@/shared/components";
import { useToast } from "@/shared/ui/toast";
import {
  useSkillList,
  useDeleteSkill,
  useArchiveSkill,
} from "../api/skillQueries";
import { formatSkillBytes, formatSkillTimestamp } from "../lib/format";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { SkillDetailDialog } from "./SkillDetailDialog";
import type { Skill, SkillStatus } from "../types";
import type { ListSkillsParams } from "../api/skillApi";

const PAGE_SIZE = 20;

const SKILL_TONE = "var(--color-type-skill)";

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
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${skill.name} 的更多操作`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
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
  const { notify } = useToast();
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

  useEffect(() => {
    if (!isError) return;
    notify({
      title: "技能列表加载失败",
      description: "请检查网络后重试。",
      variant: "error",
    });
  }, [isError, notify]);

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
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader
        icon={Zap}
        tone={SKILL_TONE}
        title="技能管理"
        description="管理 Agent 可使用的技能，包括内置技能和自定义技能"
        actions={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建技能
          </Button>
        }
      />

      <ResourceSourceCategoryTabs
        value={sourceKindFilter}
        onChange={handleSourceKindChange}
      />

      {/* 筛选行 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索技能名称或描述..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="sm:w-32" aria-label="状态筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">活跃</SelectItem>
              <SelectItem value="archived">已归档</SelectItem>
            </SelectContent>
          </Select>
          <Select value={builtinFilter} onValueChange={handleBuiltinChange}>
            <SelectTrigger className="sm:w-32" aria-label="类型筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="builtin">内置技能</SelectItem>
              <SelectItem value="custom">自定义技能</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 列表内容 */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          tone="var(--color-error)"
          title="技能列表加载失败"
          description="请稍后重试，或检查后端服务是否可用。"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              重新加载
            </Button>
          }
        />
      ) : skills.length === 0 ? (
        <EmptyState
          icon={Zap}
          tone={SKILL_TONE}
          title={
            hasListFilters
              ? "没有匹配的技能"
              : sourceKindFilter === "manual"
                ? "还没有自己创建的技能，点击右上角新建"
                : `还没有${getResourceSourceLabel(sourceKindFilter)}的技能`
          }
          description={
            hasListFilters
              ? "换个关键词，或放宽状态与类型筛选。"
              : "技能是可复用的提示词与文件包，Agent 会按需加载。"
          }
          action={
            hasListFilters ? null : (
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                创建第一个技能
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill, index) => (
              <motion.div key={skill.id} {...staggerList(index)}>
                <Card className="h-full p-5">
                  <article className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${SKILL_TONE} 14%, transparent)`,
                              color: SKILL_TONE,
                            }}
                          >
                            <Zap className="h-4 w-4" />
                          </span>
                          <button
                            type="button"
                            className="cursor-pointer truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                            onClick={() => handleView(skill)}
                          >
                            {skill.name}
                          </button>
                          {skill.isBuiltin && (
                            <Badge size="sm" variant="info">
                              <ShieldCheck className="h-3 w-3" />
                              内置
                            </Badge>
                          )}
                          <Badge
                            size="sm"
                            variant={
                              skill.status === "active" ? "success" : "warning"
                            }
                          >
                            {skill.status === "active" ? "活跃" : "已归档"}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted">
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

                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {skill.fileCount} 个文件
                        {skill.totalSizeBytes > 0 && (
                          <span className="opacity-70">
                            ({formatSkillBytes(skill.totalSizeBytes)})
                          </span>
                        )}
                      </span>
                      <span>更新于 {formatSkillTimestamp(skill.updatedAt)}</span>
                    </div>
                  </article>
                </Card>
              </motion.div>
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
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除技能「{confirmDelete?.name}」吗？此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
