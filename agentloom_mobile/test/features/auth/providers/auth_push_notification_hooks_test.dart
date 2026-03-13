import 'dart:convert';

import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/notifications/providers/push_notification_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

class TestPushNotificationNotifier extends PushNotificationNotifier {
  int initializeCalls = 0;
  int cleanupCalls = 0;
  bool throwOnCleanup = false;

  @override
  Future<PushNotificationState> build() async {
    return const PushNotificationState();
  }

  @override
  Future<void> initializeAfterAuth() async {
    initializeCalls++;
  }

  @override
  Future<void> cleanupOnLogout() async {
    cleanupCalls++;
    if (throwOnCleanup) {
      throw Exception('cleanup failed');
    }
  }
}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;
  late ProviderContainer container;

  const testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );
  const testUser = LoginUser(id: 'user-1', email: 'fox@test.com');

  setUpAll(() {
    registerFallbackValue(testTokens);
  });

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();

    when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});

    container = ProviderContainer(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
        pushNotificationProvider.overrideWith(TestPushNotificationNotifier.new),
      ],
    );
    addTearDown(container.dispose);
  });

  test(
    'login 成功后不直接触发 initializeAfterAuth（由 AgentLoomApp ref.listen 统一触发）',
    () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);
      when(() => mockTokenStorage.saveTokens(any())).thenAnswer((_) async {});
      when(() => mockAuthApi.login('fox@test.com', 'pass')).thenAnswer(
        (_) async => const AuthLoginSuccess(user: testUser, tokens: testTokens),
      );

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).login('fox@test.com', 'pass');
      await Future<void>.delayed(Duration.zero);

      final pushNotifier =
          container.read(pushNotificationProvider.notifier)
              as TestPushNotificationNotifier;

      // Fix #1: login() 不再直接调用 initializeAfterAuth()
      // 推送初始化统一由 AgentLoomApp.build() 中的 ref.listen(authProvider) 触发
      // 这里验证 login 本身不会产生额外调用，避免 double-trigger
      expect(pushNotifier.initializeCalls, 0);
      expect(container.read(authProvider).value, isA<AuthStateAuthenticated>());
    },
  );

  test('logout 会触发 cleanupOnLogout', () async {
    when(
      () => mockTokenStorage.readTokens(),
    ).thenAnswer((_) async => testTokens);
    when(() => mockAuthApi.logout('at')).thenAnswer((_) async {});

    await container.read(authProvider.future);

    await container.read(authProvider.notifier).logout();

    final pushNotifier =
        container.read(pushNotificationProvider.notifier)
            as TestPushNotificationNotifier;

    expect(pushNotifier.cleanupCalls, 1);
    expect(container.read(authProvider).value, isA<AuthStateUnauthenticated>());
  });

  test('forceLogout 在 push cleanup 失败时仍完成登出', () async {
    when(
      () => mockTokenStorage.readTokens(),
    ).thenAnswer((_) async => _createStoredTokens());

    await container.read(authProvider.future);

    final pushNotifier =
        container.read(pushNotificationProvider.notifier)
            as TestPushNotificationNotifier;
    pushNotifier.throwOnCleanup = true;

    await container.read(authProvider.notifier).forceLogout();

    expect(pushNotifier.cleanupCalls, 1);
    expect(container.read(authProvider).value, isA<AuthStateUnauthenticated>());
    verify(() => mockTokenStorage.clearTokens()).called(1);
  });
}

AuthTokens _createStoredTokens() {
  final header = base64Url
      .encode(utf8.encode(jsonEncode({'alg': 'none', 'typ': 'JWT'})))
      .replaceAll('=', '');
  final payload = base64Url
      .encode(
        utf8.encode(jsonEncode({'sub': 'user-1', 'email': 'stored@test.com'})),
      )
      .replaceAll('=', '');

  return AuthTokens(
    accessToken: '$header.$payload.signature',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  );
}
