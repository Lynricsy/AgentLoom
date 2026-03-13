import 'dart:async';

import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/shared/interceptors/auth_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;
  late AuthInterceptor interceptor;
  late bool forceLogoutCalled;

  final testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );

  final newTokens = AuthTokens(
    accessToken: 'new-at',
    refreshToken: 'new-rt',
    expiresIn: 3600,
  );

  setUpAll(() {
    registerFallbackValue(testTokens);
  });

  setUp(() {
    mockTokenStorage = MockTokenStorage();
    mockAuthApi = MockAuthApi();
    forceLogoutCalled = false;

    when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});
    when(() => mockTokenStorage.saveTokens(any())).thenAnswer((_) async {});

    interceptor = AuthInterceptor(
      tokenStorage: mockTokenStorage,
      authApi: mockAuthApi,
      onForceLogout: () => forceLogoutCalled = true,
    );
  });

  /// 安全调用 onError 并等待完成。
  /// ErrorInterceptorHandler.next/reject 会 completeError 一个内部 Completer，
  /// 在测试环境下表现为未捕获异步异常。用 runZonedGuarded 隔离。
  Future<void> callOnErrorAndWait(
    DioException err, {
    Duration wait = const Duration(milliseconds: 200),
  }) async {
    final completer = Completer<void>();
    runZonedGuarded(
      () {
        interceptor.onError(err, ErrorInterceptorHandler());
        Future<void>.delayed(wait).then((_) {
          if (!completer.isCompleted) completer.complete();
        });
      },
      (e, s) {
        // 吞掉 ErrorInterceptorHandler 产生的未处理异常
        if (!completer.isCompleted) completer.complete();
      },
    );
    await completer.future;
  }

  group('onRequest', () {
    test('有 tokens 时添加 Bearer Authorization header', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      final options = RequestOptions(path: '/test');
      interceptor.onRequest(options, RequestInterceptorHandler());
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(options.headers['Authorization'], 'Bearer at');
    });

    test('无 tokens 时不添加 Authorization header', () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      final options = RequestOptions(path: '/test');
      interceptor.onRequest(options, RequestInterceptorHandler());
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(options.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('onError - 非 401 错误', () {
    test('非 401 错误不操作 tokenStorage', () async {
      final err = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          statusCode: 500,
          requestOptions: RequestOptions(path: '/test'),
        ),
      );

      await callOnErrorAndWait(err);

      verifyNever(() => mockTokenStorage.readTokens());
      verifyNever(() => mockTokenStorage.clearTokens());
      expect(forceLogoutCalled, isFalse);
    });
  });

  group('onError - 401 不可恢复错误 → 强制登出', () {
    for (final errorType in [
      'token-revoked',
      'token-invalid',
      'token-missing',
    ]) {
      test('$errorType → 清除 tokens + 强制登出', () async {
        final err = DioException(
          requestOptions: RequestOptions(path: '/test'),
          response: Response(
            statusCode: 401,
            data: {'type': errorType},
            requestOptions: RequestOptions(path: '/test'),
          ),
        );

        await callOnErrorAndWait(err);

        verify(() => mockTokenStorage.clearTokens()).called(1);
        expect(forceLogoutCalled, isTrue);
      });
    }
  });

  group('onError - 401 token-expired → refresh 流程', () {
    test('token-expired + refresh 成功 → 保存新 tokens + 尝试重试', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockAuthApi.refresh('rt')).thenAnswer((_) async => newTokens);

      final err = DioException(
        requestOptions: RequestOptions(
          path: '/test',
          baseUrl: 'http://localhost',
        ),
        response: Response(
          statusCode: 401,
          data: {'type': 'token-expired'},
          requestOptions: RequestOptions(
            path: '/test',
            baseUrl: 'http://localhost',
          ),
        ),
      );

      await callOnErrorAndWait(err, wait: const Duration(milliseconds: 500));

      verify(() => mockAuthApi.refresh('rt')).called(1);
      verify(() => mockTokenStorage.saveTokens(newTokens)).called(1);
    });

    test('token-expired + 无 stored tokens → 强制登出', () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      final err = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          statusCode: 401,
          data: {'type': 'token-expired'},
          requestOptions: RequestOptions(path: '/test'),
        ),
      );

      await callOnErrorAndWait(err);

      expect(forceLogoutCalled, isTrue);
      verifyNever(() => mockAuthApi.refresh(any()));
    });

    test('token-expired + refresh 失败 → 清除 tokens + 强制登出', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(
        () => mockAuthApi.refresh('rt'),
      ).thenThrow(DioException(requestOptions: RequestOptions()));

      final err = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response(
          statusCode: 401,
          data: {'type': 'token-expired'},
          requestOptions: RequestOptions(path: '/test'),
        ),
      );

      await callOnErrorAndWait(err);

      verify(() => mockTokenStorage.clearTokens()).called(1);
      expect(forceLogoutCalled, isTrue);
    });
  });

  group('onError - 401 未知 type / 无 body → refresh 流程', () {
    test('未知 type → 尝试 refresh', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockAuthApi.refresh('rt')).thenAnswer((_) async => newTokens);

      final err = DioException(
        requestOptions: RequestOptions(
          path: '/test',
          baseUrl: 'http://localhost',
        ),
        response: Response(
          statusCode: 401,
          data: {'type': 'something-else'},
          requestOptions: RequestOptions(
            path: '/test',
            baseUrl: 'http://localhost',
          ),
        ),
      );

      await callOnErrorAndWait(err, wait: const Duration(milliseconds: 500));

      verify(() => mockAuthApi.refresh('rt')).called(1);
    });

    test('401 无 response body → 尝试 refresh', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);
      when(() => mockAuthApi.refresh('rt')).thenAnswer((_) async => newTokens);

      final err = DioException(
        requestOptions: RequestOptions(
          path: '/test',
          baseUrl: 'http://localhost',
        ),
        response: Response(
          statusCode: 401,
          requestOptions: RequestOptions(
            path: '/test',
            baseUrl: 'http://localhost',
          ),
        ),
      );

      await callOnErrorAndWait(err, wait: const Duration(milliseconds: 500));

      verify(() => mockAuthApi.refresh('rt')).called(1);
    });
  });
}
