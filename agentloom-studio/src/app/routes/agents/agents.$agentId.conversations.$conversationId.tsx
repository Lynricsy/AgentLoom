import { createRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { rootRoute } from '../__root';
import { AgentConversationPage } from '@/features/agent-conversation/components/AgentConversationPage';

function ConversationPageWrapper() {
  const { agentId, conversationId } = agentConversationRoute.useParams();
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate({ to: '/agents/$agentId', params: { agentId } });
  }, [navigate, agentId]);

  return (
    <AgentConversationPage
      agentId={agentId}
      conversationId={conversationId}
      onBack={handleBack}
    />
  );
}

export const agentConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId/conversations/$conversationId',
  component: ConversationPageWrapper,
});
