import { memo } from 'react'
import { cn } from '@/shared/lib/utils'
import type { PtySessionState, PtySessionStatus } from '../../types/pty'

interface TerminalSessionListProps {
  sessions: PtySessionState[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
}

const statusConfig: Record<
  PtySessionStatus,
  { dotClass: string; label: string }
> = {
  running: {
    dotClass: 'bg-emerald-500 animate-pulse',
    label: '运行中',
  },
  exited: {
    dotClass: 'bg-muted-foreground',
    label: '已退出',
  },
  killing: {
    dotClass: 'bg-amber-500 animate-pulse',
    label: '终止中',
  },
  killed: {
    dotClass: 'bg-rose-500',
    label: '已终止',
  },
}

export const TerminalSessionList = memo(function TerminalSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
}: TerminalSessionListProps) {
  return (
    <div
      className="flex h-full flex-col border-r border-border/60"
      data-testid="terminal-session-list"
    >
      <div className="border-b border-border/40 px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">会话列表</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => {
          const isActive = session.info.sessionId === activeSessionId
          const status = statusConfig[session.info.status]

          return (
            <button
              key={session.info.sessionId}
              type="button"
              className={cn(
                'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => onSelectSession(session.info.sessionId)}
              data-testid={`terminal-session-item-${session.info.sessionId}`}
            >
              <span
                className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', status.dotClass)}
                title={status.label}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {session.info.title || session.info.command}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {session.info.command}{' '}
                  {session.info.args.length > 0 && session.info.args.join(' ')}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{status.label}</span>
                  {session.info.status === 'exited' &&
                    session.info.exitCode !== undefined && (
                      <span
                        className={cn(
                          'rounded px-1 py-0.5 font-mono text-[10px]',
                          session.info.exitCode === 0
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400',
                        )}
                      >
                        code {session.info.exitCode}
                      </span>
                    )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
})
