import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "../__root";
import { ConversationSidebar } from "@/features/agent-conversation";
import { NewConversationDraftPage } from "@/features/agent-conversation";

function NewConversationPage() {
  const { agentId } = agentNewConversationRoute.useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate({ to: "/agents" });
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar agentId={agentId} currentConversationId={null} />
      <div className="min-w-0 flex-1">
        <NewConversationDraftPage agentId={agentId} onBack={handleBack} />
      </div>
    </div>
  );
}

export const agentNewConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId/conversations/new",
  component: NewConversationPage,
});
