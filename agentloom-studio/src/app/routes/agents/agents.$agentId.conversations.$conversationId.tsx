import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'

function ConversationPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">对话</h1>
      <p className="text-sm text-muted-foreground">与智能体的对话界面</p>
    </div>
  )
}

export const agentConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId/conversations/$conversationId',
  component: ConversationPage,
})
