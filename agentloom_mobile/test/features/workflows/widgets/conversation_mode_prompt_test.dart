import 'package:agentloom_mobile/features/workflows/widgets/conversation_mode_prompt.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
  });
}
