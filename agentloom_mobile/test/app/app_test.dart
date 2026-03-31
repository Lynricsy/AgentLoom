import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AgentLoomApp', () {
    Widget createApp() {
      return ProviderScope(
        overrides: [
          baseEnvProvider.overrideWithValue(
            const EnvConfig(
              studioBaseUrl: 'http://localhost:3000',
              appName: 'AgentLoom Test',
              environment: AppEnvironment.dev,
            ),
          ),
          tokenStorageProvider.overrideWithValue(_TestTokenStorage()),
        ],
        child: const AgentLoomApp(),
      );
    }

    testWidgets('renders MaterialApp.router', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      expect(find.byType(MaterialApp), findsOneWidget);
      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.routerConfig, isNotNull);
    });

    testWidgets('applies correct theme', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(materialApp.theme?.useMaterial3, isTrue);
    });

    testWidgets('shows NavigationBar with 4 destinations', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      expect(find.byType(NavigationBar), findsOneWidget);
      // NavigationBar destinations contain 总览、工作流、Agent、资源、设置
      final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.destinations.length, 5);
    });

    testWidgets('defaults to Dashboard tab', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      // Dashboard AppBar title
      expect(find.widgetWithText(AppBar, 'Dashboard'), findsOneWidget);
    });

    testWidgets('ProviderScope wraps MaterialApp.router', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      // If ProviderScope is not wrapping, ConsumerWidget would throw
      expect(find.byType(MaterialApp), findsOneWidget);
    });
  });
}

class _TestTokenStorage extends TokenStorage {
  _TestTokenStorage() : super(const FlutterSecureStorage());

  static const AuthTokens _tokens = AuthTokens(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  );

  @override
  Future<bool> hasTokens() async => true;

  @override
  Future<AuthTokens?> readTokens() async => _tokens;

  @override
  Future<void> saveTokens(AuthTokens tokens) async {}

  @override
  Future<void> clearTokens() async {}
}
