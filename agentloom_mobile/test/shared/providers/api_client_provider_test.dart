import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/shared/interceptors/auth_interceptor.dart';
import 'package:agentloom_mobile/shared/providers/api_client_provider.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ApiClient Provider', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer(
        overrides: [
          envProvider.overrideWithValue(
            const EnvConfig(
              apiBaseUrl: 'https://api-dev.agentloom.com/api/v1',
              appName: 'AgentLoom Test',
              environment: AppEnvironment.dev,
            ),
          ),
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
      expect(dio.options.baseUrl, 'https://api-dev.agentloom.com/api/v1');
    });

    test('connect timeout is 10 seconds', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.connectTimeout, const Duration(seconds: 10));
    });

    test('receive timeout is 30 seconds', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.receiveTimeout, const Duration(seconds: 30));
    });

    test('Content-Type header is application/json', () {
      final dio = container.read(apiClientProvider);
      expect(dio.options.headers['Content-Type'], 'application/json');
    });

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
          envProvider.overrideWithValue(
            const EnvConfig(
              apiBaseUrl: 'https://api-staging.agentloom.com/api/v1',
              appName: 'AgentLoom Staging',
              environment: AppEnvironment.staging,
            ),
          ),
        ],
      );
      addTearDown(stagingContainer.dispose);

      final dio = stagingContainer.read(apiClientProvider);
      expect(dio.options.baseUrl, 'https://api-staging.agentloom.com/api/v1');
    });

    test('prod env uses prod URL', () {
      final prodContainer = ProviderContainer(
        overrides: [
          envProvider.overrideWithValue(
            const EnvConfig(
              apiBaseUrl: 'https://api.agentloom.com/api/v1',
              appName: 'AgentLoom',
              environment: AppEnvironment.prod,
            ),
          ),
        ],
      );
      addTearDown(prodContainer.dispose);

      final dio = prodContainer.read(apiClientProvider);
      expect(dio.options.baseUrl, 'https://api.agentloom.com/api/v1');
    });
  });
}
