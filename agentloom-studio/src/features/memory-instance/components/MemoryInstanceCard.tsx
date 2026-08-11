import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { MoreVertical, Pencil, Trash2, Archive, RotateCcw, Brain, Eye, Network } from 'lucide-react'
import { formatRelativeTime } from '@/features/canvas'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
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
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={() => onEdit(instance)}>
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggleStatus(instance)}>
          {isActive ? (
            <>
              <Archive className="h-3.5 w-3.5" />
              归档
            </>
          ) : (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              激活
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => onDelete(instance)}>
          <Trash2 className="h-3.5 w-3.5" />
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
              className="grid h-8 w-8 shrink-0 place-items-center rounded-card"
              style={{
                backgroundColor: `color-mix(in srgb, ${MEMORY_TONE} 14%, transparent)`,
                color: MEMORY_TONE,
              }}
            >
              <Brain className="h-4 w-4" />
            </span>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {instance.name}
            </h2>
            <Badge size="sm" variant={isArchived ? 'secondary' : 'success'}>
              {isArchived ? '已归档' : '活跃'}
            </Badge>
          </div>
          <CardActions
            instance={instance}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
          />
        </div>

        {instance.description && (
          <p className="mt-2 line-clamp-2 text-xs text-muted">
            {instance.description}
          </p>
        )}

        {instance.validDomains.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {instance.validDomains.map((domain) => (
              <Badge key={domain} size="sm" variant="outline" className="rounded-md">
                {domain}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Network className="h-3 w-3" />
              {instance.nodeCount ?? 0} 节点
            </span>
            <span>创建于 {formatRelativeTime(new Date(instance.createdAt))}</span>
          </div>
          <Link
            to="/resources/memory-instances/$instanceId/browse"
            params={{ instanceId: instance.id }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Eye className="h-3.5 w-3.5" />
            浏览
          </Link>
        </div>
      </article>
    </Card>
  )
})
