import 'package:agentloom_mobile/features/execution/widgets/execution_status_header.dart';
import 'package:agentloom_mobile/features/execution/widgets/connection_mode_indicator.dart';
import 'package:agentloom_mobile/features/execution/providers/execution_monitor_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('ExecutionStatusHeader', () {
    testWidgets('renders status label and progress', (tester) async {
      final snapshot = createTestStateSnapshot(
        status: 'running',
        completedSteps: 1,
        totalSteps: 3,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.websocket,
            ),
          ),
        ),
      );

      expect(find.text('Running'), findsOneWidget);
      expect(find.text('1 / 3 steps'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('renders ConnectionModeIndicator', (tester) async {
      final snapshot = createTestStateSnapshot();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.polling,
            ),
          ),
        ),
      );

      expect(find.byType(ConnectionModeIndicator), findsOneWidget);
      expect(find.text('Polling'), findsOneWidget);
    });

    testWidgets('shows start time from first step', (tester) async {
      final snapshot = createTestStateSnapshot();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.websocket,
            ),
          ),
        ),
      );

      // 第一个 step 的 startedAt 是 2026-01-01T10:00:00.000Z
      expect(find.textContaining('Started at'), findsOneWidget);
    });

    testWidgets('shows "Not started" when no steps have startedAt', (
      tester,
    ) async {
      final snapshot = createTestStateSnapshot(
        steps: const [],
        completedSteps: 0,
        totalSteps: 0,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.websocket,
            ),
          ),
        ),
      );

      expect(find.text('Not started'), findsOneWidget);
    });

    testWidgets('renders completed status badge', (tester) async {
      final snapshot = createTestStateSnapshot(
        status: 'completed',
        completedSteps: 3,
        totalSteps: 3,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.websocket,
            ),
          ),
        ),
      );

      expect(find.text('Completed'), findsOneWidget);
      expect(find.text('3 / 3 steps'), findsOneWidget);
    });

    testWidgets('handles zero totalSteps gracefully', (tester) async {
      final snapshot = createTestStateSnapshot(
        completedSteps: 0,
        totalSteps: 0,
        steps: const [],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionStatusHeader(
              snapshot: snapshot,
              connectionMode: ConnectionMode.websocket,
            ),
          ),
        ),
      );

      expect(find.text('0 / 0 steps'), findsOneWidget);
      // 进度条应该值为 0（不 crash）
      final indicator = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator),
      );
      expect(indicator.value, 0.0);
    });
  });
}
