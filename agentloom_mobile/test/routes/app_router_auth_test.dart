import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/auth/screens/login_screen.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );
  const testEnvConfig = EnvConfig(
    apiBaseUrl: 'http://localhost:3000/api/v1',
    appName: 'AgentLoom Test',
    environment: AppEnvironment.dev,
  );

  ProviderContainer createContainer(TokenStorage tokenStorage) {
    return ProviderContainer(
      overrides: [
        envProvider.overrideWithValue(testEnvConfig),
        tokenStorageProvider.overrideWithValue(tokenStorage),
      ],
    );
  }

  Widget createApp(ProviderContainer container) {
    return UncontrolledProviderScope(
      container: container,
      child: const AgentLoomApp(),
    );
  }

  group('GoRouter redirect guard', () {
    testWidgets('未认证用户被重定向到 /login 且不显示 NavigationBar', (tester) async {
      final container = createContainer(
        _ConfigurableTokenStorage(tokens: null),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(createApp(container));
      await tester.pumpAndSettle();

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('已认证用户启动后进入 /dashboard 并显示 NavigationBar', (tester) async {
      final container = createContainer(
        _ConfigurableTokenStorage(tokens: testTokens),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(createApp(container));
      await tester.pumpAndSettle();

      expect(find.byType(LoginScreen), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
    });

    testWidgets('已认证用户访问 /login 被重定向到 /dashboard', (tester) async {
      final container = createContainer(
        _ConfigurableTokenStorage(tokens: testTokens),
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(createApp(container));
      await tester.pumpAndSettle();

      final router = container.read(goRouterProvider);
      router.go('/login');
      await tester.pumpAndSettle();

      expect(find.byType(LoginScreen), findsNothing);
      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
    });

    testWidgets('残缺 token 不会被误判为已认证', (tester) async {
      final container = createContainer(_InconsistentTokenStorage());
      addTearDown(container.dispose);

      await tester.pumpWidget(createApp(container));
      await tester.pumpAndSettle();

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });
  });

  group('AuthRouteNotifier', () {
    test('监听 authProvider 变化时通知 listeners', () async {
      final container = createContainer(
        _ConfigurableTokenStorage(tokens: null),
      );

      // 等待 authProvider 初始化完成
      await container.read(authProvider.future);

      final notifier = AuthRouteNotifier(container.read(providerRefProvider));

      int notifyCount = 0;
      notifier.addListener(() => notifyCount++);

      // 触发 authProvider 状态变化
      await container.read(authProvider.notifier).forceLogout(message: 'test');

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

class _ConfigurableTokenStorage extends TokenStorage {
  _ConfigurableTokenStorage({required this.tokens})
    : super(const FlutterSecureStorage());

  final AuthTokens? tokens;

  @override
  Future<bool> hasTokens() async => tokens != null;

  @override
  Future<AuthTokens?> readTokens() async => tokens;

  @override
  Future<void> saveTokens(AuthTokens tokens) async {}

  @override
  Future<void> clearTokens() async {}
}

class _InconsistentTokenStorage extends _ConfigurableTokenStorage {
  _InconsistentTokenStorage() : super(tokens: null);

  @override
  Future<bool> hasTokens() async => true;
}
