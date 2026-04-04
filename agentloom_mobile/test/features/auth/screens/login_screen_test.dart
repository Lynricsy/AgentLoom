import 'dart:async';

import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/auth/screens/login_screen.dart';
import 'package:agentloom_mobile/features/auth/widgets/oauth_button.dart';
import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
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

  Widget buildTestWidget() {
    return ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
      ],
      child: const MaterialApp(home: LoginScreen()),
    );
  }

  group('LoginScreen 渲染', () {
    testWidgets('正确渲染标题、邮箱、密码和登录按钮', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('AgentLoom'), findsOneWidget);
      expect(find.text('移动工作台'), findsOneWidget);
      expect(find.text('邮箱'), findsOneWidget);
      expect(find.text('密码'), findsOneWidget);
      expect(find.text('登录'), findsOneWidget);
      expect(find.text('立即注册'), findsOneWidget);
    });

    testWidgets('登录按钮初始状态为禁用', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });
  });

  group('LoginScreen 表单验证', () {
    testWidgets('有效邮箱 + 非空密码 → 按钮可用', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 输入有效邮箱
      await tester.enterText(find.byType(TextField).first, 'fox@test.com');
      await tester.pump();

      // 输入密码
      await tester.enterText(find.byType(TextField).last, 'password123');
      await tester.pump();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNotNull);
    });

    testWidgets('无效邮箱 → 按钮禁用', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'not-an-email');
      await tester.enterText(find.byType(TextField).last, 'password');
      await tester.pump();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('空密码 → 按钮禁用', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'fox@test.com');
      await tester.pump();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });
  });

  group('LoginScreen 密码可见性', () {
    testWidgets('点击可切换密码可见性', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 初始状态：密码隐藏
      expect(find.byIcon(Icons.visibility_off), findsOneWidget);
      expect(find.byIcon(Icons.visibility), findsNothing);

      // 点击切换
      await tester.tap(find.byIcon(Icons.visibility_off));
      await tester.pump();

      expect(find.byIcon(Icons.visibility), findsOneWidget);
      expect(find.byIcon(Icons.visibility_off), findsNothing);
    });
  });

  group('LoginScreen 错误状态', () {
    testWidgets('登录失败显示错误信息', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      // 使用 override authProvider 为已有错误消息的状态
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            authProvider.overrideWith(() => _ErrorAuthNotifier()),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('邮箱或密码错误'), findsOneWidget);
    });

    testWidgets('MFA 状态渲染登录表单（不显示旧版提示文字）', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            authProvider.overrideWith(() => _MfaAuthNotifier()),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();

      // LoginScreen 现在在初始渲染时不显示 MFA 提示消息。
      // MFA 状态下导航到 /mfa-verify 由 _handleLogin() 触发，而非初始渲染。
      expect(find.text('AgentLoom'), findsOneWidget);
      expect(find.text('此账户需要多因素认证，请在 Web 端登录'), findsNothing);
    });
  });

  group('LoginScreen 加载状态', () {
    testWidgets('加载中显示 CircularProgressIndicator', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            authProvider.overrideWith(() => _LoadingAuthNotifier()),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );

      // 不 settle — 保持 loading 状态
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('LoginScreen OAuth 按钮', () {
    testWidgets('渲染 Google 和 GitHub OAuth 按钮', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('使用 Google 登录'), findsOneWidget);
      expect(find.text('使用 GitHub 登录'), findsOneWidget);
      expect(find.byType(OAuthButton), findsNWidgets(2));
    });

    testWidgets('渲染"或"分隔线', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('或使用第三方登录'), findsOneWidget);
      expect(find.byType(Divider), findsNWidgets(2));
    });

    testWidgets('加载状态下 OAuth 按钮禁用', (tester) async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            authProvider.overrideWith(() => _LoadingAuthNotifier()),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // OAuth 按钮在加载状态下应该被禁用
      final oauthButtons = tester.widgetList<ElevatedButton>(
        find.byType(ElevatedButton),
      );
      for (final button in oauthButtons) {
        expect(button.onPressed, isNull);
      }
    });
  });
}

/// 返回 unauthenticated + error message 的 AuthNotifier
class _ErrorAuthNotifier extends AuthNotifier {
  @override
  Future<AuthState> build() async {
    return const AuthState.unauthenticated(message: '邮箱或密码错误');
  }
}

/// 返回 MFA required 状态的 AuthNotifier
class _MfaAuthNotifier extends AuthNotifier {
  @override
  Future<AuthState> build() async {
    return const AuthState.mfaRequired(
      mfaToken: 'mfa-tk',
      factors: [
        {'type': 'totp'},
      ],
    );
  }
}

/// 保持 loading 状态的 AuthNotifier
class _LoadingAuthNotifier extends AuthNotifier {
  @override
  Future<AuthState> build() async {
    // 永远不完成
    await Completer<void>().future;
    return const AuthState.unauthenticated();
  }
}
