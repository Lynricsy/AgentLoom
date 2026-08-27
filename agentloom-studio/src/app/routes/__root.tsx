import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useAuthToken } from "@/features/execution";
import { useIsAuthenticated, useAuthLoading } from "@/features/auth";
import { useAuthStore } from "@/features/auth";
import { useNotificationSocket } from "@/features/notification";
import { AppSidebar, MobileTopBar } from "@/shared/components/app-sidebar";
import { CommandPalette } from "@/shared/components/command-palette/CommandPalette";
import { SettingsLayout } from "@/shared/components/settings-layout";
import { useMediaQuery, LG_QUERY } from "@/shared/hooks/use-media-query";
import { cn } from "@/shared/lib/utils";
import { indexRoute } from "./index";
import { workflowCanvasRoute } from "./workflows/$workflowId";
import { resourceKnowledgeBaseDetailRoute } from "./resources/knowledge-bases.$knowledgeBaseId";
import { executionDebugRoute } from "./executions/$executionId";
import { executionAgentViewerRoute } from "./executions/$executionId.steps.$stepId.agent";
import { settingsIndexRoute } from "./settings/index";
import { mcpServerDetailRoute } from "./resources/mcp-servers.$serverId";
import { auditLogsRoute } from "./settings/audit-logs";
import { apiTokensRoute } from "./settings/api-tokens";
import { templatesRoute } from "./templates";
import { generatedAppsRoute } from "./generated-apps";
import { generatedAppDetailRoute } from "./generated-apps.$appId";
import { generatedAppPublicRuntimeRoute } from "./generated-apps.public.$token";
import { discoverRoute } from "./discover";
import { marketplaceRoute } from "./marketplace";
import { marketplaceMyListingsRoute } from "./marketplace.my-listings";
import { shareTokenRoute } from "./share.$token";
import { encryptionSettingsRoute } from "./settings/encryption";
import { developerEarningsRoute } from "./developer-console/earnings";
import { developerKeysRoute } from "./developer-console/keys";
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
import { pluginsRoute } from "./resources/plugins";
import { pluginUsageRoute } from "./resources/plugins.$pluginId.usage";
import { memoryInstanceBrowseRoute } from "./resources/memory-instances.$instanceId.browse";
import { organizationSettingsRoute } from "./settings/organization";
import { acceptInvitationRoute } from "./invitations.$token";
import { notificationPreferencesRoute } from "./settings/notifications";
import { notificationCenterRoute } from "./notifications";

const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback"];
const PUBLIC_ROUTE_PREFIXES = ["/s/", "/generated-apps/public/"];

export function RootLayout() {
  const authToken = useAuthToken();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  // 壳层按视口二选一挂载：同时挂载会出现两个 NotificationBell，
  // 而它的展开状态在全局 store 上，两个实例的外部点击监听会互相关掉下拉。
  const isDesktop = useMediaQuery(LG_QUERY);

  const pathname = window.location.pathname;
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((r) => pathname.startsWith(r));
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  useNotificationSocket({ authToken: isPublicRoute ? undefined : authToken });

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

  // onboarding 完成后的离开必须由向导在偏好步骤结束时决定，避免租户刷新抢跑最后一步。

  if (isPublicRoute || isOnboardingRoute) {
    return <Outlet />;
  }

  const isSettingsRoute = pathname.startsWith("/settings");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {isSettingsRoute ? (
        <SettingsLayout />
      ) : isDesktop ? (
        <AppSidebar />
      ) : null}
      {/* 仅 settings 路由需要 56px 顶部让位：SettingsLayout 小屏是 fixed 顶部条，
          已退出流式布局，不占据高度；非 settings 路由的 MobileTopBar 是流内 h-14
          元素，会自然占位，再加内距就会多出 56px 空白。≥lg 两者都是流内侧栏，无需补偿。 */}
      <div className={cn("flex min-w-0 flex-1 flex-col", isSettingsRoute && "pt-14 lg:pt-0")}>
        {isSettingsRoute || isDesktop ? null : <MobileTopBar />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
      <CommandPalette />
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
  apiTokensRoute,
  templatesRoute,
  generatedAppsRoute,
  generatedAppDetailRoute,
  generatedAppPublicRuntimeRoute,
  discoverRoute,
  marketplaceRoute,
  marketplaceMyListingsRoute,
  shareTokenRoute,
  encryptionSettingsRoute,
  developerEarningsRoute,
  developerKeysRoute,
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
  pluginsRoute,
  pluginUsageRoute,
  memoryInstanceBrowseRoute,
  organizationSettingsRoute,
  acceptInvitationRoute,
  notificationPreferencesRoute,
  notificationCenterRoute,
]);
