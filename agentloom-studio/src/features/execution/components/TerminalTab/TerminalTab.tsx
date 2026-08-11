import { memo, useCallback, useMemo } from 'react'
import { TerminalSquare } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { Card } from '@/shared/ui/card'
import { TerminalSessionList } from './TerminalSessionList'
import { TerminalInstance, TERMINAL_THEME } from './TerminalInstance'
import { usePtyBufferDump } from '../../hooks/usePtyBufferDump'
import type { PtySessionState } from '../../types/pty'

interface TerminalTabProps {
  executionId: string
  sessions: PtySessionState[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onInput: (sessionId: string, data: string) => void
}

/**
 * 终端活跃面板内容。
 * 使用独立的 BufferLoader 组件将 useQuery 隔离到选中 session，
 * 避免 session 切换时拉取所有 session 的 buffer dump。
 */
export const TerminalTab = memo(function TerminalTab({
  executionId,
  sessions,
  activeSessionId,
  onSelectSession,
  onInput,
}: TerminalTabProps) {
  if (sessions.length === 0) {
    return (
      <div className="h-full" data-testid="terminal-tab-empty">
        <EmptyState
          className="h-full"
          icon={TerminalSquare}
          title="没有终端会话"
          description="AI Agent 在执行过程中创建的终端会话将显示在这里"
        />
      </div>
    )
  }

  return (
    <Card
      className="flex h-full min-h-0 flex-col overflow-hidden sm:flex-row"
      data-testid="terminal-tab"
    >
      <div className="max-h-40 shrink-0 overflow-hidden border-b border-border sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
        <TerminalSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
        />
      </div>

      {/* 暗色终端区：底色与 xterm 主题同源，滚动完全交给 xterm 自身 */}
      <div
        className="min-w-0 flex-1 overflow-hidden"
        style={{ backgroundColor: TERMINAL_THEME.background }}
      >
        {activeSessionId ? (
          <ActiveTerminalPane
            executionId={executionId}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onInput={onInput}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            选择一个终端会话
          </div>
        )}
      </div>
    </Card>
  )
})

/**
 * 隔离 buffer dump 查询到当前激活 session，
 * 避免所有 session 的 useQuery 同时挂载。
 */
const ActiveTerminalPane = memo(function ActiveTerminalPane({
  executionId,
  sessions,
  activeSessionId,
  onInput,
}: {
  executionId: string
  sessions: PtySessionState[]
  activeSessionId: string
  onInput: (sessionId: string, data: string) => void
}) {
  const activeSession = useMemo(
    () => sessions.find((s) => s.info.sessionId === activeSessionId),
    [sessions, activeSessionId],
  )

  const { data: bufferDump } = usePtyBufferDump({
    executionId,
    sessionId: activeSessionId,
    enabled: !!activeSession,
  })

  const handleInput = useCallback(
    (data: string) => {
      onInput(activeSessionId, data)
    },
    [activeSessionId, onInput],
  )

  if (!activeSession) return null

  return (
    <TerminalInstance
      sessionId={activeSessionId}
      initialOutput={bufferDump?.lines}
      liveOutput={activeSession.outputBuffer}
      onInput={handleInput}
    />
  )
})
