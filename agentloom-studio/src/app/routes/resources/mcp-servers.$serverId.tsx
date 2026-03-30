import { createRoute } from '@tanstack/react-router';
import { McpServerDetailPage } from '@/features/mcp';
import { rootRoute } from '../__root';

export const mcpServerDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/mcp-servers/$serverId',
  component: () => {
    const { serverId } = mcpServerDetailRoute.useParams();
    return <McpServerDetailPage serverId={serverId} />;
  },
});
