import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/auth/screens/register_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;

  const testUser = LoginUser(id: 'u1', email: 'fox@test.com');
  const testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();
    when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);
  });

  Widget buildTestWidget() {
    return ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
      ],
      child: const MaterialApp(home: RegisterScreen()),
    );
  }

  group('RegisterScreen 渲染', () {
    testWidgets('正确渲染注册表单与返回登录入口', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('创建账号'), findsOneWidget);
      expect(find.text('显示名称（可选）'), findsOneWidget);
      expect(find.text('邮箱'), findsOneWidget);
      expect(find.text('密码'), findsOneWidget);
      expect(find.text('确认密码'), findsOneWidget);
      expect(find.text('注册'), findsOneWidget);
      expect(find.text('返回登录'), findsOneWidget);
    });

    testWidgets('注册按钮初始状态为禁用', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });
  });

  group('RegisterScreen 表单验证', () {
    testWidgets('有效输入后注册按钮可用', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).at(0), '狐狸');
      await tester.enterText(find.byType(TextField).at(1), 'fox@test.com');
      await tester.enterText(find.byType(TextField).at(2), 'Password123');
      await tester.enterText(find.byType(TextField).at(3), 'Password123');
      await tester.pump();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNotNull);
    });

    testWidgets('确认密码不一致时按钮禁用并显示校验', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).at(1), 'fox@test.com');
      await tester.enterText(find.byType(TextField).at(2), 'Password123');
      await tester.enterText(find.byType(TextField).at(3), 'Password456');
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });
  });

  group('RegisterScreen 交互结果', () {
    testWidgets('provider 错误状态时展示错误信息', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tokenStorageProvider.overrideWithValue(mockTokenStorage),
            authApiProvider.overrideWithValue(mockAuthApi),
            authProvider.overrideWith(() => _ErrorAuthNotifier()),
          ],
          child: const MaterialApp(home: RegisterScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('该邮箱已被注册'), findsOneWidget);
    });

    testWidgets('注册成功后显示 Web onboarding 引导对话框', (tester) async {
      when(
        () => mockAuthApi.register(
          'fox@test.com',
          'Password123',
          displayName: '狐狸',
        ),
      ).thenAnswer(
        (_) async =>
            const AuthRegisterSuccess(user: testUser, tokens: testTokens),
      );

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).at(0), '狐狸');
      await tester.enterText(find.byType(TextField).at(1), 'fox@test.com');
      await tester.enterText(find.byType(TextField).at(2), 'Password123');
      await tester.enterText(find.byType(TextField).at(3), 'Password123');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.widgetWithText(FilledButton, '注册'));
      await tester.tap(find.widgetWithText(FilledButton, '注册'));
      await tester.pumpAndSettle();

      expect(find.text('账号已创建'), findsOneWidget);
      expect(find.textContaining('首次组织初始化仍需在 Web Studio 完成'), findsOneWidget);
      expect(find.text('前往 Web Studio'), findsOneWidget);
    });
  });
}

class _ErrorAuthNotifier extends AuthNotifier {
  @override
  Future<AuthState> build() async {
    return const AuthState.unauthenticated(message: '该邮箱已被注册');
  }
}
