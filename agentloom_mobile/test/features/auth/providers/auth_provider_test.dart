import 'dart:async';

import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_state.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/models/login_user.dart';
import 'package:agentloom_mobile/features/auth/providers/auth_provider.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;
  late ProviderContainer container;

  final testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );
  final testUser = LoginUser(id: 'u1', email: 'fox@test.com');

  setUpAll(() {
    registerFallbackValue(testTokens);
  });

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();

    container = ProviderContainer(
      overrides: [
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
        authApiProvider.overrideWithValue(mockAuthApi),
      ],
    );
  });

  tearDown(() {
    container.dispose();
  });

  group('AuthNotifier.build (初始化)', () {
    test('有 stored tokens 时返回 authenticated', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      // 等待初始化完成
      final completer = Completer<void>();
      container.listen(authProvider, (prev, next) {
        if (next.hasValue && !completer.isCompleted) {
          completer.complete();
        }
      }, fireImmediately: true);

      await completer.future;

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateAuthenticated>());
    });

    test('无 stored tokens 时返回 unauthenticated', () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      final completer = Completer<void>();
      container.listen(authProvider, (prev, next) {
        if (next.hasValue && !completer.isCompleted) {
          completer.complete();
        }
      }, fireImmediately: true);

      await completer.future;

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
    });
  });

  group('AuthNotifier.login', () {
    setUp(() {
      // 默认初始化为 unauthenticated
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);
    });

    test('登录成功 → 保存 tokens 并返回 authenticated', () async {
      when(() => mockTokenStorage.saveTokens(any())).thenAnswer((_) async {});
      when(() => mockAuthApi.login('fox@test.com', 'pass')).thenAnswer(
        (_) async => AuthLoginSuccess(user: testUser, tokens: testTokens),
      );

      // 等待初始化
      await container.read(authProvider.future);

      // 执行登录
      await container.read(authProvider.notifier).login('fox@test.com', 'pass');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateAuthenticated>());
      final authenticated = state as AuthStateAuthenticated;
      expect(authenticated.user.email, 'fox@test.com');
      expect(authenticated.tokens.accessToken, 'at');

      verify(() => mockTokenStorage.saveTokens(testTokens)).called(1);
    });

    test('登录返回 MFA → 返回 mfaRequired', () async {
      when(() => mockAuthApi.login('mfa@test.com', 'pass')).thenAnswer(
        (_) async => AuthLoginMfaRequired(
          mfaToken: 'mfa-tk',
          factors: const [
            {'type': 'totp'},
          ],
        ),
      );

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).login('mfa@test.com', 'pass');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateMfaRequired>());
      final mfa = state as AuthStateMfaRequired;
      expect(mfa.mfaToken, 'mfa-tk');
    });

    test('登录网络超时 → 返回 unauthenticated + 友好错误信息', () async {
      when(() => mockAuthApi.login('a@b.com', 'p')).thenThrow(
        DioException(
          type: DioExceptionType.connectionTimeout,
          requestOptions: RequestOptions(),
        ),
      );

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).login('a@b.com', 'p');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      final unauth = state as AuthStateUnauthenticated;
      expect(unauth.message, contains('网络连接超时'));
    });

    test('登录连接错误 → 返回 unauthenticated + 友好错误信息', () async {
      when(() => mockAuthApi.login('a@b.com', 'p')).thenThrow(
        DioException(
          type: DioExceptionType.connectionError,
          requestOptions: RequestOptions(),
        ),
      );

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).login('a@b.com', 'p');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      final unauth = state as AuthStateUnauthenticated;
      expect(unauth.message, contains('无法连接到服务器'));
    });

    test('登录返回服务端错误信息 → 提取 message 字段', () async {
      when(() => mockAuthApi.login('bad@test.com', 'wrong')).thenThrow(
        DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 401,
            data: {'message': '邮箱或密码错误'},
            requestOptions: RequestOptions(),
          ),
          requestOptions: RequestOptions(),
        ),
      );

      await container.read(authProvider.future);

      await container
          .read(authProvider.notifier)
          .login('bad@test.com', 'wrong');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      final unauth = state as AuthStateUnauthenticated;
      expect(unauth.message, '邮箱或密码错误');
    });
  });

  group('AuthNotifier.logout', () {
    test('登出 → 清除 tokens + 返回 unauthenticated', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});
      when(() => mockAuthApi.logout('at')).thenAnswer((_) async {});

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).logout();

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      verify(() => mockTokenStorage.clearTokens()).called(1);
    });

    test('登出 API 失败仍然清除本地 tokens', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});
      when(() => mockAuthApi.logout('at')).thenAnswer(
        (_) async => throw DioException(requestOptions: RequestOptions()),
      );

      await container.read(authProvider.future);

      await container.read(authProvider.notifier).logout();

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      verify(() => mockTokenStorage.clearTokens()).called(1);
    });
  });

  group('AuthNotifier.refreshTokens', () {
    test('刷新成功 → 保存新 tokens + 返回 true', () async {
      final newTokens = AuthTokens(
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresIn: 7200,
      );

      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(
        () => mockTokenStorage.saveTokens(newTokens),
      ).thenAnswer((_) async {});
      when(() => mockAuthApi.refresh('rt')).thenAnswer((_) async => newTokens);

      await container.read(authProvider.future);

      final result = await container
          .read(authProvider.notifier)
          .refreshTokens();

      expect(result, isTrue);
      verify(() => mockTokenStorage.saveTokens(newTokens)).called(1);
    });

    test('无 stored tokens → 返回 false + unauthenticated', () async {
      // 初始化时有 tokens
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      await container.read(authProvider.future);

      // 但 refresh 调用时已无 tokens
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      final result = await container
          .read(authProvider.notifier)
          .refreshTokens();

      expect(result, isFalse);
      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
    });

    test('refresh API 失败 → 清除 tokens + 返回 false', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});
      when(
        () => mockAuthApi.refresh('rt'),
      ).thenThrow(DioException(requestOptions: RequestOptions()));

      await container.read(authProvider.future);

      final result = await container
          .read(authProvider.notifier)
          .refreshTokens();

      expect(result, isFalse);
      verify(() => mockTokenStorage.clearTokens()).called(1);
    });
  });

  group('AuthNotifier.forceLogout', () {
    test('强制登出 → unauthenticated + 自定义消息', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      await container.read(authProvider.future);

      container.read(authProvider.notifier).forceLogout(message: 'Token 已吊销');

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      final unauth = state as AuthStateUnauthenticated;
      expect(unauth.message, 'Token 已吊销');
    });

    test('强制登出 → 默认消息', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      await container.read(authProvider.future);

      container.read(authProvider.notifier).forceLogout();

      final state = container.read(authProvider).value;
      expect(state, isA<AuthStateUnauthenticated>());
      final unauth = state as AuthStateUnauthenticated;
      expect(unauth.message, '登录已过期，请重新登录');
    });
  });

  group('isAuthenticatedProvider', () {
    test('authenticated 状态 → true', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      await container.read(authProvider.future);

      expect(container.read(isAuthenticatedProvider), isTrue);
    });

    test('unauthenticated 状态 → false', () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      await container.read(authProvider.future);

      expect(container.read(isAuthenticatedProvider), isFalse);
    });
  });
}
