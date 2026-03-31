import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const testEnvConfig = EnvConfig(
    studioBaseUrl: 'http://localhost:3000',
    appName: 'AgentLoom Test',
    environment: AppEnvironment.dev,
  );

  ProviderContainer createTestContainer() {
    return ProviderContainer(
      overrides: [
        baseEnvProvider.overrideWithValue(testEnvConfig),
        tokenStorageProvider.overrideWithValue(_TestTokenStorage()),
      ],
    );
  }

  Widget createTestApp({ProviderContainer? container}) {
    if (container != null) {
      return UncontrolledProviderScope(
        container: container,
        child: const AgentLoomApp(),
      );
    }

    return ProviderScope(
      overrides: [
        baseEnvProvider.overrideWithValue(testEnvConfig),
        tokenStorageProvider.overrideWithValue(_TestTokenStorage()),
      ],
      child: const AgentLoomApp(),
    );
  }

  group('GoRouter configuration', () {
    testWidgets('initial location is /dashboard', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
    });

    testWidgets('goRouterProvider returns GoRouter instance', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      final router = container.read(goRouterProvider);
      expect(router, isNotNull);
      expect(router.routeInformationProvider.value.uri.path, '/dashboard');
    });

    testWidgets('can navigate to /workflows', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('工作流'));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(AppBar, 'Workflows'), findsOneWidget);
    });

    testWidgets('can navigate to /settings', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('设置'));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(AppBar, '设置'), findsOneWidget);
    });

    testWidgets('can navigate back to /dashboard from /workflows', (
      tester,
    ) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      // Go to workflows
      await tester.tap(find.text('工作流'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Workflows'), findsOneWidget);

      // Go back to dashboard
      await tester.tap(find.text('总览'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
    });

    testWidgets('bottom nav highlight syncs after navigation', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      // 初始状态: Dashboard (index 0) 被选中
      var navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 0);

      // 点击 Workflows tab
      await tester.tap(find.text('工作流'));
      await tester.pumpAndSettle();

      // 验证选中索引同步为 1
      navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 1);

      // 点击 Settings tab
      await tester.tap(find.text('设置'));
      await tester.pumpAndSettle();

      // 验证选中索引同步为 4 (总览=0, 工作流=1, Agent=2, 资源=3, 设置=4)
      navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 4);
    });

    testWidgets('bottom nav highlight syncs after programmatic navigation', (
      tester,
    ) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(createTestApp(container: container));
      await tester.pumpAndSettle();

      final router = container.read(goRouterProvider);
      router.go('/workflows');
      await tester.pumpAndSettle();

      final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 1);
      expect(find.widgetWithText(AppBar, 'Workflows'), findsOneWidget);
      expect(router.routeInformationProvider.value.uri.path, '/workflows');
    });

    testWidgets('repeated tap on same tab stays on current screen', (
      tester,
    ) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(createTestApp(container: container));
      await tester.pumpAndSettle();

      final router = container.read(goRouterProvider);

      // 先导航到 Workflows
      await tester.tap(find.text('工作流'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Workflows'), findsOneWidget);
      expect(router.routeInformationProvider.value.uri.path, '/workflows');

      // 再次点击工作流（重复点击）— 使用 NavBar 内的标签避免与 AppBar 冲突
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('工作流'),
        ),
      );
      await tester.pumpAndSettle();

      // 应仍停留在 Workflows 页面
      expect(find.widgetWithText(AppBar, 'Workflows'), findsOneWidget);
      expect(router.routeInformationProvider.value.uri.path, '/workflows');
    });
  });

  group('deep link — auth callback', () {
    test('authCallback route name constant is correct', () {
      expect(RouteNames.authCallback, equals('authCallback'));
    });

    test('auth callback deep link route is registered in GoRouter', () {
      final container = createTestContainer();
      addTearDown(container.dispose);

      final router = container.read(goRouterProvider);

      // namedLocation は route が登録されていない場合 GoException を throw する
      // → これが通れば /auth/callback ルートが正しく登録されている証明
      final location = router.namedLocation(RouteNames.authCallback);
      expect(location, equals('/auth/callback'));
    });

    test(
      'auth callback route generates correct location with query params',
      () {
        final container = createTestContainer();
        addTearDown(container.dispose);

        final router = container.read(goRouterProvider);

        final location = router.namedLocation(
          RouteNames.authCallback,
          queryParameters: {
            'access_token': 'test_access',
            'refresh_token': 'test_refresh',
          },
        );

        expect(location, contains('/auth/callback'));
        expect(location, contains('access_token=test_access'));
        expect(location, contains('refresh_token=test_refresh'));
      },
    );
  });
}

class _TestTokenStorage extends TokenStorage {
  _TestTokenStorage() : super(const FlutterSecureStorage());

  static const AuthTokens _tokens = AuthTokens(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  );

  @override
  Future<bool> hasTokens() async => true;

  @override
  Future<AuthTokens?> readTokens() async => _tokens;

  @override
  Future<void> saveTokens(AuthTokens tokens) async {}

  @override
  Future<void> clearTokens() async {}
}
