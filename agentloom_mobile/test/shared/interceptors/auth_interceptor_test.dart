import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/shared/interceptors/auth_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAuthApi extends Mock implements AuthApi {}

class CapturingRequestInterceptorHandler extends RequestInterceptorHandler {
  RequestOptions? nextOptions;
  DioException? rejectedError;

  @override
  void next(RequestOptions requestOptions) {
    nextOptions = requestOptions;
    super.next(requestOptions);
  }

  @override
  void reject(
    DioException error, [
    bool callFollowingErrorInterceptor = false,
  ]) {
    rejectedError = error;
    super.reject(error, callFollowingErrorInterceptor);
  }

  Future<void> waitForCompletion() async {
    try {
      await future;
    } catch (_) {}
  }
}

class CapturingErrorInterceptorHandler extends ErrorInterceptorHandler {
  DioException? nextError;
  Response<dynamic>? resolvedResponse;
  DioException? rejectedError;

  @override
  void next(DioException error) {
    nextError = error;
    super.next(error);
  }

  @override
  void resolve(Response<dynamic> response) {
    resolvedResponse = response;
    super.resolve(response);
  }

  @override
  void reject(DioException error) {
    rejectedError = error;
    super.reject(error);
  }

  Future<void> waitForCompletion() async {
    try {
      await future;
    } catch (_) {}
  }
}

void main() {
  late MockTokenStorage mockTokenStorage;
  late MockAuthApi mockAuthApi;
  late AuthInterceptor interceptor;
  late bool forceLogoutCalled;
  late RequestOptions? retriedOptions;
  late Future<Response<dynamic>> Function(RequestOptions options) retryRequest;

  const testTokens = AuthTokens(
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
  );

  const newTokens = AuthTokens(
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
    retriedOptions = null;

    when(() => mockTokenStorage.clearTokens()).thenAnswer((_) async {});
    when(() => mockTokenStorage.saveTokens(any())).thenAnswer((_) async {});

    retryRequest = (options) async {
      retriedOptions = options;
      return Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: {'ok': true},
      );
    };

    interceptor = AuthInterceptor(
      tokenStorage: mockTokenStorage,
      authApi: mockAuthApi,
      onForceLogout: () async {
        forceLogoutCalled = true;
      },
      retryRequest: (options) => retryRequest(options),
    );
  });

  Future<CapturingRequestInterceptorHandler> callOnRequest(
    RequestOptions options,
  ) async {
    final handler = CapturingRequestInterceptorHandler();
    interceptor.onRequest(options, handler);
    await handler.waitForCompletion();
    return handler;
  }

  Future<CapturingErrorInterceptorHandler> callOnErrorAndWait(
    DioException err,
  ) async {
    final handler = CapturingErrorInterceptorHandler();
    interceptor.onError(err, handler);
    await handler.waitForCompletion();
    return handler;
  }

  group('onRequest', () {
    test('有 tokens 时添加 Bearer Authorization header', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => testTokens);

      final options = RequestOptions(path: '/test');
      final handler = await callOnRequest(options);

      expect(options.headers['Authorization'], 'Bearer at');
      expect(handler.nextOptions, same(options));
    });

    test('无 tokens 时不添加 Authorization header', () async {
      when(() => mockTokenStorage.readTokens()).thenAnswer((_) async => null);

      final options = RequestOptions(path: '/test');
      final handler = await callOnRequest(options);

      expect(options.headers.containsKey('Authorization'), isFalse);
      expect(handler.nextOptions, same(options));
    });

    test('读取 tokens 失败时拒绝请求', () async {
      when(() => mockTokenStorage.readTokens()).thenThrow(Exception('boom'));

      final options = RequestOptions(path: '/test');
      final handler = await callOnRequest(options);

      expect(handler.nextOptions, isNull);
      expect(handler.rejectedError?.message, '读取认证凭证失败');
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

      final handler = await callOnErrorAndWait(err);

      verifyNever(() => mockTokenStorage.readTokens());
      verifyNever(() => mockTokenStorage.clearTokens());
      expect(forceLogoutCalled, isFalse);
      expect(handler.nextError, same(err));
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

        final handler = await callOnErrorAndWait(err);

        verify(() => mockTokenStorage.clearTokens()).called(1);
        expect(forceLogoutCalled, isTrue);
        expect(handler.nextError, same(err));
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
          headers: {'Authorization': 'Bearer at'},
        ),
        response: Response(
          statusCode: 401,
          data: {'type': 'token-expired'},
          requestOptions: RequestOptions(
            path: '/test',
            baseUrl: 'http://localhost',
            headers: {'Authorization': 'Bearer at'},
          ),
        ),
      );

      final handler = await callOnErrorAndWait(err);

      verify(() => mockAuthApi.refresh('rt')).called(1);
      verify(() => mockTokenStorage.saveTokens(newTokens)).called(1);
      expect(retriedOptions?.headers['Authorization'], 'Bearer new-at');
      expect(handler.resolvedResponse?.statusCode, 200);
    });

    test('检测到其他请求已刷新 token 时直接复用新 token 重试', () async {
      when(
        () => mockTokenStorage.readTokens(),
      ).thenAnswer((_) async => newTokens);

      final err = DioException(
        requestOptions: RequestOptions(
          path: '/test',
          baseUrl: 'http://localhost',
          headers: {'Authorization': 'Bearer at'},
        ),
        response: Response(
          statusCode: 401,
          data: {'type': 'token-expired'},
          requestOptions: RequestOptions(
            path: '/test',
            baseUrl: 'http://localhost',
            headers: {'Authorization': 'Bearer at'},
          ),
        ),
      );

      final handler = await callOnErrorAndWait(err);

      verifyNever(() => mockAuthApi.refresh(any()));
      expect(retriedOptions?.headers['Authorization'], 'Bearer new-at');
      expect(handler.resolvedResponse?.statusCode, 200);
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

      final handler = await callOnErrorAndWait(err);

      expect(forceLogoutCalled, isTrue);
      verifyNever(() => mockAuthApi.refresh(any()));
      verify(() => mockTokenStorage.clearTokens()).called(1);
      expect(handler.nextError, same(err));
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

      final handler = await callOnErrorAndWait(err);

      verify(() => mockTokenStorage.clearTokens()).called(1);
      expect(forceLogoutCalled, isTrue);
      expect(handler.nextError, same(err));
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
            headers: {'Authorization': 'Bearer at'},
          ),
        ),
      );

      final handler = await callOnErrorAndWait(err);

      verify(() => mockAuthApi.refresh('rt')).called(1);
      expect(handler.resolvedResponse?.statusCode, 200);
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
            headers: {'Authorization': 'Bearer at'},
          ),
        ),
      );

      final handler = await callOnErrorAndWait(err);

      verify(() => mockAuthApi.refresh('rt')).called(1);
      expect(handler.resolvedResponse?.statusCode, 200);
    });
  });
}
