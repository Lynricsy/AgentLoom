import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/settings/api/settings_api.dart';
import 'package:agentloom_mobile/features/settings/providers/settings_provider.dart';
import 'package:agentloom_mobile/features/settings/screens/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;

  Future<void> scrollToVisible(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(
      finder,
      240,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
  }

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();
  });

  Widget buildTestWidget() {
    return ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
        // 覆盖 securityInfoProvider，避免在测试中发起真实 API 请求
        securityInfoProvider.overrideWith(_EmptySecurityInfoNotifier.new),
      ],
      child: const MaterialApp(home: SettingsScreen()),
    );
  }

  group('SettingsScreen 渲染', () {
    testWidgets('渲染 AppBar 标题和安全分区', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('设置'), findsOneWidget);
      expect(find.text('安全'), findsOneWidget);
    });

    testWidgets('渲染安全分区三个菜单项', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('修改密码'), findsOneWidget);
      expect(find.text('双因素认证'), findsOneWidget);
      expect(find.text('活跃会话'), findsOneWidget);
    });

    testWidgets('渲染安全分区的副标题', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('更新您的账户密码'), findsOneWidget);
      expect(find.text('管理 TOTP 两步验证'), findsOneWidget);
      expect(find.text('查看和管理已登录设备'), findsOneWidget);
    });

    testWidgets('渲染账户分区和退出登录', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await scrollToVisible(tester, find.text('账户'));
      expect(find.text('账户'), findsOneWidget);
      expect(find.text('退出登录'), findsOneWidget);
    });

    testWidgets('渲染账户分区的退出所有设备', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await scrollToVisible(tester, find.text('退出所有设备'));
      expect(find.text('退出所有设备'), findsOneWidget);
      expect(find.text('在所有已登录设备上退出'), findsOneWidget);
    });

    testWidgets('渲染安全相关图标', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await scrollToVisible(tester, find.byIcon(Icons.logout));
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.byIcon(Icons.security_outlined), findsOneWidget);
      expect(find.byIcon(Icons.logout), findsOneWidget);
      // devices_outlined 出现两次：安全分区的"活跃会话"和账户分区的"退出所有设备"
      expect(find.byIcon(Icons.devices_outlined), findsNWidgets(2));
    });

    testWidgets('使用 ListView 实现可滚动', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(ListView), findsOneWidget);
    });
  });

  group('SettingsScreen 退出登录', () {
    testWidgets('点击退出登录显示确认对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await scrollToVisible(tester, find.text('退出登录'));
      await tester.tap(find.text('退出登录'));
      await tester.pumpAndSettle();

      expect(find.text('确认退出'), findsOneWidget);
      expect(find.text('确定要退出登录吗？'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('退出'), findsOneWidget);
    });

    testWidgets('点击取消关闭对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await scrollToVisible(tester, find.text('退出登录'));
      await tester.tap(find.text('退出登录'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(find.text('确认退出'), findsNothing);
    });
  });
}

/// 返回空安全信息的 SecurityInfoNotifier（用于测试）
class _EmptySecurityInfoNotifier extends SecurityInfoNotifier {
  @override
  Future<SecurityInfo> build() async {
    return const SecurityInfo(mfaEnabled: false);
  }
}
