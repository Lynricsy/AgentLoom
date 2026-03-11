import 'package:agentloom_mobile/features/settings/screens/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SettingsScreen', () {
    testWidgets('renders placeholder text', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));

      expect(find.text('Settings (Coming Soon)'), findsOneWidget);
    });

    testWidgets('uses Scaffold', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('text is centered', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: SettingsScreen()));

      expect(find.byType(Center), findsOneWidget);
    });
  });
}
