import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { knowledgeBaseKeys } from '../api/knowledgeBaseKeys'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(
  /\/$/,
  '',
)

export function useKnowledgeBaseSocket(
  tenantId: string | undefined,
  kbId: string | undefined,
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenantId || !kbId) {
      return
    }

    const roomPayload = {
      tenantId,
      knowledgeBaseId: kbId,
    }

    const socket = io(`${API_BASE_URL}/knowledge`)

    const handleConnect = () => {
      socket.emit('join', roomPayload)
    }

    const handleDocumentStatusChanged = () => {
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
  }, [kbId, queryClient, tenantId])
}
