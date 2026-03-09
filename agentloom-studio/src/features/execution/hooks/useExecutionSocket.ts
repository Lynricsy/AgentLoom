import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ExecutionEvent,
  ExecutionStateSnapshot,
  ExecutionStatusChangedPayload,
  OutputChunkPayload,
  ServerToClientEvents,
  StepAgentEventPayload,
  StepRetryingPayload,
  StepStatusChangedPayload,
  SubscribeAck,
} from '../types'
import { ExecutionEventName } from '../types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(
  /\/$/,
  '',
)

const DEFAULT_WINDOW_ORIGIN = 'http://localhost'

const RECONNECT_DELAY_MS = 5_000
const RECONNECT_DELAY_MAX_MS = 30_000

function stripApiSuffix(pathname: string): string {
  const normalizedPath = pathname.replace(/\/$/, '')

  if (!normalizedPath || normalizedPath === '/') {
    return ''
  }

  if (normalizedPath.endsWith('/api/v1')) {
    return normalizedPath.slice(0, -'/api/v1'.length)
  }

  if (normalizedPath.endsWith('/api')) {
    return normalizedPath.slice(0, -'/api'.length)
  }

  return normalizedPath
}

export function resolveExecutionSocketUrl(
  apiBaseUrl: string,
  origin = typeof window === 'undefined'
    ? DEFAULT_WINDOW_ORIGIN
    : window.location.origin,
): string {
  const resolvedApiUrl = new URL(apiBaseUrl || '/api/v1', origin)
  const basePath = stripApiSuffix(resolvedApiUrl.pathname)
  const namespacePath = `${basePath}/execution`.replace(/\/+/g, '/')

  return new URL(namespacePath, resolvedApiUrl.origin).toString()
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface ExecutionSocketCallbacks {
  onExecutionStatusChanged?: (
    event: ExecutionEvent<ExecutionStatusChangedPayload>,
  ) => void
  onStepStatusChanged?: (
    event: ExecutionEvent<StepStatusChangedPayload>,
  ) => void
  onStepAgentEvent?: (event: ExecutionEvent<StepAgentEventPayload>) => void
  onStepRetrying?: (event: ExecutionEvent<StepRetryingPayload>) => void
  onOutputChunk?: (event: ExecutionEvent<OutputChunkPayload>) => void
  onSnapshot?: (snapshot: ExecutionStateSnapshot) => void
  onError?: (error: { message: string; code?: string }) => void
}

export interface UseExecutionSocketOptions extends ExecutionSocketCallbacks {
  tenantId: string | undefined
  executionId: string | undefined
  authToken?: string
}

export interface UseExecutionSocketResult {
  connectionStatus: ConnectionStatus
  lastEventId: number
  error: string | null
}

export function useExecutionSocket(
  options: UseExecutionSocketOptions,
): UseExecutionSocketResult {
  const { tenantId, executionId, authToken } = options

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const lastEventIdRef = useRef(0)
  const [lastEventId, setLastEventId] = useState(0)

  const callbacksRef = useRef<ExecutionSocketCallbacks>(options)
  callbacksRef.current = options

  const socketUrl = useMemo(() => resolveExecutionSocketUrl(API_BASE_URL), [])

  const trackEventId = useCallback((eventId: number) => {
    if (eventId > lastEventIdRef.current) {
      lastEventIdRef.current = eventId
      setLastEventId(eventId)
    }
  }, [])

  useEffect(() => {
    if (!executionId || !tenantId) {
      setConnectionStatus('disconnected')
      setError(null)
      lastEventIdRef.current = 0
      setLastEventId(0)
      return
    }

    setConnectionStatus('connecting')
    setError(null)

    const socket: TypedSocket = io(socketUrl, {
      auth: authToken ? { token: authToken } : undefined,
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      reconnectionAttempts: Infinity,
    })

    const emitSubscribe = () => {
      const payload = {
        tenantId,
        executionId,
        lastEventId: lastEventIdRef.current || undefined,
      }

      socket.emit('execution:subscribe', payload, (ack: SubscribeAck) => {
        if (ack?.status === 'error') {
          callbacksRef.current.onError?.({
            message: ack.error ?? 'Subscription failed',
            code: ack.error,
          })
          return
        }
        if (ack?.currentState) {
          if (ack.currentState.lastEventId != null) {
            trackEventId(ack.currentState.lastEventId)
          }
          callbacksRef.current.onSnapshot?.(ack.currentState)
        }
      })
    }

    const handleConnect = () => {
      setConnectionStatus('connected')
      setError(null)
      emitSubscribe()
    }

    const handleDisconnect = () => {
      setConnectionStatus('disconnected')
    }

    const handleConnectError = (err: Error) => {
      setConnectionStatus('disconnected')
      setError(err.message)
    }

    const handleExecutionStatusChanged = (
      event: ExecutionEvent<ExecutionStatusChangedPayload>,
    ) => {
      trackEventId(event.eventId)
      callbacksRef.current.onExecutionStatusChanged?.(event)
    }

    const handleStepStatusChanged = (
      event: ExecutionEvent<StepStatusChangedPayload>,
    ) => {
      trackEventId(event.eventId)
      callbacksRef.current.onStepStatusChanged?.(event)
    }

    const handleStepAgentEvent = (
      event: ExecutionEvent<StepAgentEventPayload>,
    ) => {
      trackEventId(event.eventId)
      callbacksRef.current.onStepAgentEvent?.(event)
    }

    const handleStepRetrying = (
      event: ExecutionEvent<StepRetryingPayload>,
    ) => {
      trackEventId(event.eventId)
      callbacksRef.current.onStepRetrying?.(event)
    }

    const handleOutputChunk = (
      event: ExecutionEvent<OutputChunkPayload>,
    ) => {
      trackEventId(event.eventId)
      callbacksRef.current.onOutputChunk?.(event)
    }

    const handleSnapshot = (snapshot: ExecutionStateSnapshot) => {
      if (snapshot.lastEventId != null) {
        trackEventId(snapshot.lastEventId)
      }
      callbacksRef.current.onSnapshot?.(snapshot)
    }

    const handleError = (err: { message: string; code?: string }) => {
      setError(err.message)
      callbacksRef.current.onError?.(err)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on(
      ExecutionEventName.EXECUTION_STATUS_CHANGED,
      handleExecutionStatusChanged,
    )
    socket.on(
      ExecutionEventName.STEP_STATUS_CHANGED,
      handleStepStatusChanged,
    )
    socket.on(ExecutionEventName.STEP_AGENT_EVENT, handleStepAgentEvent)
    socket.on(ExecutionEventName.STEP_RETRYING, handleStepRetrying)
    socket.on(ExecutionEventName.OUTPUT_CHUNK, handleOutputChunk)
    socket.on('execution.state.snapshot', handleSnapshot)
    socket.on('error', handleError)

    return () => {
      socket.emit('execution:unsubscribe', { tenantId, executionId })
      socket.removeAllListeners()
      socket.disconnect()
      setConnectionStatus('disconnected')
    }
  }, [authToken, executionId, socketUrl, tenantId, trackEventId])

  return { connectionStatus, lastEventId, error }
}
