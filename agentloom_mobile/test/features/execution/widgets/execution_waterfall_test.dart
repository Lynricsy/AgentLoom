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

    testWidgets('输出节点卡片可点击并提示详情渲染能力', (tester) async {
      const snapshot = ExecutionStateSnapshot(
        executionId: 'exec-2',
        status: 'completed',
        completedSteps: 2,
        totalSteps: 2,
        steps: [
          StepSnapshot(
            stepId: 'step-output-1',
            nodeId: 'node-output-1',
            nodeName: '最终文本',
            nodeType: 'text-output',
            status: 'completed',
            result: {'content': '# 标题\n\n```dart\nprint(1);\n```'},
          ),
          StepSnapshot(
            stepId: 'step-output-2',
            nodeId: 'node-output-2',
            nodeName: '结构化结果',
            nodeType: 'json-output',
            status: 'completed',
            result: {
              'json': {
                'score': 42,
                'items': ['a', 'b'],
              },
            },
          ),
        ],
      );

      const runtime = ExecutionMonitorRuntimeData(
        appearedStepIds: ['step-output-1', 'step-output-2'],
      );

      String? tappedStepId;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExecutionWaterfall(
              snapshot: snapshot,
              runtime: runtime,
              onOpenOutputStep: (step) {
                tappedStepId = step.stepId;
              },
            ),
          ),
        ),
      );

      expect(find.text('最终文本'), findsOneWidget);
      expect(find.text('结构化结果'), findsOneWidget);
      expect(find.text('点击查看输出详情'), findsNothing);
      expect(find.text('打开后可查看 Markdown、LaTeX、Mermaid 与代码块。'), findsOneWidget);
      expect(find.text('打开后可查看结构化 JSON 与原文兜底。'), findsOneWidget);

      await tester.tap(find.text('结构化结果'));
      await tester.pumpAndSettle();

      expect(tappedStepId, 'step-output-2');
    });
  });
}
