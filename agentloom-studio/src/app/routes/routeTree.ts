/**
 * 路由树。
 *
 * 必须与 `__root.tsx` 分开：子路由都要 `import { rootRoute } from './__root'`，
 * 若树也建在 `__root.tsx` 里，以任一子路由为入口时会形成循环导入，
 * 树构建时拿到的子路由是 undefined（pathless 父路由上调用 addChildren 会直接抛错）。
 */
import { indexRoute } from "./index";
import { workflowCanvasRoute } from "./workflows/$workflowId";
import { resourceKnowledgeBaseDetailRoute } from "./resources/knowledge-bases.$knowledgeBaseId";
import { executionDebugRoute } from "./executions/$executionId";
import { executionAgentViewerRoute } from "./executions/$executionId.steps.$stepId.agent";
import { settingsLayoutRoute } from "./settings/layout";
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
import { runtimePluginsRoute } from "./resources/runtime-plugins";
import { memoryInstanceBrowseRoute } from "./resources/memory-instances.$instanceId.browse";
import { organizationSettingsRoute } from "./settings/organization";
import { acceptInvitationRoute } from "./invitations.$token";
import { notificationPreferencesRoute } from "./settings/notifications";
import { notificationCenterRoute } from "./notifications";

import { rootRoute } from './__root'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowsIndexRoute,
  workflowCanvasRoute,
  executionDebugRoute,
  executionAgentViewerRoute,
  templatesRoute,
  generatedAppsRoute,
  generatedAppDetailRoute,
  generatedAppPublicRuntimeRoute,
  discoverRoute,
  marketplaceRoute,
  marketplaceMyListingsRoute,
  shareTokenRoute,
  developerEarningsRoute,
  developerKeysRoute,
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
  runtimePluginsRoute,
  memoryInstanceBrowseRoute,
  acceptInvitationRoute,
  notificationCenterRoute,
  // 设置区：pathless 父路由提供二级导航壳层，子路由保持绝对 path
  settingsLayoutRoute.addChildren([
    settingsIndexRoute,
    userPreferencesRoute,
    apiTokensRoute,
    notificationPreferencesRoute,
    organizationSettingsRoute,
    securitySettingsRoute,
    encryptionSettingsRoute,
    organizationAutonomyPolicyRoute,
    monitoringRoute,
    resourceGovernanceRoute,
    privateDeploymentRoute,
    auditLogsRoute,
  ]),
]);
