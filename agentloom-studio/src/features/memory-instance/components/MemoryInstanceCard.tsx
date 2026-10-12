import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { MoreVertical, Pencil, Trash2, Archive, RotateCcw, Brain, Eye, Network } from 'lucide-react'
import { formatRelativeTime } from '@/features/canvas'
import { Badge } from '@/shared/ui/badge'
import { Button, buttonVariants } from '@/shared/ui/button'
import { StatusBadge } from '@/shared/ui/status-badge'
import { Card } from '@/shared/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { MemoryInstance } from '../types'

interface MemoryInstanceCardProps {
  instance: MemoryInstance
  onEdit: (instance: MemoryInstance) => void
  onDelete: (instance: MemoryInstance) => void
  onToggleStatus: (instance: MemoryInstance) => void
}

const MEMORY_TONE = 'var(--color-node-memory)'

function CardActions({
  instance,
  onEdit,
  onDelete,
  onToggleStatus,
}: MemoryInstanceCardProps) {
  const isActive = instance.status === 'active'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="更多操作">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={() => onEdit(instance)}>
          <Pencil className="size-3.5" />
          编辑
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleStatus(instance)}>
          {isActive ? (
            <>
              <Archive className="size-3.5" />
              归档
            </>
          ) : (
            <>
              <RotateCcw className="size-3.5" />
              激活
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => onDelete(instance)}>
          <Trash2 className="size-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const MemoryInstanceCard = memo(function MemoryInstanceCard({
  instance,
  onEdit,
  onDelete,
  onToggleStatus,
}: MemoryInstanceCardProps) {
  const isArchived = instance.status === 'archived'

  return (
    <Card className="p-5">
      <article>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg"
              style={{
                backgroundColor: `color-mix(in srgb, ${MEMORY_TONE} 14%, transparent)`,
                color: MEMORY_TONE,
              }}
            >
              <Brain className="size-4" />
            </span>
            <h2 className="min-w-0 truncate text-sm font-semibold text-foreground" title={instance.name}>
              {instance.name}
            </h2>
            <StatusBadge size="sm" tone={isArchived ? 'neutral' : 'success'} className="shrink-0">
              {isArchived ? '已归档' : '活跃'}
            </StatusBadge>
          </div>
          <CardActions
            instance={instance}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
          />
        </div>

        {instance.description && (
          <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground">
            {instance.description}
          </p>
        )}

        {instance.validDomains.length > 0 && (
          <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
            {instance.validDomains.map((domain) => (
              <Badge
                key={domain}
                size="sm"
                variant="outline"
                className="max-w-[10rem] rounded-md"
                title={domain}
              >
                <span className="truncate">{domain}</span>
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <Network className="size-3" />
              {instance.nodeCount ?? 0} 节点
            </span>
            <span className="shrink-0">创建于 {formatRelativeTime(new Date(instance.createdAt))}</span>
          </div>
          <Link
            to="/resources/memory-instances/$instanceId/browse"
            params={{ instanceId: instance.id }}
            className={buttonVariants({ variant: 'ghost', size: 'xs', className: 'text-primary' })}
          >
            <Eye />
            浏览
          </Link>
        </div>
      </article>
    </Card>
  )
})
