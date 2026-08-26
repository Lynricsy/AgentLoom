import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { useAuthToken } from '@/features/auth/hooks/useAuthToken'
import { knowledgeBaseKeys } from '../api/knowledgeBaseKeys'
import type { DocumentStatus } from '../types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(
  /\/$/,
  '',
)

const DEFAULT_WINDOW_ORIGIN = 'http://localhost'

export type DocumentProgressStage =
  | 'preparing'
  | 'parsing'
  | 'chunking'
  | 'queueing'
  | 'completed'

export interface DocumentProcessingProgress {
  percentage: number
  stage: DocumentProgressStage
  currentStep: number
  totalSteps: number
}

export interface LiveDocumentStatusEvent {
  documentId: string
  knowledgeBaseId: string
  status: DocumentStatus
  progress?: DocumentProcessingProgress
  errorMessage?: string
}

interface UseKnowledgeBaseSocketResult {
  documentEvents: Record<string, LiveDocumentStatusEvent>
}

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

export function resolveKnowledgeSocketUrl(
  apiBaseUrl: string,
  origin = typeof window === 'undefined'
    ? DEFAULT_WINDOW_ORIGIN
    : window.location.origin,
): string {
  const resolvedApiUrl = new URL(apiBaseUrl || '/api/v1', origin)
  const basePath = stripApiSuffix(resolvedApiUrl.pathname)
  const namespacePath = `${basePath}/knowledge`.replace(/\/+/g, '/')

  return new URL(namespacePath, resolvedApiUrl.origin).toString()
}

export function useKnowledgeBaseSocket(
  tenantId: string | undefined,
  kbId: string | undefined,
): UseKnowledgeBaseSocketResult {
  const queryClient = useQueryClient()
  const authToken = useAuthToken()
  const [documentEvents, setDocumentEvents] = useState<
    Record<string, LiveDocumentStatusEvent>
  >({})
  const socketUrl = useMemo(() => resolveKnowledgeSocketUrl(API_BASE_URL), [])

  useEffect(() => {
    // 服务端 /knowledge namespace 在握手期强制校验 JWT 并由 token 推导租户房间，
    // 未带 token 会被直接拒绝，因此没有 token 时不建连。
    if (!tenantId || !kbId || !authToken) {
      setDocumentEvents({})
      return
    }

    const roomPayload = {
      tenantId,
      knowledgeBaseId: kbId,
    }

    setDocumentEvents({})

    const socket = io(socketUrl, { auth: { token: authToken } })

    const handleConnect = () => {
      socket.emit('join', roomPayload)
    }

    const handleDocumentStatusChanged = (event: LiveDocumentStatusEvent) => {
      if (event.knowledgeBaseId !== kbId) {
        return
      }

      setDocumentEvents((current) => ({
        ...current,
        [event.documentId]: event,
      }))

      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.documents(kbId),
      })
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.detail(kbId),
      })
    }

    const handleKnowledgeBaseUpdated = () => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.detail(kbId),
      })
      void queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.lists(),
      })
    }

    socket.on('connect', handleConnect)
    socket.on('document:status-changed', handleDocumentStatusChanged)
    socket.on('knowledge-base:updated', handleKnowledgeBaseUpdated)

    return () => {
      socket.emit('leave', roomPayload)
      socket.off('connect', handleConnect)
      socket.off('document:status-changed', handleDocumentStatusChanged)
      socket.off('knowledge-base:updated', handleKnowledgeBaseUpdated)
      socket.disconnect()
    }
  }, [authToken, kbId, queryClient, socketUrl, tenantId])

  return { documentEvents }
}
