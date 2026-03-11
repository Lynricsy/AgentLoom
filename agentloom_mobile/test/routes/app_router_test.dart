import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget createTestApp() {
    return ProviderScope(
      overrides: [
        envProvider.overrideWithValue(
          const EnvConfig(
            apiBaseUrl: 'http://localhost:3000/api/v1',
            appName: 'AgentLoom Test',
            environment: AppEnvironment.dev,
          ),
        ),
      ],
      child: const AgentLoomApp(),
    );
  }

  group('GoRouter configuration', () {
    testWidgets('initial location is /dashboard', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      expect(find.text('Dashboard (Coming Soon)'), findsOneWidget);
    });

    testWidgets('goRouterProvider returns GoRouter instance', (tester) async {
      final container = ProviderContainer(
        overrides: [
          envProvider.overrideWithValue(
            const EnvConfig(
              apiBaseUrl: 'http://localhost:3000/api/v1',
              appName: 'AgentLoom Test',
              environment: AppEnvironment.dev,
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final router = container.read(goRouterProvider);
      expect(router, isNotNull);
      expect(router.routeInformationProvider.value.uri.path, '/dashboard');
    });

    testWidgets('can navigate to /workflows', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();

      expect(find.text('Workflows (Coming Soon)'), findsOneWidget);
    });

    testWidgets('can navigate to /settings', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      expect(find.text('Settings (Coming Soon)'), findsOneWidget);
    });

    testWidgets('can navigate back to /dashboard from /workflows', (
      tester,
    ) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      // Go to workflows
      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();
      expect(find.text('Workflows (Coming Soon)'), findsOneWidget);

      // Go back to dashboard
      await tester.tap(find.text('Dashboard'));
      await tester.pumpAndSettle();
      expect(find.text('Dashboard (Coming Soon)'), findsOneWidget);
    });

    testWidgets('bottom nav highlight syncs after navigation', (tester) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      // 初始状态: Dashboard (index 0) 被选中
      var navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 0);

      // 点击 Workflows tab
      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();

      // 验证选中索引同步为 1
      navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 1);

      // 点击 Settings tab
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();

      // 验证选中索引同步为 2
      navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.selectedIndex, 2);
    });

    testWidgets('repeated tap on same tab stays on current screen', (
      tester,
    ) async {
      await tester.pumpWidget(createTestApp());
      await tester.pumpAndSettle();

      // 先导航到 Workflows
      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();
      expect(find.text('Workflows (Coming Soon)'), findsOneWidget);

      // 再次点击 Workflows（重复点击）
      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();

      // 应仍停留在 Workflows 页面
      expect(find.text('Workflows (Coming Soon)'), findsOneWidget);
    });
  });
}
