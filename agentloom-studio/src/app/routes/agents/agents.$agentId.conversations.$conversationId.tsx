import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { rootRoute } from '../__root';
import { AgentConversationPage } from '@/features/agent-conversation/components/AgentConversationPage';
import { ConversationSidebar } from '@/features/agent-conversation/components/ConversationSidebar';

function ConversationPageWrapper() {
  const { agentId, conversationId } = agentConversationRoute.useParams();
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate({ to: '/agents' });
  }, [navigate]);

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar
        agentId={agentId}
        currentConversationId={conversationId}
      />
      <div className="min-w-0 flex-1">
        <AgentConversationPage
          agentId={agentId}
          conversationId={conversationId}
          onBack={handleBack}
        />
      </div>
    </div>
  );
}

export const agentConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId/conversations/$conversationId',
  component: ConversationPageWrapper,
});
