import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/message_bubble.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget createTestWidget(Widget child) {
    return MaterialApp(
      home: Scaffold(body: child),
    );
  }

  testWidgets('检测到 restartSuggestion 时应展示重启卡片并触发回调', (
    tester,
  ) async {
    var restartCount = 0;

    await tester.pumpWidget(
      createTestWidget(
        MessageBubble(
          message: const ConversationMessageDto(
            id: 'assistant-1',
            conversationId: 'conv-001',
            role: MessageRole.assistant,
            content: '已完成自进化发布',
            toolCalls: [
              ConversationToolCallDto(
                id: 'tool-1',
                tool: 'apply_change',
                status: ConversationToolStatus.completed,
                result: {
                  'data': {
                    'restartSuggestion': {
                      'available': true,
                      'publishedVersionNumber': 7,
                    },
                  },
                },
              ),
            ],
            metadata: {
              'segments': [
                {'type': 'text', 'content': '已完成自进化发布'},
                {'type': 'tool_call', 'toolCallId': 'tool-1'},
              ],
            },
            createdAt: '2026-04-02T00:00:00.000Z',
          ),
          onRestartConversation: () async {
            restartCount += 1;
          },
        ),
      ),
    );

    expect(find.text('Agent 已升级到 v7'), findsOneWidget);
    expect(find.text('重启到新版本'), findsOneWidget);

    await tester.tap(find.text('重启到新版本'));
    await tester.pumpAndSettle();

    expect(restartCount, 1);
  });

  testWidgets('tool result 为 JSON 字符串时也应展示重启卡片', (tester) async {
    await tester.pumpWidget(
      createTestWidget(
        MessageBubble(
          message: const ConversationMessageDto(
            id: 'assistant-2',
            conversationId: 'conv-001',
            role: MessageRole.assistant,
            content: '已完成自进化发布',
            toolCalls: [
              ConversationToolCallDto(
                id: 'tool-1',
                tool: 'apply_change',
                status: ConversationToolStatus.completed,
                result:
                    '{"data":{"restartSuggestion":{"available":true,"publishedVersionId":"pub-1","publishedVersionNumber":8}}}',
              ),
            ],
            metadata: {
              'segments': [
                {'type': 'text', 'content': '已完成自进化发布'},
                {'type': 'tool_call', 'toolCallId': 'tool-1'},
              ],
            },
            createdAt: '2026-04-02T00:00:00.000Z',
          ),
          onRestartConversation: () async {},
        ),
      ),
    );

    expect(find.text('Agent 已升级到 v8'), findsOneWidget);
    expect(find.text('重启到新版本'), findsOneWidget);
  });
}
