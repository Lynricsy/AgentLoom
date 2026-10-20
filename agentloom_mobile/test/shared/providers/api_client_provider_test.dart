import 'dart:typed_data';

import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/api/auth_api.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/shared/interceptors/auth_interceptor.dart';
import 'package:agentloom_mobile/shared/providers/api_client_provider.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// 记录最终发出的请求，不访问网络
class _CapturingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      '{}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _TestTokenStorage extends TokenStorage {
  _TestTokenStorage() : super(const FlutterSecureStorage());

  @override
  Future<AuthTokens?> readTokens() async => const AuthTokens(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  );

  @override
  Future<void> clearTokens() async {}
}

String? _sentContentType(RequestOptions options) =>
    options.headers[Headers.contentTypeHeader] as String?;

void main() {
  group('ApiClient Provider', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer(
        overrides: [
          baseEnvProvider.overrideWithValue(
            const EnvConfig(
              studioBaseUrl: 'https://api-dev.agentloom.com',
              appName: 'AgentLoom Test',
              environment: AppEnvironment.dev,
            ),
          ),
          tokenStorageProvider.overrideWithValue(_TestTokenStorage()),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('returns configured Dio instance', () {
      final dio = container.read(apiClientProvider);
      expect(dio, isA<Dio>());
    });

    test('base URL matches env config', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.baseUrl, 'https://api-dev.agentloom.com');
    });

    test('connect timeout is 10 seconds', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.connectTimeout, const Duration(seconds: 10));
    });

    test('receive timeout is 30 seconds', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.receiveTimeout, const Duration(seconds: 30));
    });

    test('does not force a default Content-Type header', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.headers.containsKey('Content-Type'), isFalse);
      expect(dio.options.contentType, isNull);
    });

    group('Content-Type follows the request body', () {
      late Dio dio;
      late _CapturingAdapter adapter;

      setUp(() {
        dio = container.read(apiClientProvider);
        adapter = _CapturingAdapter();
        dio.httpClientAdapter = adapter;
      });

      // Fastify 对声明 JSON 却没有 body 的请求返回 400
      // 「Body cannot be empty when content-type is set to 'application/json'」
      test('DELETE without body sends no Content-Type', () async {
        await dio.delete<dynamic>('/api/v1/skills/s1');

        expect(_sentContentType(adapter.requests.single), isNull);
        expect(
          adapter.requests.single.headers['Authorization'],
          'Bearer access-token',
        );
      });

      test('PATCH without body sends no Content-Type', () async {
        await dio.patch<dynamic>('/api/v1/skills/s1/archive');

        expect(_sentContentType(adapter.requests.single), isNull);
      });

      test('POST without body sends no Content-Type', () async {
        await dio.post<dynamic>('/api/v1/skills/s1/publish');

        expect(_sentContentType(adapter.requests.single), isNull);
      });

      test('JSON map body sends application/json', () async {
        await dio.post<dynamic>('/api/v1/agents', data: {'name': 'a'});

        expect(
          _sentContentType(adapter.requests.single),
          Headers.jsonContentType,
        );
      });

      test('FormData body sends multipart/form-data', () async {
        await dio.post<dynamic>(
          '/api/v1/skills',
          data: FormData.fromMap({'metadata': '{}'}),
        );

        expect(
          _sentContentType(adapter.requests.single),
          startsWith(Headers.multipartFormDataContentType),
        );
      });
    });

    test(
      'auth Dio shared by AuthApi and MfaApi does not force a default Content-Type',
      () async {
        final authDio = container.read(authDioProvider);
        expect(authDio.options.headers.containsKey('Content-Type'), isFalse);

        final adapter = _CapturingAdapter();
        authDio.httpClientAdapter = adapter;
        await AuthApi(authDio).logout('access-token');

        expect(_sentContentType(adapter.requests.single), isNull);
      },
    );

    test('attaches AuthInterceptor', () {
      final dio = container.read(apiClientProvider);
      expect(
        dio.interceptors.any((interceptor) => interceptor is AuthInterceptor),
        isTrue,
      );
    });

    test('is singleton within same ProviderScope', () {
      final dio1 = container.read(apiClientProvider);
      final dio2 = container.read(apiClientProvider);
      expect(identical(dio1, dio2), isTrue);
    });

    test('staging env uses staging URL', () {
      final stagingContainer = ProviderContainer(
        overrides: [
          baseEnvProvider.overrideWithValue(
            const EnvConfig(
              studioBaseUrl: 'https://api-staging.agentloom.com',
              appName: 'AgentLoom Staging',
              environment: AppEnvironment.staging,
            ),
          ),
        ],
      );
      addTearDown(stagingContainer.dispose);

      final dio = stagingContainer.read(apiClientProvider);
      expect(dio.options.baseUrl, 'https://api-staging.agentloom.com');
    });

    test('prod env uses prod URL', () {
      final prodContainer = ProviderContainer(
        overrides: [
          baseEnvProvider.overrideWithValue(
            const EnvConfig(
              studioBaseUrl: 'https://api.agentloom.com',
              appName: 'AgentLoom',
              environment: AppEnvironment.prod,
            ),
          ),
        ],
      );
      addTearDown(prodContainer.dispose);

      final dio = prodContainer.read(apiClientProvider);
      expect(dio.options.baseUrl, 'https://api.agentloom.com');
    });
  });
}
