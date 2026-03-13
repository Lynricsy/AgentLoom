import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/shell_scaffold.dart';
import '../features/auth/models/auth_state.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/execution/screens/execution_monitor_screen.dart';
import '../features/settings/screens/settings_screen.dart';
import '../features/workflows/screens/workflow_detail_screen.dart';
import '../features/workflows/screens/parameter_input_screen.dart';
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
      final isLoginRoute = state.uri.path == '/login';

      if (!isAuthenticated && !isLoginRoute) return '/login';
      if (isAuthenticated && isLoginRoute) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/executions/:executionId',
        name: RouteNames.executionMonitor,
        builder: (context, state) {
          final executionId = state.pathParameters['executionId']!;
          return ExecutionMonitorScreen(executionId: executionId);
        },
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
                path: '/settings',
                name: RouteNames.settings,
                builder: (context, state) => const SettingsScreen(),
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
