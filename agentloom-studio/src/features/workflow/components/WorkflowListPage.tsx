import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Workflow,
  X,
} from 'lucide-react'
import { EntityIcon } from '@/shared/components/entity-icon'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useToast } from '@/shared/ui/toast'
import { formatRelativeTime } from '@/features/canvas'
import { useExportWorkflow } from '../api/workflowMutations'
import { useWorkflowList } from '../api/workflowQueries'
import { downloadWorkflowExport } from '../lib/workflowExportImport'
import { useWorkflowStore } from '../stores/workflowStore'
import { CreateWorkflowDialog } from './CreateWorkflowDialog'
import { ArchiveDialog } from './ArchiveDialog'
import type { WorkflowDefinition, WorkflowStatus } from '../types'

type ViewMode = 'grid' | 'list'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
] as const

function getStatusBadgeClasses(status: WorkflowStatus): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-500/10 text-emerald-500'
    case 'archived':
      return 'bg-gray-500/10 text-gray-400'
    default:
      return 'bg-amber-500/10 text-amber-500'
  }
}

function getStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case 'published':
      return '已发布'
    case 'archived':
      return '已归档'
    default:
      return '草稿'
  }
}

function getWorkflowReleaseLabel(workflow: WorkflowDefinition): string | null {
  if (workflow.status !== 'published') {
    return null
  }

  if (typeof workflow.publishedReleaseNumber === 'number') {
    return `v${workflow.publishedReleaseNumber}`
  }

  return 'v1'
}

interface WorkflowCardProps {
  workflow: WorkflowDefinition
  selected: boolean
  batchMode: boolean
  onSelect: (id: string) => void
  onClick: (workflow: WorkflowDefinition) => void
  onEdit: (workflow: WorkflowDefinition) => void
  onExport: (workflow: WorkflowDefinition) => void
  onArchive: (workflow: WorkflowDefinition) => void
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
}: WorkflowCardProps) {
  return (
    <div
      className={cn(
        'card-hover-lift group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 text-left',
        'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
        selected && 'border-primary/60 bg-primary/5',
      )}
    >
      {/* 选择框 */}
      <div
        className={cn(
          'absolute left-3 top-3 z-10 transition-opacity',
          batchMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(workflow.id)}
          aria-label={`选择 ${workflow.name}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* 更多操作 */}
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onEdit(workflow)
              }}
            >
              <Edit3 className="h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onExport(workflow)
              }}
            >
              <Download className="h-4 w-4" />
              导出
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={(e) => {
                e.stopPropagation()
                onArchive(workflow)
              }}
            >
              <Archive className="h-4 w-4" />
              归档
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        className="flex flex-1 flex-col gap-3 text-left focus-visible:outline-none"
        onClick={() => onClick(workflow)}
      >
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <EntityIcon icon={workflow.icon} fallback={Workflow} size={20} />
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              getStatusBadgeClasses(workflow.status),
            )}
          >
            {getStatusLabel(workflow.status)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{workflow.name}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {workflow.description || '暂无描述'}
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(workflow.updatedAt))}
          </span>
          {getWorkflowReleaseLabel(workflow) ? (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium">
              {getWorkflowReleaseLabel(workflow)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
              未发布
            </span>
          )}
        </div>
      </button>
    </div>
  )
})

interface WorkflowListItemProps {
  workflow: WorkflowDefinition
  selected: boolean
  batchMode: boolean
  onSelect: (id: string) => void
  onClick: (workflow: WorkflowDefinition) => void
  onEdit: (workflow: WorkflowDefinition) => void
  onExport: (workflow: WorkflowDefinition) => void
  onArchive: (workflow: WorkflowDefinition) => void
}

const WorkflowListItem = memo(function WorkflowListItem({
  workflow,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onExport,
  onArchive,
}: WorkflowListItemProps) {
  return (
    <div
      className={cn(
        'card-hover-lift group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3',
        selected && 'border-primary/60 bg-primary/5',
      )}
    >
      <div
        className={cn(
          'shrink-0 transition-opacity',
          batchMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(workflow.id)}
          aria-label={`选择 ${workflow.name}`}
        />
      </div>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline-none"
        onClick={() => onClick(workflow)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <EntityIcon icon={workflow.icon} fallback={Workflow} size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{workflow.name}</h3>
            {getWorkflowReleaseLabel(workflow) ? (
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {getWorkflowReleaseLabel(workflow)}
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                未发布
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {workflow.description || '暂无描述'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              getStatusBadgeClasses(workflow.status),
            )}
          >
            {getStatusLabel(workflow.status)}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(workflow.updatedAt))}
          </span>
        </div>
      </button>

      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(workflow)}>
              <Edit3 className="h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport(workflow)}>
              <Download className="h-4 w-4" />
              导出
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => onArchive(workflow)}>
              <Archive className="h-4 w-4" />
              归档
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})

function WorkflowCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="shimmer h-10 w-10 rounded-lg" />
        <div className="shimmer h-5 w-14 rounded-full" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="shimmer h-4 w-3/4" />
        <div className="shimmer h-3 w-full" />
      </div>
      <div className="mt-3 flex justify-between">
        <div className="shimmer h-3 w-20" />
        <div className="shimmer h-3 w-8" />
      </div>
    </div>
  )
}

export function WorkflowListPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const filters = useWorkflowStore((s) => s.filters)
  const setFilters = useWorkflowStore((s) => s.setFilters)
  const setPage = useWorkflowStore((s) => s.setPage)
  const selectedWorkflowIds = useWorkflowStore((s) => s.selectedWorkflowIds)
  const toggleSelection = useWorkflowStore((s) => s.toggleSelection)
  const selectAll = useWorkflowStore((s) => s.selectAll)
  const clearSelection = useWorkflowStore((s) => s.clearSelection)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchInput, setSearchInput] = useState(filters.search)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<WorkflowDefinition | null>(null)

  const exportWorkflow = useExportWorkflow()

  const { data, isLoading } = useWorkflowList({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
  })

  const workflows = useMemo(() => data?.data ?? [], [data?.data])
  const meta = data?.meta

  const batchMode = selectedWorkflowIds.size > 0

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInput(value)
      setFilters({ search: value })
    },
    [setFilters],
  )

  const handleStatusFilter = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setFilters({ status: event.target.value })
    },
    [setFilters],
  )

  const handleWorkflowClick = useCallback(
    (workflow: WorkflowDefinition) => {
      navigate({ to: '/workflows/$workflowId', params: { workflowId: workflow.id } })
    },
    [navigate],
  )

  const handleEdit = useCallback(
    (workflow: WorkflowDefinition) => {
      navigate({ to: '/workflows/$workflowId', params: { workflowId: workflow.id } })
    },
    [navigate],
  )

  const handleExport = useCallback(
    async (workflow: WorkflowDefinition) => {
      try {
        const data = await exportWorkflow.mutateAsync(workflow.id)
        downloadWorkflowExport(data, workflow.slug)
        notify({ description: '工作流导出成功', variant: 'success' })
      } catch {
        notify({ title: '导出失败', description: '请稍后重试', variant: 'error' })
      }
    },
    [exportWorkflow, notify],
  )

  const handleArchive = useCallback((workflow: WorkflowDefinition) => {
    setArchiveTarget(workflow)
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedWorkflowIds.size === workflows.length) {
      clearSelection()
    } else {
      selectAll(workflows.map((w) => w.id))
    }
  }, [clearSelection, selectAll, selectedWorkflowIds.size, workflows])

  const handlePrevPage = useCallback(() => {
    if (filters.page > 1) {
      setPage(filters.page - 1)
    }
  }, [filters.page, setPage])

  const handleNextPage = useCallback(() => {
    if (meta && filters.page < meta.totalPages) {
      setPage(filters.page + 1)
    }
  }, [filters.page, meta, setPage])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">工作流</h1>
            <p className="text-sm text-muted-foreground">管理和配置你的工作流</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索工作流..."
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <select
            value={filters.status}
            onChange={handleStatusFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                'rounded p-1.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setViewMode('grid')}
              aria-label="网格视图"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(
                'rounded p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setViewMode('list')}
              aria-label="列表视图"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 批量操作栏 */}
        {batchMode && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-primary/5 px-3 py-2">
            <Checkbox
              checked={
                selectedWorkflowIds.size === workflows.length
                  ? true
                  : selectedWorkflowIds.size > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={handleSelectAll}
              aria-label="全选"
            />
            <span className="text-sm text-foreground">
              已选择 {selectedWorkflowIds.size} 项
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              取消选择
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <WorkflowCardSkeleton key={`skeleton-${String(i)}`} />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Workflow className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              {filters.search || filters.status ? '没有找到匹配的工作流' : '还没有创建任何工作流'}
            </p>
            {!filters.search && !filters.status && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                创建第一个工作流
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
            {workflows.map((workflow, i) => (
              <div key={workflow.id} className="card-stagger-enter" style={{ animationDelay: `${i * 40}ms` }}>
                <WorkflowCard
                  workflow={workflow}
                  selected={selectedWorkflowIds.has(workflow.id)}
                  batchMode={batchMode}
                  onSelect={toggleSelection}
                  onClick={handleWorkflowClick}
                  onEdit={handleEdit}
                  onExport={handleExport}
                  onArchive={handleArchive}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workflows.map((workflow, i) => (
              <div key={workflow.id} className="card-stagger-enter" style={{ animationDelay: `${i * 30}ms` }}>
                <WorkflowListItem
                  workflow={workflow}
                  selected={selectedWorkflowIds.has(workflow.id)}
                  batchMode={batchMode}
                  onSelect={toggleSelection}
                  onClick={handleWorkflowClick}
                  onEdit={handleEdit}
                  onExport={handleExport}
                  onArchive={handleArchive}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {meta.total} 个工作流, 第 {meta.page}/{meta.totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              onClick={handlePrevPage}
              disabled={filters.page <= 1}
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              onClick={handleNextPage}
              disabled={filters.page >= meta.totalPages}
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
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
            if (!open) setArchiveTarget(null)
          }}
        />
      )}
    </div>
  )
}
