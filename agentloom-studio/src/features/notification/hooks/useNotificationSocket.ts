import { useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { useToast } from '@/shared/ui/toast'
import { useNotificationActions } from '../stores/notificationStore'
import type { NotificationType, NotificationTypeEnum } from '../types'

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

export function resolveNotificationSocketUrl(
  apiBaseUrl: string,
  origin = typeof window === 'undefined'
    ? DEFAULT_WINDOW_ORIGIN
    : window.location.origin,
): string {
  const resolvedApiUrl = new URL(apiBaseUrl || '/api/v1', origin)
  const basePath = stripApiSuffix(resolvedApiUrl.pathname)
  const namespacePath = `${basePath}/notification`.replace(/\/+/g, '/')

  return new URL(namespacePath, resolvedApiUrl.origin).toString()
}

interface NotificationUnreadCountEvent {
  count: number
}

interface NotificationClientToServerEvents {
  'notification:subscribe': () => void
  'notification:unsubscribe': () => void
}

interface NotificationServerToClientEvents {
  'notification:new': (notification: NotificationType) => void
  'notification:unread-count': (
    payload: NotificationUnreadCountEvent,
  ) => void
}

type TypedSocket = Socket<
  NotificationServerToClientEvents,
  NotificationClientToServerEvents
>

export type NotificationConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'

export interface UseNotificationSocketOptions {
  authToken?: string
}

export interface UseNotificationSocketResult {
  connectionStatus: NotificationConnectionStatus
  error: string | null
}

function getToastVariant(type: NotificationTypeEnum) {
  switch (type) {
    case 'execution_completed':
      return 'success'
    case 'execution_failed':
      return 'error'
    case 'intervention_required':
      return 'warning'
    default:
      return 'info'
  }
}

export function useNotificationSocket(
  options: UseNotificationSocketOptions,
): UseNotificationSocketResult {
  const { authToken } = options
  const [connectionStatus, setConnectionStatus] =
    useState<NotificationConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const { addNotification, setUnreadCount } = useNotificationActions()
  const { notify } = useToast()

  const callbacksRef = useRef({
    addNotification,
    setUnreadCount,
    notify,
  })
  callbacksRef.current = {
    addNotification,
    setUnreadCount,
    notify,
  }

  const socketUrl = useMemo(() => resolveNotificationSocketUrl(API_BASE_URL), [])

  useEffect(() => {
    if (!authToken) {
      setConnectionStatus('disconnected')
      setError(null)
      return
    }

    setConnectionStatus('connecting')
    setError(null)

    const socket: TypedSocket = io(socketUrl, {
      auth: { token: authToken },
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      reconnectionAttempts: Infinity,
    })

    const handleConnect = () => {
      setConnectionStatus('connected')
      setError(null)
      socket.emit('notification:subscribe')
    }

    const handleDisconnect = () => {
      setConnectionStatus('disconnected')
    }

    const handleConnectError = (connectError: Error) => {
      setConnectionStatus('disconnected')
      setError(connectError.message)
    }

    const handleNotification = (notification: NotificationType) => {
      callbacksRef.current.addNotification(notification)
      callbacksRef.current.notify({
        title: '新通知',
        description: notification.title,
        variant: getToastVariant(notification.type),
      })
    }

    const handleUnreadCount = (payload: NotificationUnreadCountEvent) => {
      callbacksRef.current.setUnreadCount(payload.count)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('notification:new', handleNotification)
    socket.on('notification:unread-count', handleUnreadCount)

    return () => {
      socket.emit('notification:unsubscribe')
      socket.removeAllListeners()
      socket.disconnect()
      setConnectionStatus('disconnected')
    }
  }, [authToken, socketUrl])

  return { connectionStatus, error }
}
