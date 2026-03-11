import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AgentLoomApp', () {
    Widget createApp() {
      return ProviderScope(
        overrides: [
          envProvider.overrideWithValue(
            const EnvConfig(
              apiBaseUrl: 'http://localhost:3000/api/v1',
              appName: 'AgentLoom Test',
              environment: AppEnvironment.dev,
            ),
          ),
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

    testWidgets('shows NavigationBar with 3 destinations', (tester) async {
      await tester.pumpWidget(createApp());
      await tester.pumpAndSettle();

      expect(find.byType(NavigationBar), findsOneWidget);
      // NavigationBar destinations contain Dashboard, Workflows, Settings
      final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.destinations.length, 3);
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
