import { memo, useCallback, useMemo } from 'react'
import { TerminalSquare } from 'lucide-react'
import { TerminalSessionList } from './TerminalSessionList'
import { TerminalInstance } from './TerminalInstance'
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
    return <TerminalEmptyState />
  }

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border/60"
      data-testid="terminal-tab"
    >
      <div className="w-56 shrink-0">
        <TerminalSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
        />
      </div>

      <div className="flex-1 overflow-hidden bg-[#1a1a2e]">
        {activeSessionId ? (
          <ActiveTerminalPane
            executionId={executionId}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onInput={onInput}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            选择一个终端会话
          </div>
        )}
      </div>
    </div>
  )
})

function TerminalEmptyState() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
      data-testid="terminal-tab-empty"
    >
      <TerminalSquare className="h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">没有终端会话</p>
      <p className="max-w-xs text-center text-xs opacity-70">
        AI Agent 在执行过程中创建的终端会话将显示在这里
      </p>
    </div>
  )
}

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
