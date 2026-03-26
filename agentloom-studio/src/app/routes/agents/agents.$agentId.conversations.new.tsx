import { createRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { rootRoute } from '../__root'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'

function NewConversationPage() {
  const { agentId } = agentNewConversationRoute.useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const createConversation = async () => {
      try {
        const response = await apiClient
          .post(`agent-definitions/${agentId}/conversations`, {
            json: { title: '新对话' },
          })
          .json<ApiResponse<{ id: string }>>()

        navigate({
          to: '/agents/$agentId/conversations/$conversationId',
          params: { agentId, conversationId: response.data.id },
          replace: true,
        })
      } catch (err) {
        setError('创建对话失败，请重试')
        console.error('Failed to create conversation:', err)
      }
    }
    createConversation()
  }, [agentId, navigate])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-zinc-400">正在创建对话...</p>
    </div>
  )
}

export const agentNewConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId/conversations/new',
  component: NewConversationPage,
})
