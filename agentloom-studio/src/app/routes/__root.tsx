import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useAuthToken } from "@/features/execution";
import { useIsAuthenticated, useAuthLoading } from "@/features/auth";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { useNotificationSocket } from "@/features/notification";
import { AppSidebar } from "@/shared/components/app-sidebar";
import { SettingsLayout } from "@/shared/components/settings-layout";
import { indexRoute } from "./index";
import { workflowCanvasRoute } from "./workflows/$workflowId";
import { resourceKnowledgeBaseDetailRoute } from "./resources/knowledge-bases.$knowledgeBaseId";
import { executionDebugRoute } from "./executions/$executionId";
import { executionAgentViewerRoute } from "./executions/$executionId.steps.$stepId.agent";
import { settingsIndexRoute } from "./settings/index";
import { mcpServerDetailRoute } from "./resources/mcp-servers.$serverId";
import { auditLogsRoute } from "./settings/audit-logs";
import { templatesRoute } from "./templates";
import { generatedAppsRoute } from "./generated-apps";
import { discoverRoute } from "./discover";
import { marketplaceRoute } from "./marketplace";
import { marketplaceMyListingsRoute } from "./marketplace.my-listings";
import { shareTokenRoute } from "./share.$token";
import { encryptionSettingsRoute } from "./settings/encryption";
import { developerEarningsRoute } from "./developer-console/earnings";
import { organizationAutonomyPolicyRoute } from "./settings/security/autonomy-policy";
import { resourceGovernanceRoute } from "./settings/resource-quotas";
import { monitoringRoute } from "./settings/monitoring";
import { privateDeploymentRoute } from "./settings/private-deployment";
import { userPreferencesRoute } from "./settings/preferences";
import { securitySettingsRoute } from "./settings/security";
import { authCallbackRoute } from "./auth/callback";
import { loginRoute } from "./auth/login";
import { registerRoute } from "./auth/register";
import { onboardingRoute } from "./onboarding";
import { workflowsIndexRoute } from "./workflows/workflows.index";
import { agentsIndexRoute } from "./agents/agents.index";
import { agentDetailRoute } from "./agents/agents.$agentId";
import { agentNewConversationRoute } from "./agents/agents.$agentId.conversations.new";
import { agentConversationRoute } from "./agents/agents.$agentId.conversations.$conversationId";
import { memoryRoute } from "./memory";
import { memoryDetailRoute } from "./memory.$id";
import { memorySettingsRoute } from "./memory.$id.settings";
import { memoryGraphRoute } from "./memory.$id.graph";
import { memoryAuditRoute } from "./memory.$id.audit";
import { skillsRoute } from "./skills";
import { mcpServersRoute } from "./resources/mcp-servers";
import { llmModelsRoute } from "./resources/llm-models";
import { resourceSkillsRoute } from "./resources/skills";
import { resourceKnowledgeBasesRoute } from "./resources/knowledge-bases";
import { memoryInstancesRoute } from "./resources/memory-instances";
import { workspacesRoute } from "./resources/workspaces";
import { workspaceDetailRoute } from "./resources/workspaces.$workspaceId";
import { sandboxesRoute } from "./resources/sandboxes";
import { memoryInstanceBrowseRoute } from "./resources/memory-instances.$instanceId.browse";

const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback"];

export function RootLayout() {
  const authToken = useAuthToken();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);

  useNotificationSocket({ authToken });

  const pathname = window.location.pathname;
  const isPublicRoute =
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/s/");
  const isOnboardingRoute = pathname.startsWith("/onboarding");

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

  // 认证用户需要完成 onboarding → 重定向到 /onboarding
  if (isAuthenticated && needsOnboarding && !isOnboardingRoute) {
    window.location.href = "/onboarding";
    return null;
  }

  // 已完成 onboarding 的用户不应停留在 /onboarding
  if (isAuthenticated && !needsOnboarding && isOnboardingRoute) {
    window.location.href = "/";
    return null;
  }

  if (isPublicRoute || isOnboardingRoute) {
    return <Outlet />;
  }

  const isSettingsRoute = pathname.startsWith("/settings");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {isSettingsRoute ? <SettingsLayout /> : <AppSidebar />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowsIndexRoute,
  workflowCanvasRoute,
  executionDebugRoute,
  executionAgentViewerRoute,
  settingsIndexRoute,
  auditLogsRoute,
  templatesRoute,
  generatedAppsRoute,
  discoverRoute,
  marketplaceRoute,
  marketplaceMyListingsRoute,
  shareTokenRoute,
  encryptionSettingsRoute,
  developerEarningsRoute,
  organizationAutonomyPolicyRoute,
  resourceGovernanceRoute,
  monitoringRoute,
  privateDeploymentRoute,
  userPreferencesRoute,
  securitySettingsRoute,
  authCallbackRoute,
  loginRoute,
  registerRoute,
  onboardingRoute,
  agentsIndexRoute,
  agentDetailRoute,
  agentNewConversationRoute,
  agentConversationRoute,
  memoryRoute,
  memoryDetailRoute,
  memorySettingsRoute,
  memoryGraphRoute,
  memoryAuditRoute,
  skillsRoute,
  mcpServersRoute,
  mcpServerDetailRoute,
  llmModelsRoute,
  resourceSkillsRoute,
  resourceKnowledgeBasesRoute,
  resourceKnowledgeBaseDetailRoute,
  memoryInstancesRoute,
  workspacesRoute,
  workspaceDetailRoute,
  sandboxesRoute,
  memoryInstanceBrowseRoute,
]);
