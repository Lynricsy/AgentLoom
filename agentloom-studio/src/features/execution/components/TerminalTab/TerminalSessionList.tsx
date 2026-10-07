import { memo } from 'react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { StatusDot, type StatusTone } from '@/shared/ui/status-badge'
import type { PtySessionState, PtySessionStatus } from '../../types/pty'

interface TerminalSessionListProps {
  sessions: PtySessionState[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
}

const statusConfig: Record<
  PtySessionStatus,
  { tone: StatusTone; pulse: boolean; label: string }
> = {
  running: { tone: 'success', pulse: true, label: '运行中' },
  exited: { tone: 'neutral', pulse: false, label: '已退出' },
  killing: { tone: 'warning', pulse: true, label: '终止中' },
  killed: { tone: 'error', pulse: false, label: '已终止' },
}

export const TerminalSessionList = memo(function TerminalSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
}: TerminalSessionListProps) {
  return (
    <div
      className="flex h-full flex-col"
      data-testid="terminal-session-list"
    >
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">会话列表</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => {
          const isActive = session.info.sessionId === activeSessionId
          const status = statusConfig[session.info.status]

          return (
            <Button
              key={session.info.sessionId}
              variant="ghost"
              className={cn(
                'flex h-auto w-full items-start justify-start gap-2.5 rounded-none px-3 py-2.5 text-left font-normal',
                isActive
                  ? 'bg-primary/10 text-foreground hover:bg-primary/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => onSelectSession(session.info.sessionId)}
              data-testid={`terminal-session-item-${session.info.sessionId}`}
            >
              <span className="mt-1.5" title={status.label}>
                <StatusDot tone={status.tone} pulse={status.pulse} />
              </span>

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
                          'rounded px-1 py-0.5 font-mono text-2xs',
                          session.info.exitCode === 0
                            ? 'bg-success/10 text-success'
                            : 'bg-error/10 text-error',
                        )}
                      >
                        code {session.info.exitCode}
                      </span>
                    )}
                </div>
              </div>
            </Button>
          )
        })}
      </div>
    </div>
  )
})
