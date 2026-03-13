import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/shell_scaffold.dart';
import '../features/auth/models/auth_state.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/auth/providers/token_storage_provider.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/settings/screens/settings_screen.dart';
import '../features/workflows/screens/workflow_detail_screen.dart';
import '../features/workflows/screens/workflows_screen.dart';
import 'route_names.dart';

/// 认证路由通知器 — 桥接 Riverpod AuthNotifier 与 GoRouter refreshListenable
class AuthRouteNotifier extends ChangeNotifier {
  AuthRouteNotifier(this._ref) {
    _ref.listen(authProvider, (_, __) {
      notifyListeners();
    });
  }

  final Ref _ref;
}

/// GoRouter 配置 Provider
final goRouterProvider = Provider<GoRouter>((ref) {
  final authRouteNotifier = AuthRouteNotifier(ref);

  return GoRouter(
    initialLocation: '/dashboard',
    refreshListenable: authRouteNotifier,
    redirect: (context, state) async {
      final hasTokens = await ref.read(tokenStorageProvider).hasTokens();
      final authState = ref.read(authProvider);
      final isAuthenticated =
          hasTokens || authState.value is AuthStateAuthenticated;
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
});
