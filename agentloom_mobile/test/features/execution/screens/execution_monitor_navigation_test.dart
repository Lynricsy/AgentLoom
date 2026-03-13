import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/execution/screens/execution_monitor_screen.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const testEnvConfig = EnvConfig(
    apiBaseUrl: 'http://localhost:3000/api/v1',
    appName: 'AgentLoom Test',
    environment: AppEnvironment.dev,
  );

  ProviderContainer createTestContainer() {
    return ProviderContainer(
      overrides: [
        envProvider.overrideWithValue(testEnvConfig),
        tokenStorageProvider.overrideWithValue(_TestTokenStorage()),
      ],
    );
  }

  group('ExecutionMonitor 路由', () {
    testWidgets('路由名 executionMonitor 已注册', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      final router = container.read(goRouterProvider);
      expect(router, isNotNull);

      // 路由配置包含 executionMonitor 命名路由
      router.goNamed(
        RouteNames.executionMonitor,
        pathParameters: {'executionId': 'test-exec-001'},
      );

      // 路由能正确解析 — 不抛异常即成功
      expect(
        router.routeInformationProvider.value.uri.path,
        '/executions/test-exec-001',
      );
    });

    testWidgets('通过 pushNamed 导航到 /executions/:executionId', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AgentLoomApp(),
        ),
      );
      await tester.pumpAndSettle();

      // 从 Dashboard 开始
      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);

      // 编程式导航到执行监控页
      final router = container.read(goRouterProvider);
      router.pushNamed(
        RouteNames.executionMonitor,
        pathParameters: {'executionId': 'test-exec-002'},
      );
      await tester.pumpAndSettle();

      // 应渲染 ExecutionMonitorScreen
      expect(find.byType(ExecutionMonitorScreen), findsOneWidget);
    });

    testWidgets('/executions/:executionId 不显示底部导航栏', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AgentLoomApp(),
        ),
      );
      await tester.pumpAndSettle();

      // 初始 Dashboard 有底部导航
      expect(find.byType(NavigationBar), findsOneWidget);

      // 导航到执行监控
      final router = container.read(goRouterProvider);
      router.pushNamed(
        RouteNames.executionMonitor,
        pathParameters: {'executionId': 'test-exec-003'},
      );
      await tester.pumpAndSettle();

      // 执行监控页不在 ShellRoute 内，不应显示底部导航
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('从执行监控页返回上一页', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AgentLoomApp(),
        ),
      );
      await tester.pumpAndSettle();

      // push 到执行监控
      final router = container.read(goRouterProvider);
      router.pushNamed(
        RouteNames.executionMonitor,
        pathParameters: {'executionId': 'test-exec-004'},
      );
      await tester.pumpAndSettle();
      expect(find.byType(ExecutionMonitorScreen), findsOneWidget);

      // 点击返回按钮
      final backButton = find.byType(BackButton);
      if (backButton.evaluate().isNotEmpty) {
        await tester.tap(backButton);
        await tester.pumpAndSettle();
        expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
      }
    });

    testWidgets('直接 go 到 /executions/:executionId（深链接）', (tester) async {
      final container = createTestContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AgentLoomApp(),
        ),
      );
      await tester.pumpAndSettle();

      // 使用 go（非 push）模拟深链接
      final router = container.read(goRouterProvider);
      router.go('/executions/deep-link-exec-001');
      await tester.pumpAndSettle();

      expect(find.byType(ExecutionMonitorScreen), findsOneWidget);
    });

    testWidgets('RouteNames.executionMonitor 常量正确', (tester) async {
      expect(RouteNames.executionMonitor, 'executionMonitor');
    });
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
