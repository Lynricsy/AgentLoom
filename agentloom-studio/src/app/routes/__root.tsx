import { Outlet, createRootRoute, Link } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useAuthToken } from "@/features/execution";
import { useIsAuthenticated, useAuthLoading } from "@/features/auth";
import {
  NotificationBell,
  useNotificationSocket,
} from "@/features/notification";
import { indexRoute } from "./index";
import { workflowCanvasRoute } from "./workflows/$workflowId";
import { knowledgeBasesRoute } from "./settings/knowledge-bases";
import { knowledgeBaseDetailRoute } from "./settings/knowledge-bases/$knowledgeBaseId";
import { executionDebugRoute } from "./executions/$executionId";
import { toolLibraryRoute } from "./settings/tool-library";
import { auditLogsRoute } from './settings/audit-logs'
import { templatesRoute } from "./templates";
import { marketplaceRoute } from "./marketplace";
import { marketplaceMyListingsRoute } from './marketplace.my-listings';
import { shareTokenRoute } from './share.$token';
import { encryptionSettingsRoute } from './settings/encryption'
import { developerEarningsRoute } from './developer-console/earnings';
import { organizationAutonomyPolicyRoute } from './settings/security/autonomy-policy'
import { resourceGovernanceRoute } from './settings/resource-quotas'
import { monitoringRoute } from './settings/monitoring'
import { privateDeploymentRoute } from './settings/private-deployment'
import { securitySettingsRoute } from './settings/security'
import { authCallbackRoute } from './auth/callback'
import { loginRoute } from './auth/login'
import { registerRoute } from './auth/register'
import { agentsIndexRoute } from './agents/agents.index'
import { agentDetailRoute } from './agents/agents.$agentId'
import { agentNewConversationRoute } from './agents/agents.$agentId.conversations.new'
import { agentConversationRoute } from './agents/agents.$agentId.conversations.$conversationId'
import { memoryRoute } from './memory'
import { memoryDetailRoute } from './memory.$id'
import { memorySettingsRoute } from './memory.$id.settings'
import { memoryGraphRoute } from './memory.$id.graph'
import { memoryAuditRoute } from './memory.$id.audit'

const PUBLIC_ROUTES = ['/login', '/register', '/auth/callback'];

export function RootLayout() {
  const authToken = useAuthToken();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();

  useNotificationSocket({ authToken });

  const pathname = window.location.pathname;
  const isPublicRoute =
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith('/s/');

  if (isLoading && !isPublicRoute) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicRoute) {
    window.location.href = `/login?returnUrl=${encodeURIComponent(pathname)}`;
    return null;
  }

  if (isPublicRoute) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <nav className="flex items-center gap-1">
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId: "draft" }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              工作流
            </Link>
            <Link
              to="/agents"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              Agent
            </Link>
            <Link
              to="/templates"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              模板
            </Link>
            <Link
              to="/marketplace"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              市场
            </Link>
            <Link
              to="/settings/tool-library"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              工具库
            </Link>
            <Link
              to="/developer-console/earnings"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              收益
            </Link>
            <Link
              to="/memory"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              记忆
            </Link>
          </nav>
          <NotificationBell />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>

      <TanStackRouterDevtools />
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowCanvasRoute,
  executionDebugRoute,
  knowledgeBasesRoute,
  knowledgeBaseDetailRoute,
  toolLibraryRoute,
  auditLogsRoute,
  templatesRoute,
  marketplaceRoute,
  marketplaceMyListingsRoute,
  shareTokenRoute,
  encryptionSettingsRoute,
  developerEarningsRoute,
  organizationAutonomyPolicyRoute,
  resourceGovernanceRoute,
  monitoringRoute,
  privateDeploymentRoute,
  securitySettingsRoute,
  authCallbackRoute,
  loginRoute,
  registerRoute,
  agentsIndexRoute,
  agentDetailRoute,
  agentNewConversationRoute,
  agentConversationRoute,
  memoryRoute,
  memoryDetailRoute,
  memorySettingsRoute,
  memoryGraphRoute,
  memoryAuditRoute,
]);
