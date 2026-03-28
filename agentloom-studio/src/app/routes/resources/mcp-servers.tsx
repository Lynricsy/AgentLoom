import { createRoute } from '@tanstack/react-router';
import { McpServerManagementPage } from '@/features/mcp';
import { rootRoute } from '../__root';

export const mcpServersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/mcp-servers',
  component: McpServerManagementPage,
});
