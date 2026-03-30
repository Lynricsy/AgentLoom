import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { useToast } from '@/shared/ui/toast'
import { formatRelativeTime } from '@/features/canvas'
import { useAgentList } from '../api/agentQueries'
import { useDeleteAgent } from '../api/agentMutations'
import { useAgentStore } from '../stores/agentStore'
import { CreateOrchestrationDialog } from './CreateOrchestrationDialog'
import type { AgentDefinition, AgentStatus } from '../types'

type ViewMode = 'grid' | 'list'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
] as const

function getStatusBadgeClasses(status: AgentStatus): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-500/10 text-emerald-500'
    case 'archived':
      return 'bg-gray-500/10 text-gray-400'
    default:
      return 'bg-amber-500/10 text-amber-500'
  }
}

function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'published':
      return '已发布'
    case 'archived':
      return '已归档'
    default:
      return '草稿'
  }
}

interface AgentCardProps {
  agent: AgentDefinition
  selected: boolean
  batchMode: boolean
  onSelect: (id: string) => void
  onClick: (agent: AgentDefinition) => void
  onEdit: (agent: AgentDefinition) => void
  onDelete: (agent: AgentDefinition) => void
}

const AgentCard = memo(function AgentCard({
  agent,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onDelete,
}: AgentCardProps) {
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
          onCheckedChange={() => onSelect(agent.id)}
          aria-label={`选择 ${agent.name}`}
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
                onEdit(agent)
              }}
            >
              <Edit3 className="h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={(e) => {
                e.stopPropagation()
                onDelete(agent)
              }}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        className="flex flex-1 flex-col gap-3 text-left focus-visible:outline-none"
        onClick={() => onClick(agent)}
      >
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <EntityIcon icon={agent.icon} fallback={Bot} size={20} />
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              getStatusBadgeClasses(agent.status),
            )}
          >
            {getStatusLabel(agent.status)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {agent.description || '暂无描述'}
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(agent.updatedAt))}
          </span>
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-medium">
            v{agent.version}
          </span>
        </div>
      </button>
    </div>
  )
})

interface AgentListItemProps {
  agent: AgentDefinition
  selected: boolean
  batchMode: boolean
  onSelect: (id: string) => void
  onClick: (agent: AgentDefinition) => void
  onEdit: (agent: AgentDefinition) => void
  onDelete: (agent: AgentDefinition) => void
}

const AgentListItem = memo(function AgentListItem({
  agent,
  selected,
  batchMode,
  onSelect,
  onClick,
  onEdit,
  onDelete,
}: AgentListItemProps) {
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
          onCheckedChange={() => onSelect(agent.id)}
          aria-label={`选择 ${agent.name}`}
        />
      </div>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline-none"
        onClick={() => onClick(agent)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <EntityIcon icon={agent.icon} fallback={Bot} size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              v{agent.version}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {agent.description || '暂无描述'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              getStatusBadgeClasses(agent.status),
            )}
          >
            {getStatusLabel(agent.status)}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(new Date(agent.updatedAt))}
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
            <DropdownMenuItem onClick={() => onEdit(agent)}>
              <Edit3 className="h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => onDelete(agent)}>
              <Trash2 className="h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})

function AgentCardSkeleton() {
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

export function AgentListPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const filters = useAgentStore((s) => s.filters)
  const setFilters = useAgentStore((s) => s.setFilters)
  const setPage = useAgentStore((s) => s.setPage)
  const selectedAgentIds = useAgentStore((s) => s.selectedAgentIds)
  const toggleAgentSelection = useAgentStore((s) => s.toggleAgentSelection)
  const selectAllAgents = useAgentStore((s) => s.selectAllAgents)
  const clearAgentSelection = useAgentStore((s) => s.clearAgentSelection)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchInput, setSearchInput] = useState(filters.search)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AgentDefinition | null>(null)

  const deleteAgent = useDeleteAgent()

  const { data, isLoading } = useAgentList({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
  })

  const agents = useMemo(() => data?.data ?? [], [data?.data])
  const meta = data?.meta

  const batchMode = selectedAgentIds.size > 0

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

  const handleAgentClick = useCallback(
    (agent: AgentDefinition) => {
      navigate({ to: '/agents/$agentId', params: { agentId: agent.id } })
    },
    [navigate],
  )

  const handleEdit = useCallback(
    (agent: AgentDefinition) => {
      navigate({ to: '/agents/$agentId', params: { agentId: agent.id } })
    },
    [navigate],
  )

  const handleDelete = useCallback((agent: AgentDefinition) => {
    setDeleteTarget(agent)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteAgent.mutateAsync(deleteTarget.id)
      notify({ description: 'Agent 已删除', variant: 'success' })
      setDeleteTarget(null)
    } catch {
      notify({ title: '删除失败', description: '请稍后重试', variant: 'error' })
    }
  }, [deleteTarget, deleteAgent, notify])

  const handleSelectAll = useCallback(() => {
    if (selectedAgentIds.size === agents.length) {
      clearAgentSelection()
    } else {
      selectAllAgents(agents.map((a) => a.id))
    }
  }, [clearAgentSelection, selectAllAgents, selectedAgentIds.size, agents])

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
            <h1 className="text-lg font-semibold text-foreground">Agent</h1>
            <p className="text-sm text-muted-foreground">
              管理和配置你的智能体
            </p>
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
              placeholder="搜索 Agent..."
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
                selectedAgentIds.size === agents.length
                  ? true
                  : selectedAgentIds.size > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={handleSelectAll}
              aria-label="全选"
            />
            <span className="text-sm text-foreground">
              已选择 {selectedAgentIds.size} 项
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAgentSelection}
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
              <AgentCardSkeleton key={`skeleton-${String(i)}`} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Bot className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              {filters.search || filters.status ? '没有找到匹配的 Agent' : '还没有创建任何 Agent'}
            </p>
            {!filters.search && !filters.status && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                创建第一个 Agent
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
            {agents.map((agent, i) => (
              <div key={agent.id} className="card-stagger-enter" style={{ animationDelay: `${i * 40}ms` }}>
                <AgentCard
                  agent={agent}
                  selected={selectedAgentIds.has(agent.id)}
                  batchMode={batchMode}
                  onSelect={toggleAgentSelection}
                  onClick={handleAgentClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent, i) => (
              <div key={agent.id} className="card-stagger-enter" style={{ animationDelay: `${i * 30}ms` }}>
                <AgentListItem
                  agent={agent}
                  selected={selectedAgentIds.has(agent.id)}
                  batchMode={batchMode}
                  onSelect={toggleAgentSelection}
                  onClick={handleAgentClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {meta.total} 个 Agent, 第 {meta.page}/{meta.totalPages} 页
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

      <CreateOrchestrationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* 删除确认对话框 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 Agent &ldquo;{deleteTarget?.name}&rdquo; 吗？此操作不可撤销，所有关联数据将被永久移除。
          </AlertDialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleConfirmDelete}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
