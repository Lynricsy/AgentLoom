import 'package:agentloom_mobile/config/constants.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/config/theme.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppEnvironment', () {
    test('fromString returns matched environment', () {
      expect(AppEnvironment.fromString('staging'), AppEnvironment.staging);
      expect(AppEnvironment.fromString('prod'), AppEnvironment.prod);
    });

    test('fromString falls back to dev for unknown values', () {
      expect(AppEnvironment.fromString('unknown'), AppEnvironment.dev);
    });
  });

  group('EnvConfig', () {
    tearDown(() {
      dotenv.clean();
    });

    test('fromDotEnv reads dotenv values', () {
      // flutter_dotenv 6 移除了 testLoad，改用 loadFromString。
      dotenv.loadFromString(
        envString:
            'API_BASE_URL=https://api-dev.agentloom.com/api/v1\nAPP_NAME=AgentLoom Dev',
      );

      final config = EnvConfig.fromDotEnv(environment: AppEnvironment.dev);

      expect(config.apiBaseUrl, 'https://api-dev.agentloom.com');
      expect(config.studioBaseUrl, 'https://api-dev.agentloom.com');
      expect(config.appName, 'AgentLoom Dev');
      expect(config.environment, AppEnvironment.dev);
    });

    test('fromDotEnv falls back to default values', () {
      dotenv.loadFromString(envString: '', isOptional: true);

      final config = EnvConfig.fromDotEnv(environment: AppEnvironment.staging);

      expect(config.apiBaseUrl, 'http://localhost:3000');
      expect(config.studioBaseUrl, 'http://localhost:3000');
      expect(config.appName, 'AgentLoom');
      expect(config.environment, AppEnvironment.staging);
    });

    test('fromDotEnv 优先使用 STUDIO_BASE_URL 作为生产入口', () {
      dotenv.loadFromString(
        envString:
            'STUDIO_BASE_URL=https://agentloom.ling.plus\nAPI_BASE_URL=https://api.agentloom.com/api/v1\nAPP_NAME=AgentLoom',
      );

      final config = EnvConfig.fromDotEnv(environment: AppEnvironment.prod);

      expect(config.studioBaseUrl, 'https://agentloom.ling.plus');
      expect(config.apiBaseUrl, 'https://agentloom.ling.plus');
      expect(config.environment, AppEnvironment.prod);
    });

    test('normalizeStudioBaseUrl accepts bare host and strips api suffix', () {
      expect(
        EnvConfig.normalizeStudioBaseUrl('agentloom.ling.plus/api/v1'),
        'https://agentloom.ling.plus',
      );
      expect(
        EnvConfig.normalizeStudioBaseUrl('localhost:8080/api'),
        'http://localhost:8080',
      );
    });

    test('deriveApiBaseUrl keeps normalized studio base URL', () {
      expect(
        EnvConfig.deriveApiBaseUrl('https://example.com/agentloom'),
        'https://example.com/agentloom',
      );
    });
  });

  group('AppTheme', () {
    test('light theme uses Material 3', () {
      final theme = AppTheme.light();

      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.light);
      expect(theme.appBarTheme.centerTitle, isFalse);
      expect(theme.colorScheme.primary, const Color(0xFF0B6BFF));
    });

    test('dark theme uses Material 3 dark brightness', () {
      final theme = AppTheme.dark();

      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.dark);
    });
  });

  group('constants and route names', () {
    test('exposes app constants', () {
      expect(AppConstants.appVersion, '0.1.0');
      expect(AppConstants.connectTimeout, const Duration(seconds: 10));
      expect(AppConstants.receiveTimeout, const Duration(seconds: 30));
      expect(AppConstants.appName, 'AgentLoom');
    });

    test('exposes route names', () {
      expect(RouteNames.dashboard, 'dashboard');
      expect(RouteNames.workflows, 'workflows');
      expect(RouteNames.resources, 'resources');
      expect(RouteNames.settings, 'settings');
      expect(RouteNames.serverConfig, 'serverConfig');
      expect(RouteNames.knowledgeBases, 'knowledgeBases');
      expect(RouteNames.mcpServers, 'mcpServers');
      expect(RouteNames.llmModels, 'llmModels');
    });
  });
}
