import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type {
  ExecutionEvent,
  StepAgentEventPayload,
} from '../types/execution-event.types'
import { ExecutionEventName } from '../types/execution-event.types'
import type {
  PtyEvent,
  PtySessionState,
} from '../types/pty'
import { sendPtyWrite } from '../api/pty'

const MAX_OUTPUT_BUFFER_LINES = 10_000

export interface UsePtyTerminalsOptions {
  socket: Socket | null
  executionId: string | undefined
}

export interface UsePtyTerminalsResult {
  sessions: PtySessionState[]
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  sendInput: (sessionId: string, data: string) => void
}

export function usePtyTerminals(
  options: UsePtyTerminalsOptions,
): UsePtyTerminalsResult {
  const { socket, executionId } = options

  const sessionsRef = useRef<Map<string, PtySessionState>>(new Map())
  const [sessions, setSessions] = useState<PtySessionState[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const flushSessions = useCallback(() => {
    setSessions(Array.from(sessionsRef.current.values()))
  }, [])

  const handlePtyEvent = useCallback(
    (ptyEvent: PtyEvent) => {
      const map = sessionsRef.current

      switch (ptyEvent.type) {
        case 'pty.spawned': {
          map.set(ptyEvent.sessionId, {
            info: ptyEvent.info,
            outputBuffer: [],
          })
          setActiveSessionId((prev) => prev ?? ptyEvent.sessionId)
          break
        }
        case 'pty.output': {
          const session = map.get(ptyEvent.sessionId)
          if (session) {
            session.outputBuffer.push(ptyEvent.data)
            if (session.outputBuffer.length > MAX_OUTPUT_BUFFER_LINES) {
              session.outputBuffer = session.outputBuffer.slice(
                -MAX_OUTPUT_BUFFER_LINES,
              )
            }
            session.info.lineCount = session.outputBuffer.length
          }
          break
        }
        case 'pty.exit': {
          const session = map.get(ptyEvent.sessionId)
          if (session) {
            session.info.status = 'exited'
            session.info.exitCode = ptyEvent.exitCode
            session.info.exitSignal = ptyEvent.exitSignal
          }
          break
        }
        case 'pty.killed': {
          const session = map.get(ptyEvent.sessionId)
          if (session) {
            session.info.status = 'killed'
          }
          break
        }
      }

      flushSessions()
    },
    [flushSessions],
  )

  const callbacksRef = useRef({ handlePtyEvent })
  callbacksRef.current.handlePtyEvent = handlePtyEvent

  useEffect(() => {
    if (!socket || !executionId) return

    const onAgentEvent = (
      event: ExecutionEvent<StepAgentEventPayload>,
    ) => {
      const agentEvent = event.data.event
      if (
        agentEvent &&
        typeof agentEvent === 'object' &&
        'type' in agentEvent &&
        typeof agentEvent.type === 'string' &&
        agentEvent.type.startsWith('pty.')
      ) {
        callbacksRef.current.handlePtyEvent(agentEvent as unknown as PtyEvent)
      }
    }

    socket.on(ExecutionEventName.STEP_AGENT_EVENT, onAgentEvent)

    return () => {
      socket.off(ExecutionEventName.STEP_AGENT_EVENT, onAgentEvent)
    }
  }, [socket, executionId])

  const sendInput = useCallback(
    (sessionId: string, data: string) => {
      if (!executionId) return
      void sendPtyWrite(executionId, sessionId, data)
    },
    [executionId],
  )

  return { sessions, activeSessionId, setActiveSessionId, sendInput }
}
