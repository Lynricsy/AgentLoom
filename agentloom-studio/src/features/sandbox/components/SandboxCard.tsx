import { memo, useState } from 'react'
import { Container, MoreVertical, Square, Play, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatRelativeTime } from '@/features/canvas'
import { useSandboxStats } from '../api/sandboxQueries'
import { formatSandboxBytes, getSandboxDiskPercent } from '../lib/sandboxStats'
import { SandboxStatsDisplay } from './SandboxStatsDisplay'
import type { SandboxSession, SandboxStatus } from '../types'

interface SandboxCardProps {
  session: SandboxSession
  onStop: (session: SandboxSession) => void
  onStart: (session: SandboxSession) => void
  onDelete: (session: SandboxSession) => void
}

const STATUS_BADGE: Record<SandboxStatus, string> = {
  creating: 'bg-amber-500/10 text-amber-500',
  ready: 'bg-emerald-500/10 text-emerald-500',
  busy: 'bg-blue-500/10 text-blue-500',
  stopping: 'bg-neutral-500/10 text-neutral-400',
  stopped: 'bg-neutral-500/10 text-neutral-500',
  failed: 'bg-red-500/10 text-red-500',
}

const STATUS_LABEL: Record<SandboxStatus, string> = {
  creating: '创建中',
  ready: '就绪',
  busy: '运行中',
  stopping: '停止中',
  stopped: '已停止',
  failed: '失败',
}

const RUNNING_STATUSES: ReadonlySet<SandboxStatus> = new Set(['creating', 'ready', 'busy'])

const BINDING_BADGE: Record<NonNullable<SandboxSession['bindingType']>, string> = {
  resource: 'bg-emerald-500/10 text-emerald-400',
  conversation: 'bg-blue-500/10 text-blue-400',
  execution: 'bg-violet-500/10 text-violet-400',
}

const BINDING_LABEL: Record<NonNullable<SandboxSession['bindingType']>, string> = {
  resource: '资源',
  conversation: '对话',
  execution: '执行',
}

function formatTimeoutLabel(config: SandboxSession['config']): string {
  if (typeof config.timeoutSeconds === 'number') {
    return `${config.timeoutSeconds}s`
  }

  return `${config.timeout}h`
}

function CardActions({
  session,
  onStop,
  onStart,
  onDelete,
}: {
  session: SandboxSession
  onStop: (session: SandboxSession) => void
  onStart: (session: SandboxSession) => void
  onDelete: (session: SandboxSession) => void
}) {
  const [open, setOpen] = useState(false)
  const isPersistent = session.config.lifecycleMode === 'persistent'
  const isRunning = RUNNING_STATUSES.has(session.status)
  const isStopped = session.status === 'stopped'

  const hasActions = isRunning || (isStopped && isPersistent) || isPersistent
  if (!hasActions) return null

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
            {isRunning && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  onStop(session)
                  setOpen(false)
                }}
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </button>
            )}
            {isStopped && isPersistent && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  onStart(session)
                  setOpen(false)
                }}
              >
                <Play className="h-3.5 w-3.5" />
                启动
              </button>
            )}
            {isPersistent && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                onClick={() => {
                  onDelete(session)
                  setOpen(false)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export const SandboxCard = memo(function SandboxCard({
  session,
  onStop,
  onStart,
  onDelete,
}: SandboxCardProps) {
  const isPersistent = session.config.lifecycleMode === 'persistent'
  const isRunning = RUNNING_STATUSES.has(session.status)
  const displayName = session.config.name || session.id.slice(0, 8)
  const bindingType = session.bindingType ?? 'resource'

  const { data: stats } = useSandboxStats(session.id, session.status)
  const diskPercent = stats ? getSandboxDiskPercent(stats) : null

  return (
    <article className="group relative rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Container className="h-4 w-4" />
          </div>
          <h2 className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </h2>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              STATUS_BADGE[session.status],
            )}
          >
            {STATUS_LABEL[session.status]}
          </span>
        </div>
        <CardActions
          session={session}
          onStop={onStop}
          onStart={onStart}
          onDelete={onDelete}
        />
      </div>

      {/* Config + lifecycle badge */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
            isPersistent
              ? 'bg-blue-500/10 text-blue-400'
              : 'bg-amber-500/10 text-amber-400',
          )}
        >
          {isPersistent ? '持久' : '临时'}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
            BINDING_BADGE[bindingType],
          )}
        >
          {BINDING_LABEL[bindingType]}
        </span>
        <span>{session.config.cpu} C</span>
        <span>&middot;</span>
        <span>{session.config.memory} MB</span>
        <span>&middot;</span>
        <span>{session.config.disk} GB</span>
        <span>&middot;</span>
        <span>{formatTimeoutLabel(session.config)}</span>
      </div>

      {/* Stats: real-time for running, disk-only for stopped */}
      {isRunning && stats && (
        <div className="mt-3">
          <SandboxStatsDisplay stats={stats} />
        </div>
      )}

      {!isRunning && stats?.diskUsage != null && stats.diskTotal != null && diskPercent !== null && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground">
            <div className="mb-1 flex items-center justify-between">
              <span>Disk</span>
              <span className="font-medium text-foreground">
                {formatSandboxBytes(stats.diskUsage)} / {formatSandboxBytes(stats.diskTotal)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(100, diskPercent)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>创建于 {formatRelativeTime(new Date(session.createdAt))}</span>
      </div>
    </article>
  )
})
