import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'

function NewConversationPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">新建会话</h1>
      <p className="text-sm text-muted-foreground">启动与智能体的新对话</p>
    </div>
  )
}

export const agentNewConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId/conversations/new',
  component: NewConversationPage,
})
