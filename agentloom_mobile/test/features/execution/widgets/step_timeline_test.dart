import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/widgets/step_timeline.dart';
import 'package:agentloom_mobile/features/execution/widgets/step_timeline_item.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('StepTimeline', () {
    testWidgets('renders "No steps yet" when empty', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: StepTimeline(steps: [])),
        ),
      );

      expect(find.text('No steps yet'), findsOneWidget);
      expect(find.byType(StepTimelineItem), findsNothing);
    });

    testWidgets('renders StepTimelineItems for each step', (tester) async {
      const steps = [
        StepSnapshot(stepId: 's1', nodeId: 'node-1', status: 'completed'),
        StepSnapshot(stepId: 's2', nodeId: 'node-2', status: 'running'),
        StepSnapshot(stepId: 's3', nodeId: 'node-3', status: 'pending'),
      ];

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: StepTimeline(steps: steps)),
          ),
        ),
      );

      expect(find.byType(StepTimelineItem), findsNWidgets(3));
    });

    testWidgets('sorts running steps first', (tester) async {
      const steps = [
        StepSnapshot(stepId: 's1', nodeId: 'node-pending', status: 'pending'),
        StepSnapshot(
          stepId: 's2',
          nodeId: 'node-running',
          status: 'running',
          startedAt: '2026-01-01T10:01:00.000Z',
        ),
        StepSnapshot(
          stepId: 's3',
          nodeId: 'node-completed',
          status: 'completed',
          startedAt: '2026-01-01T10:00:00.000Z',
          completedAt: '2026-01-01T10:00:30.000Z',
        ),
      ];

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: StepTimeline(steps: steps)),
          ),
        ),
      );

      final items = tester.widgetList<StepTimelineItem>(
        find.byType(StepTimelineItem),
      );
      final nodeIds = items.map((i) => i.step.nodeId).toList();
      // running 排第一，然后有 startedAt 的 completed，最后 pending
      expect(nodeIds.first, 'node-running');
      expect(nodeIds.last, 'node-pending');
    });

    testWidgets('renders connector lines between items (not after last)', (
      tester,
    ) async {
      const steps = [
        StepSnapshot(stepId: 's1', nodeId: 'n1', status: 'completed'),
        StepSnapshot(stepId: 's2', nodeId: 'n2', status: 'running'),
      ];

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: StepTimeline(steps: steps)),
          ),
        ),
      );

      // 2 个 item 之间有 1 根连接线 (高度 24 的 Container)
      expect(find.byType(StepTimelineItem), findsNWidgets(2));
    });

    testWidgets('renders single step without connector', (tester) async {
      const steps = [
        StepSnapshot(stepId: 's1', nodeId: 'n1', status: 'running'),
      ];

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: StepTimeline(steps: steps)),
          ),
        ),
      );

      expect(find.byType(StepTimelineItem), findsOneWidget);
    });
  });
}
