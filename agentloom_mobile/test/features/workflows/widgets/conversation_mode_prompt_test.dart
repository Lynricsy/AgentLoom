import 'package:agentloom_mobile/features/workflows/models/conversation_plan.dart';
import 'package:agentloom_mobile/features/workflows/widgets/conversation_mode_prompt.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  group('ConversationModePrompt', () {
    testWidgets('渲染对话模式消息', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ConversationModePrompt(onBack: () {})),
        ),
      );
      expect(find.text('此工作流需要对话式交互'), findsOneWidget);
      expect(find.text('请在 Web 端启动此工作流以完成对话式参数收集。'), findsOneWidget);
    });

    testWidgets('显示 chat icon', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ConversationModePrompt(onBack: () {})),
        ),
      );
      expect(find.byIcon(Icons.chat_outlined), findsOneWidget);
    });

    testWidgets('点击返回按钮调用 onBack', (tester) async {
      bool called = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ConversationModePrompt(onBack: () => called = true),
          ),
        ),
      );
      await tester.tap(find.text('返回'));
      expect(called, isTrue);
    });

    testWidgets('should show conversation mode message with schema', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ConversationModePrompt(
              onBack: () {},
              schema: createTestWorkflowInputSchema(
                collectionMode: 'conversation',
              ),
            ),
          ),
        ),
      );

      expect(find.text('此工作流使用对话式交互模式收集参数'), findsOneWidget);
      expect(find.text('请在 Web 端使用完整功能。'), findsOneWidget);
    });

    testWidgets('should show hybrid mode message', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ConversationModePrompt(
              onBack: () {},
              schema: createTestWorkflowInputSchema(collectionMode: 'hybrid'),
            ),
          ),
        ),
      );

      expect(find.text('此工作流使用混合模式（表单+对话）收集参数'), findsOneWidget);
      expect(find.text('请在 Web 端使用完整功能。'), findsOneWidget);
    });

    testWidgets('should show systemPrompt preview when available', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ConversationModePrompt(
              onBack: () {},
              schema: createTestWorkflowInputSchema(
                collectionMode: 'conversation',
                conversationPlan: const ConversationPlan(
                  systemPrompt: '请先询问业务目标，再逐步确认约束。',
                  maxTurns: 5,
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('系统提示词预览'), findsOneWidget);
      expect(find.text('请先询问业务目标，再逐步确认约束。'), findsOneWidget);
      expect(find.text('最多 5 轮对话'), findsOneWidget);
    });
  });
}
