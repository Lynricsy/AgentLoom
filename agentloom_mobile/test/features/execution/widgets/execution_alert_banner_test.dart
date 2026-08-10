import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/widgets/execution_alert_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('ExecutionAlertBanner', () {
    testWidgets('renders nothing for running status', (tester) async {
      final snapshot = createTestStateSnapshot(status: 'running');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byType(SizedBox), findsOneWidget);
      expect(find.byIcon(Icons.error), findsNothing);
      expect(find.byIcon(Icons.cancel), findsNothing);
    });

    testWidgets('renders nothing for completed status', (tester) async {
      final snapshot = createTestStateSnapshot(status: 'completed');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byIcon(Icons.error), findsNothing);
      expect(find.byIcon(Icons.cancel), findsNothing);
    });

    testWidgets('renders red banner for failed status', (tester) async {
      final snapshot = createTestStateSnapshot(
        status: 'failed',
        steps: const [
          StepSnapshot(
            stepId: 'step-1',
            nodeId: 'node-1',
            nodeName: 'Email Agent',
            status: 'failed',
            errorMessage: 'Agent timed out',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byIcon(Icons.error), findsOneWidget);
      expect(find.text('Email Agent 失败: Agent timed out'), findsOneWidget);
    });

    testWidgets('renders default failed message when no error step', (
      tester,
    ) async {
      final snapshot = createTestStateSnapshot(
        status: 'failed',
        steps: const [],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byIcon(Icons.error), findsOneWidget);
      expect(find.text('执行失败'), findsOneWidget);
    });

    testWidgets('renders orange banner for cancelled status', (tester) async {
      final snapshot = createTestStateSnapshot(status: 'cancelled');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byIcon(Icons.cancel), findsOneWidget);
      expect(find.text('执行已取消'), findsOneWidget);
    });

    testWidgets('renders nothing for pending status', (tester) async {
      final snapshot = createTestStateSnapshot(status: 'pending');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionAlertBanner(snapshot: snapshot)),
        ),
      );

      expect(find.byIcon(Icons.error), findsNothing);
      expect(find.byIcon(Icons.cancel), findsNothing);
    });
  });
}
