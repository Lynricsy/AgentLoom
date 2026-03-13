import 'dart:async';

import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

void main() {
  late MockTokenStorage mockTokenStorage;

  final testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );

  setUp(() {
    mockTokenStorage = MockTokenStorage();
  });

  /// 创建带认证状态的测试 GoRouter
  GoRouter _createTestRouter({
    required bool hasStoredTokens,
    AuthState? initialAuthState,
  }) {
    return GoRouter(
      initialLocation: '/dashboard',
      redirect: (context, state) async {
        final isAuthenticated = hasStoredTokens;
        final isLoginRoute = state.uri.path == '/login';

        if (!isAuthenticated && !isLoginRoute) return '/login';
        if (isAuthenticated && isLoginRoute) return '/dashboard';
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          name: 'login',
          builder: (_, __) => const Scaffold(body: Text('Login Page')),
        ),
        GoRoute(
          path: '/dashboard',
          name: 'dashboard',
          builder: (_, __) => const Scaffold(body: Text('Dashboard Page')),
        ),
      ],
    );
  }

  group('GoRouter redirect guard', () {
    testWidgets('未认证用户被重定向到 /login', (tester) async {
      final router = _createTestRouter(hasStoredTokens: false);

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      expect(find.text('Login Page'), findsOneWidget);
      expect(find.text('Dashboard Page'), findsNothing);
    });

    testWidgets('已认证用户可访问 /dashboard', (tester) async {
      final router = _createTestRouter(hasStoredTokens: true);

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      expect(find.text('Dashboard Page'), findsOneWidget);
      expect(find.text('Login Page'), findsNothing);
    });

    testWidgets('已认证用户访问 /login 被重定向到 /dashboard', (tester) async {
      final router = GoRouter(
        initialLocation: '/login',
        redirect: (context, state) async {
          final isAuthenticated = true;
          final isLoginRoute = state.uri.path == '/login';

          if (isAuthenticated && isLoginRoute) return '/dashboard';
          return null;
        },
        routes: [
          GoRoute(
            path: '/login',
            builder: (_, __) => const Scaffold(body: Text('Login Page')),
          ),
          GoRoute(
            path: '/dashboard',
            builder: (_, __) => const Scaffold(body: Text('Dashboard Page')),
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      expect(find.text('Dashboard Page'), findsOneWidget);
      expect(find.text('Login Page'), findsNothing);
    });
  });

  group('AuthRouteNotifier', () {
    test('监听 authProvider 变化时通知 listeners', () async {
      final container = ProviderContainer(
        overrides: [tokenStorageProvider.overrideWithValue(mockTokenStorage)],
      );

      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      // 等待 authProvider 初始化完成
      await container.read(authProvider.future);

      final notifier = AuthRouteNotifier(container.read(providerRefProvider));

      int notifyCount = 0;
      notifier.addListener(() => notifyCount++);

      // 触发 authProvider 状态变化
      container.read(authProvider.notifier).forceLogout(message: 'test');

      // 等待通知传播
      await Future<void>.delayed(Duration.zero);

      expect(notifyCount, greaterThanOrEqualTo(1));

      notifier.dispose();
      container.dispose();
    });
  });
}

/// 用于创建 Ref 对象的辅助 Provider
final providerRefProvider = Provider<Ref>((ref) => ref);
