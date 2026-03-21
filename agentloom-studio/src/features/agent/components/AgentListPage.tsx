import { memo, useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Plus,
  Search,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatRelativeTime } from '@/features/canvas/lib/formatRelativeTime'
import { useAgentList } from '../api/agentQueries'
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
  onClick: (agent: AgentDefinition) => void
}

const AgentCard = memo(function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5 text-left',
        'transition-all hover:border-primary/40 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'cursor-pointer',
      )}
      onClick={() => onClick(agent)}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
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
  )
})

interface AgentListItemProps {
  agent: AgentDefinition
  onClick: (agent: AgentDefinition) => void
}

const AgentListItem = memo(function AgentListItem({ agent, onClick }: AgentListItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-4 rounded-lg border border-border/60 bg-card px-4 py-3 text-left',
        'transition-all hover:border-primary/40 hover:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'w-full cursor-pointer',
      )}
      onClick={() => onClick(agent)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
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
  )
})

function AgentCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="h-5 w-14 rounded-full bg-muted" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
      </div>
      <div className="mt-3 flex justify-between">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-3 w-8 rounded bg-muted" />
      </div>
    </div>
  )
}

export function AgentListPage() {
  const navigate = useNavigate()
  const filters = useAgentStore((s) => s.filters)
  const setFilters = useAgentStore((s) => s.setFilters)
  const setPage = useAgentStore((s) => s.setPage)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchInput, setSearchInput] = useState(filters.search)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { data, isLoading } = useAgentList({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
  })

  const agents = data?.data ?? []
  const meta = data?.meta

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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onClick={handleAgentClick} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <AgentListItem key={agent.id} agent={agent} onClick={handleAgentClick} />
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
    </div>
  )
}
