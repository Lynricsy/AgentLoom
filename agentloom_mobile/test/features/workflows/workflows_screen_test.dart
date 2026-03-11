import 'package:agentloom_mobile/features/workflows/screens/workflows_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WorkflowsScreen', () {
    testWidgets('renders placeholder text', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: WorkflowsScreen()));

      expect(find.text('Workflows (Coming Soon)'), findsOneWidget);
    });

    testWidgets('uses Scaffold', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: WorkflowsScreen()));

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('text is centered', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: WorkflowsScreen()));

      expect(find.byType(Center), findsOneWidget);
    });
  });
}
