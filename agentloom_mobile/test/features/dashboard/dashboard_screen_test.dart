import 'package:agentloom_mobile/features/dashboard/screens/dashboard_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DashboardScreen', () {
    testWidgets('renders placeholder text', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      expect(find.text('Dashboard (Coming Soon)'), findsOneWidget);
    });

    testWidgets('uses Scaffold', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('text is centered', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));

      expect(find.byType(Center), findsOneWidget);
    });
  });
}
