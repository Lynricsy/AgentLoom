import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/widgets/step_timeline_item.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('StepTimelineItem', () {
    testWidgets('renders nodeId and status label', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'my-agent-node',
        nodeName: 'Email Agent',
        nodeType: 'agent',
        status: 'running',
        startedAt: '2026-01-01T10:00:00.000Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.text('Email Agent'), findsOneWidget);
      expect(find.text('agent'), findsOneWidget);
      expect(find.text('my-agent-node'), findsOneWidget);
      expect(find.text('运行中'), findsOneWidget);
    });

    testWidgets('shows duration for completed step', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'completed',
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:00:45.000Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.text('45s'), findsOneWidget);
    });

    testWidgets('shows "Started at" for running step', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'running',
        startedAt: '2026-01-01T10:05:30.000Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.textContaining('开始于'), findsOneWidget);
    });

    testWidgets('shows error message for failed step', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'failed',
        startedAt: '2026-01-01T10:00:00.000Z',
        errorMessage: 'Connection timeout',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: StepTimelineItem(step: step, isLast: true),
            ),
          ),
        ),
      );

      expect(find.text('Connection timeout'), findsAtLeast(1));
    });

    testWidgets('renders pending step without time info', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'pending',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.text('node-1'), findsOneWidget);
      expect(find.text('等待中'), findsOneWidget);
      expect(find.textContaining('开始于'), findsNothing);
    });

    testWidgets('renders sync icon for running status', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'running',
        startedAt: '2026-01-01T10:00:00.000Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.byIcon(Icons.sync), findsOneWidget);
    });

    testWidgets('shows duration in minutes for long-running step', (
      tester,
    ) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'completed',
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:02:30.000Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.text('2m 30s'), findsOneWidget);
    });

    testWidgets('shows milliseconds for very fast step', (tester) async {
      const step = StepSnapshot(
        stepId: 's1',
        nodeId: 'node-1',
        status: 'completed',
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:00:00.500Z',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimelineItem(step: step, isLast: true)),
        ),
      );

      expect(find.text('500ms'), findsOneWidget);
    });
  });
}
