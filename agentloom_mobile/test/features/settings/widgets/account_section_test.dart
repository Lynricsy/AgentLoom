import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/settings/api/settings_api.dart';
import 'package:agentloom_mobile/features/settings/providers/settings_provider.dart';
import 'package:agentloom_mobile/features/settings/widgets/account_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();
  });

  /// 构建测试 Widget — 未认证状态，空安全信息
  Widget buildUnauthenticatedWidget() {
    return ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
        securityInfoProvider.overrideWith(_EmptySecurityInfoNotifier.new),
      ],
      child: const MaterialApp(home: Scaffold(body: AccountSection())),
    );
  }

  /// 构建测试 Widget — 已认证状态，带邮箱
  Widget buildAuthenticatedWidget({
    String email = 'user@example.com',
    List<String> linkedProviders = const [],
  }) {
    return ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
        authProvider.overrideWith(
          () => _AuthenticatedAuthNotifier(email: email),
        ),
        securityInfoProvider.overrideWith(
          () =>
              _LinkedProvidersSecurityInfoNotifier(providers: linkedProviders),
        ),
      ],
      child: const MaterialApp(home: Scaffold(body: AccountSection())),
    );
  }

  group('AccountSection 渲染', () {
    testWidgets('未认证时渲染账户分区标题', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      expect(find.text('账户'), findsOneWidget);
    });

    testWidgets('未认证时不显示邮箱', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      expect(find.text('邮箱'), findsNothing);
    });

    testWidgets('已认证时显示用户邮箱', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        buildAuthenticatedWidget(email: 'fox@example.com'),
      );
      await tester.pumpAndSettle();

      expect(find.text('邮箱'), findsOneWidget);
      expect(find.text('fox@example.com'), findsOneWidget);
    });

    testWidgets('无关联账号时不显示关联账号区域', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildAuthenticatedWidget(linkedProviders: []));
      await tester.pumpAndSettle();

      expect(find.text('关联账号'), findsNothing);
    });

    testWidgets('有关联账号时显示提供商名称', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        buildAuthenticatedWidget(linkedProviders: ['google', 'github']),
      );
      await tester.pumpAndSettle();

      expect(find.text('关联账号'), findsOneWidget);
      expect(find.text('Google'), findsOneWidget);
      expect(find.text('GitHub'), findsOneWidget);
    });

    testWidgets('渲染退出登录按钮', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      expect(find.text('退出登录'), findsOneWidget);
      expect(find.byIcon(Icons.logout), findsOneWidget);
    });

    testWidgets('渲染退出所有设备按钮', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      expect(find.text('退出所有设备'), findsOneWidget);
      expect(find.text('在所有已登录设备上退出'), findsOneWidget);
    });
  });

  group('AccountSection 退出登录交互', () {
    testWidgets('点击退出登录显示确认对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('退出登录'));
      await tester.pumpAndSettle();

      expect(find.text('确认退出'), findsOneWidget);
      expect(find.text('确定要退出登录吗？'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('退出'), findsOneWidget);
    });

    testWidgets('点击退出对话框的取消按钮关闭对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('退出登录'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(find.text('确认退出'), findsNothing);
    });
  });

  group('AccountSection 退出所有设备交互', () {
    testWidgets('点击退出所有设备显示确认对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('退出所有设备'));
      await tester.pumpAndSettle();

      expect(find.text('退出所有设备'), findsNWidgets(3)); // ListTile + 对话框标题 + 对话框按钮
      expect(find.text('确定要在所有设备上退出登录吗？此操作将注销所有活跃会话。'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
    });

    testWidgets('点击退出所有设备对话框的取消按钮关闭对话框', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildUnauthenticatedWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('退出所有设备'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(find.text('确定要在所有设备上退出登录吗？此操作将注销所有活跃会话。'), findsNothing);
    });
  });

  group('AccountSection 加载状态', () {
    testWidgets('revokeAll 加载中时显示 CircularProgressIndicator', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            securityInfoProvider.overrideWith(_EmptySecurityInfoNotifier.new),
            revokeAllSessionsProvider.overrideWith(
              _LoadingRevokeAllNotifier.new,
            ),
          ],
          child: const MaterialApp(home: Scaffold(body: AccountSection())),
        ),
      );

      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}

// ---------------------------------------------------------------------------
// 测试用辅助 Notifier
// ---------------------------------------------------------------------------

/// 返回空安全信息（无关联账号）的 SecurityInfoNotifier
class _EmptySecurityInfoNotifier extends SecurityInfoNotifier {
  @override
  Future<SecurityInfo> build() async {
    return const SecurityInfo(mfaEnabled: false);
  }
}

/// 返回指定关联账号列表的 SecurityInfoNotifier
class _LinkedProvidersSecurityInfoNotifier extends SecurityInfoNotifier {
  _LinkedProvidersSecurityInfoNotifier({required this.providers});
  final List<String> providers;

  @override
  Future<SecurityInfo> build() async {
    return SecurityInfo(mfaEnabled: false, linkedProviders: providers);
  }
}

/// 返回已认证状态的 AuthNotifier
class _AuthenticatedAuthNotifier extends AuthNotifier {
  _AuthenticatedAuthNotifier({required this.email});
  final String email;

  @override
  Future<AuthState> build() async {
    return AuthState.authenticated(
      user: LoginUser(id: 'test-id', email: email),
      tokens: const AuthTokens(
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresIn: 3600,
      ),
    );
  }
}

/// 始终处于加载状态的 RevokeAllSessionsNotifier
class _LoadingRevokeAllNotifier extends RevokeAllSessionsNotifier {
  @override
  RevokeAllSessionsState build() => const RevokeAllSessionsLoading();
}
