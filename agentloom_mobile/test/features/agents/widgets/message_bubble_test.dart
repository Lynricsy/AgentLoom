import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/message_bubble.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0p1xQAAAAASUVORK5CYII=';

void main() {
  Widget createTestWidget(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  testWidgets('检测到 restartSuggestion 时应展示重启卡片并触发回调', (tester) async {
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

  testWidgets('用户文件附件应展示文件卡片与文本预览', (tester) async {
    await tester.pumpWidget(
      createTestWidget(
        const MessageBubble(
          message: ConversationMessageDto(
            id: 'user-attachment-1',
            conversationId: 'conv-001',
            role: MessageRole.user,
            content: '已上传文件 notes.txt',
            metadata: {
              'attachment': {
                'kind': 'file',
                'fileName': 'notes.txt',
                'mimeType': 'text/plain',
                'sizeBytes': 18,
                'textContent': 'ATTACH-QA-20260406',
              },
            },
            createdAt: '2026-04-06T00:00:00.000Z',
          ),
        ),
      ),
    );

    expect(find.text('notes.txt'), findsOneWidget);
    expect(find.text('ATTACH-QA-20260406'), findsOneWidget);
  });

  testWidgets('用户图片附件应展示图片预览与文件名', (tester) async {
    await tester.pumpWidget(
      createTestWidget(
        const MessageBubble(
          message: ConversationMessageDto(
            id: 'user-image-1',
            conversationId: 'conv-001',
            role: MessageRole.user,
            content: '已上传图片 tiny.png',
            metadata: {
              'attachment': {
                'kind': 'image',
                'fileName': 'tiny.png',
                'mimeType': 'image/png',
                'sizeBytes': 68,
                'dataBase64': _tinyPngBase64,
              },
            },
            createdAt: '2026-04-06T00:00:00.000Z',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('tiny.png'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('无效图片 base64 时应降级到附件提示', (tester) async {
    await tester.pumpWidget(
      createTestWidget(
        const MessageBubble(
          message: ConversationMessageDto(
            id: 'user-image-2',
            conversationId: 'conv-001',
            role: MessageRole.user,
            content: '已上传图片 broken.png',
            metadata: {
              'attachment': {
                'kind': 'image',
                'fileName': 'broken.png',
                'mimeType': 'image/png',
                'sizeBytes': 12,
                'dataBase64': '@@bad-base64@@',
              },
            },
            createdAt: '2026-04-06T00:00:00.000Z',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('broken.png'), findsOneWidget);
    expect(find.text('图片已随消息发送给 Agent。'), findsOneWidget);
  });
}
