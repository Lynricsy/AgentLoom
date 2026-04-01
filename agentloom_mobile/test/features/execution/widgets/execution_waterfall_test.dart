import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:agentloom_mobile/features/execution/widgets/execution_waterfall.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ExecutionWaterfall', () {
    testWidgets('只渲染已出现的步骤，并允许点击 agent 卡片', (tester) async {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-1',
        status: 'running',
        completedSteps: 1,
        totalSteps: 3,
        steps: [
          StepSnapshot(
            stepId: 'step-1',
            nodeId: 'node-1',
            nodeName: '未启动节点',
            nodeType: 'http-tool',
            status: 'pending',
          ),
          StepSnapshot(
            stepId: 'step-2',
            nodeId: 'node-2',
            nodeName: '研究 Agent',
            nodeType: 'chat-agent',
            status: 'running',
          ),
          StepSnapshot(
            stepId: 'step-3',
            nodeId: 'node-3',
            nodeName: '格式化节点',
            nodeType: 'transform',
            status: 'completed',
          ),
        ],
        snapshotAt: '2026-03-31T12:00:00.000Z',
      );

      const runtime = ExecutionMonitorRuntimeData(
        appearedStepIds: ['step-2', 'step-3'],
      );

      String? tappedStepId;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionWaterfall(
              snapshot: snapshot,
              runtime: runtime,
              onOpenAgentStep: (step) {
                tappedStepId = step.stepId;
              },
            ),
          ),
        ),
      );

      expect(find.text('未启动节点'), findsNothing);
      expect(find.text('研究 Agent'), findsOneWidget);
      expect(find.text('格式化节点'), findsOneWidget);

      await tester.tap(find.text('研究 Agent'));
      await tester.pumpAndSettle();

      expect(tappedStepId, 'step-2');
      expect(find.text('点击查看 Agent 运行界面'), findsOneWidget);
    });
  });
}
