import { useState, useCallback, useMemo } from 'react';
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
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Pagination } from '@/shared/components';
import { useSkillList, useDeleteSkill, useArchiveSkill } from '../api/skillQueries';
import { CreateSkillDialog } from './CreateSkillDialog';
import { SkillDetailDialog } from './SkillDetailDialog';
import type { Skill, SkillStatus } from '../types';
import type { ListSkillsParams } from '../api/skillApi';

const PAGE_SIZE = 20;

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function StatusBadge({ status }: { status: SkillStatus }) {
  if (status === 'active') {
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

interface SkillRowActionsProps {
  skill: Skill;
  onView: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onArchive: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

function SkillRowActions({
  skill,
  onView,
  onEdit,
  onArchive,
  onDelete,
}: SkillRowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-card py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => { onView(skill); setOpen(false); }}
            >
              <Eye className="h-3.5 w-3.5" />
              查看详情
            </button>
            {!skill.isBuiltin && (
              <>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => { onEdit(skill); setOpen(false); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                {skill.status === 'active' && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => { onArchive(skill); setOpen(false); }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    归档
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-red-400 transition-colors hover:bg-red-500/10"
                  onClick={() => { onDelete(skill); setOpen(false); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function SkillBrowsePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [builtinFilter, setBuiltinFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Skill | null>(null);

  const deleteMutation = useDeleteSkill();
  const archiveMutation = useArchiveSkill();

  const params = useMemo<ListSkillsParams>(() => {
    const p: ListSkillsParams = { page, pageSize: PAGE_SIZE };
    if (search.trim()) p.search = search.trim();
    if (statusFilter !== 'all') p.status = statusFilter as SkillStatus;
    if (builtinFilter !== 'all') p.isBuiltin = builtinFilter === 'builtin';
    return p;
  }, [page, search, statusFilter, builtinFilter]);

  const { data, isLoading, isError, refetch } = useSkillList(params);
  const skills = data?.data ?? [];
  const meta = data?.meta;

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
    },
    [],
  );

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleBuiltinChange = useCallback((value: string) => {
    setBuiltinFilter(value);
    setPage(1);
  }, []);

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
        <Select
          value={statusFilter}
          onValueChange={handleStatusChange}
          className="w-32"
        >
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </Select>
        <Select
          value={builtinFilter}
          onValueChange={handleBuiltinChange}
          className="w-32"
        >
          <option value="all">全部类型</option>
          <option value="builtin">内置技能</option>
          <option value="custom">自定义技能</option>
        </Select>
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
            {search || statusFilter !== 'all' || builtinFilter !== 'all'
              ? '没有匹配的技能'
              : '暂无技能，点击右上角新建'}
          </p>
        </div>
      ) : (
        <>
          {/* 表格 */}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">描述</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">文件</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground xl:table-cell">更新时间</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {skills.map((skill) => (
                  <tr
                    key={skill.id}
                    className="border-b border-border/60 transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                          <Zap className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="cursor-pointer truncate text-sm font-medium text-foreground hover:text-primary"
                            onClick={() => handleView(skill)}
                          >
                            {skill.name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {skill.isBuiltin && <BuiltinBadge />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {skill.description || '暂无描述'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={skill.status} />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{skill.fileCount} 个</span>
                        {skill.totalSizeBytes > 0 && (
                          <span className="text-muted-foreground/60">
                            ({formatBytes(skill.totalSizeBytes)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(skill.updatedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SkillRowActions
                        skill={skill}
                        onView={handleView}
                        onEdit={handleEdit}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
