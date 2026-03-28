import { memo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MoreVertical, Pencil, Trash2, Archive, RotateCcw, Brain, Eye } from 'lucide-react'
import { formatRelativeTime } from '@/features/canvas'
import { cn } from '@/shared/lib/utils'
import type { MemoryInstance } from '../types'

interface MemoryInstanceCardProps {
  instance: MemoryInstance
  onEdit: (instance: MemoryInstance) => void
  onDelete: (instance: MemoryInstance) => void
  onToggleStatus: (instance: MemoryInstance) => void
}

const STATUS_BADGE: Record<'active' | 'archived', string> = {
  active: 'bg-emerald-500/10 text-emerald-500',
  archived: 'bg-neutral-500/10 text-neutral-500',
}

const STATUS_LABEL: Record<'active' | 'archived', string> = {
  active: '活跃',
  archived: '已归档',
}

function CardActions({
  instance,
  onEdit,
  onDelete,
  onToggleStatus,
}: MemoryInstanceCardProps) {
  const [open, setOpen] = useState(false)
  const isActive = instance.status === 'active'

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
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            role="button"
            tabIndex={-1}
            aria-label="关闭菜单"
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                onEdit(instance)
                setOpen(false)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                onToggleStatus(instance)
                setOpen(false)
              }}
            >
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
            </button>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              onClick={() => {
                onDelete(instance)
                setOpen(false)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export const MemoryInstanceCard = memo(function MemoryInstanceCard({
  instance,
  onEdit,
  onDelete,
  onToggleStatus,
}: MemoryInstanceCardProps) {
  const statusKey = instance.status === 'archived' ? 'archived' : 'active'

  return (
    <article className="group relative rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Brain className="h-4 w-4" />
          </div>
          <h2 className="truncate text-sm font-semibold text-foreground">
            {instance.name}
          </h2>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              STATUS_BADGE[statusKey],
            )}
          >
            {STATUS_LABEL[statusKey]}
          </span>
        </div>
        <CardActions
          instance={instance}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleStatus={onToggleStatus}
        />
      </div>

      {/* Description */}
      {instance.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {instance.description}
        </p>
      )}

      {/* Valid domains */}
      {instance.validDomains.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {instance.validDomains.map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {domain}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>创建于 {formatRelativeTime(new Date(instance.createdAt))}</span>
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
  )
})
