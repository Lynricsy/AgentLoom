import 'package:agentloom_mobile/features/workflows/widgets/workflow_card.dart';
import 'package:agentloom_mobile/features/workflows/widgets/workflow_status_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('WorkflowCard', () {
    testWidgets('renders workflow name', (tester) async {
      final workflow = createTestWorkflow(name: 'My Workflow');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WorkflowCard(workflow: workflow)),
        ),
      );

      expect(find.text('My Workflow'), findsOneWidget);
    });

    testWidgets('renders status chip', (tester) async {
      final workflow = createTestWorkflow(status: 'published');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WorkflowCard(workflow: workflow)),
        ),
      );

      expect(find.byType(WorkflowStatusChip), findsOneWidget);
    });

    testWidgets('renders description when present', (tester) async {
      final workflow = createTestWorkflow(description: 'This is a description');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WorkflowCard(workflow: workflow)),
        ),
      );

      expect(find.text('This is a description'), findsOneWidget);
    });

    testWidgets('hides description when null', (tester) async {
      final workflow = createTestWorkflow(description: null);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WorkflowCard(workflow: workflow)),
        ),
      );

      // Card should render without error
      expect(find.byType(WorkflowCard), findsOneWidget);
      // No description text
      expect(find.text('A test workflow description'), findsNothing);
    });

    testWidgets('renders version', (tester) async {
      final workflow = createTestWorkflow(version: 3);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: WorkflowCard(workflow: workflow)),
        ),
      );

      expect(find.text('v3'), findsOneWidget);
    });

    testWidgets('calls onTap callback when tapped', (tester) async {
      var tapped = false;
      final workflow = createTestWorkflow();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: WorkflowCard(workflow: workflow, onTap: () => tapped = true),
          ),
        ),
      );

      await tester.tap(find.byType(WorkflowCard));
      expect(tapped, isTrue);
    });
  });

  group('WorkflowStatusChip', () {
    testWidgets('renders draft status', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: WorkflowStatusChip(status: 'draft')),
        ),
      );

      expect(find.text('Draft'), findsOneWidget);
    });

    testWidgets('renders published status', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: WorkflowStatusChip(status: 'published')),
        ),
      );

      expect(find.text('Published'), findsOneWidget);
    });

    testWidgets('renders archived status', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: WorkflowStatusChip(status: 'archived')),
        ),
      );

      expect(find.text('Archived'), findsOneWidget);
    });
  });
}
