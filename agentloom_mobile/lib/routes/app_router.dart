import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/shell_scaffold.dart';
import '../features/agents/screens/agent_conversation_screen.dart';
import '../features/agents/screens/agent_detail_screen.dart';
import '../features/agents/screens/agent_list_screen.dart';
import '../features/auth/models/auth_state.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/auth/screens/auth_callback_screen.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/mfa_enroll_screen.dart';
import '../features/auth/screens/mfa_verify_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/execution/screens/execution_monitor_screen.dart';
import '../features/memory/models/memory_audit_entry.dart';
import '../features/memory/providers/memory_providers.dart';
import '../features/memory/screens/memory_audit_detail_screen.dart';
import '../features/memory/screens/memory_audit_screen.dart';
import '../features/memory/screens/memory_detail_screen.dart';
import '../features/memory/screens/memory_list_screen.dart';
import '../features/memory/screens/memory_node_screen.dart';
import '../features/resources/screens/knowledge_bases_screen.dart';
import '../features/resources/screens/llm_models_screen.dart';
import '../features/resources/screens/mcp_servers_screen.dart';
import '../features/resources/screens/resources_hub_screen.dart';
import '../features/resources/screens/sandboxes_screen.dart';
import '../features/resources/screens/workspaces_screen.dart';
import '../features/settings/screens/change_password_screen.dart';
import '../features/settings/screens/mfa_manage_screen.dart';
import '../features/settings/screens/server_config_screen.dart';
import '../features/settings/screens/session_list_screen.dart';
import '../features/settings/screens/settings_screen.dart';
import '../features/skills/screens/skill_detail_screen.dart';
import '../features/skills/screens/skill_edit_screen.dart';
import '../features/skills/screens/skill_list_screen.dart';
import '../features/workflows/screens/parameter_input_screen.dart';
import '../features/workflows/screens/workflow_detail_screen.dart';
import '../features/workflows/screens/workflows_screen.dart';
import 'route_names.dart';

/// 认证路由通知器 — 桥接 Riverpod AuthNotifier 与 GoRouter refreshListenable
class AuthRouteNotifier extends ChangeNotifier {
  AuthRouteNotifier(this._ref) {
    _subscription = _ref.listen(authProvider, (_, __) {
      notifyListeners();
    });
  }

  final Ref _ref;
  late final ProviderSubscription<AsyncValue<AuthState>> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

/// GoRouter 配置 Provider
final goRouterProvider = Provider<GoRouter>((ref) {
  final authRouteNotifier = AuthRouteNotifier(ref);
  ref.onDispose(authRouteNotifier.dispose);

  final router = GoRouter(
    initialLocation: '/dashboard',
    refreshListenable: authRouteNotifier,
    redirect: (context, state) async {
      final authState = await ref.read(authProvider.future);
      final isAuthenticated = authState is AuthStateAuthenticated;
      final path = state.uri.path;
      final isLoginRoute = path == '/login';
      final isAuthCallbackRoute = path == '/auth/callback';
      final isServerConfigRoute = path == '/server-config';
      final isMfaRoute = path == '/mfa-verify' || path == '/mfa-enroll';

      if (!isAuthenticated &&
          !isLoginRoute &&
          !isAuthCallbackRoute &&
          !isServerConfigRoute &&
          !isMfaRoute) {
        return '/login';
      }

      if (isAuthenticated && isLoginRoute) {
        return '/dashboard';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/server-config',
        name: RouteNames.serverConfig,
        builder: (context, state) => const ServerConfigScreen(),
      ),
      GoRoute(
        path: '/executions/:executionId',
        name: RouteNames.executionMonitor,
        builder: (context, state) {
          final executionId = state.pathParameters['executionId']!;
          return ExecutionMonitorScreen(executionId: executionId);
        },
      ),
      GoRoute(
        path: '/agents/:agentId/conversations/:conversationId',
        name: RouteNames.agentConversation,
        builder: (context, state) {
          final agentId = state.pathParameters['agentId']!;
          final conversationId = state.pathParameters['conversationId']!;
          return AgentConversationScreen(
            agentId: agentId,
            conversationId: conversationId,
          );
        },
      ),
      GoRoute(
        path: '/auth/callback',
        name: RouteNames.authCallback,
        builder: (context, state) {
          final accessToken = state.uri.queryParameters['access_token'];
          final refreshToken = state.uri.queryParameters['refresh_token'];
          return AuthCallbackScreen(
            accessToken: accessToken,
            refreshToken: refreshToken,
          );
        },
      ),
      GoRoute(
        path: '/mfa-verify',
        name: RouteNames.mfaVerify,
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return MfaVerifyScreen(
            mfaToken: extra['mfaToken'] as String? ?? '',
            factors: (extra['factors'] as List<Map<String, dynamic>>?) ?? [],
          );
        },
      ),
      GoRoute(
        path: '/mfa-enroll',
        name: RouteNames.mfaEnroll,
        builder: (context, state) => const MfaEnrollScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ShellScaffold(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/dashboard',
                name: RouteNames.dashboard,
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/workflows',
                name: RouteNames.workflows,
                builder: (context, state) => const WorkflowsScreen(),
                routes: [
                  GoRoute(
                    path: ':workflowId',
                    name: RouteNames.workflowDetail,
                    builder: (context, state) {
                      final workflowId = state.pathParameters['workflowId']!;
                      return WorkflowDetailScreen(workflowId: workflowId);
                    },
                    routes: [
                      GoRoute(
                        path: 'launch',
                        name: RouteNames.workflowLaunch,
                        builder: (context, state) {
                          final workflowId =
                              state.pathParameters['workflowId']!;
                          final workflowName =
                              state.uri.queryParameters['name'] ?? 'Workflow';
                          return ParameterInputScreen(
                            workflowId: workflowId,
                            workflowName: workflowName,
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/agents',
                name: RouteNames.agents,
                builder: (context, state) => const AgentListScreen(),
                routes: [
                  GoRoute(
                    path: ':agentId',
                    name: RouteNames.agentDetail,
                    builder: (context, state) {
                      final agentId = state.pathParameters['agentId']!;
                      return AgentDetailScreen(agentId: agentId);
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/resources',
                name: RouteNames.resources,
                builder: (context, state) => const ResourcesHubScreen(),
                routes: [
                  GoRoute(
                    path: 'skills',
                    name: RouteNames.skills,
                    builder: (context, state) => const SkillListScreen(),
                    routes: [
                      GoRoute(
                        path: ':skillId',
                        name: RouteNames.skillDetail,
                        builder: (context, state) {
                          final skillId = state.pathParameters['skillId']!;
                          return SkillDetailScreen(skillId: skillId);
                        },
                        routes: [
                          GoRoute(
                            path: 'edit',
                            name: RouteNames.skillEdit,
                            builder: (context, state) {
                              final skillId = state.pathParameters['skillId']!;
                              return SkillEditScreen(skillId: skillId);
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'memory',
                    name: RouteNames.memoryList,
                    builder: (context, state) => const MemoryListScreen(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        name: RouteNames.memoryDetail,
                        builder: (context, state) {
                          final id = state.pathParameters['id']!;
                          return MemoryDetailScreen(instanceId: id);
                        },
                        routes: [
                          GoRoute(
                            path: 'nodes/:nodeId',
                            name: RouteNames.memoryNode,
                            builder: (context, state) {
                              final id = state.pathParameters['id']!;
                              final nodeId = state.pathParameters['nodeId']!;
                              return MemoryNodeScreen(
                                instanceId: id,
                                nodeId: nodeId,
                              );
                            },
                          ),
                          GoRoute(
                            path: 'audit',
                            name: RouteNames.memoryAudit,
                            builder: (context, state) {
                              final id = state.pathParameters['id']!;
                              return ProviderScope(
                                overrides: [
                                  memoryAuditInstanceIdProvider
                                      .overrideWithValue(id),
                                ],
                                child: MemoryAuditScreen(instanceId: id),
                              );
                            },
                            routes: [
                              GoRoute(
                                path: ':entryId',
                                name: RouteNames.memoryAuditDetail,
                                builder: (context, state) {
                                  final id = state.pathParameters['id']!;
                                  final entryId =
                                      state.pathParameters['entryId']!;
                                  final entry =
                                      state.extra as MemoryAuditEntryDto?;
                                  return MemoryAuditDetailScreen(
                                    instanceId: id,
                                    entryId: entryId,
                                    entry: entry,
                                  );
                                },
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'workspaces',
                    name: RouteNames.workspaces,
                    builder: (context, state) => const WorkspacesScreen(),
                  ),
                  GoRoute(
                    path: 'sandboxes',
                    name: RouteNames.sandboxes,
                    builder: (context, state) => const SandboxesScreen(),
                  ),
                  GoRoute(
                    path: 'knowledge-bases',
                    name: RouteNames.knowledgeBases,
                    builder: (context, state) => const KnowledgeBasesScreen(),
                  ),
                  GoRoute(
                    path: 'mcp-servers',
                    name: RouteNames.mcpServers,
                    builder: (context, state) => const McpServersScreen(),
                  ),
                  GoRoute(
                    path: 'llm-models',
                    name: RouteNames.llmModels,
                    builder: (context, state) => const LlmModelsScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                name: RouteNames.settings,
                builder: (context, state) => const SettingsScreen(),
                routes: [
                  GoRoute(
                    path: 'change-password',
                    name: RouteNames.changePassword,
                    builder: (context, state) => const ChangePasswordScreen(),
                  ),
                  GoRoute(
                    path: 'mfa',
                    name: RouteNames.mfaManage,
                    builder: (context, state) => const MfaManageScreen(),
                  ),
                  GoRoute(
                    path: 'sessions',
                    name: RouteNames.sessions,
                    builder: (context, state) => const SessionListScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );

  ref.onDispose(router.dispose);
  return router;
});
