import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/tool_call_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget createTestWidget(Widget child) {
    return MaterialApp(
      home: Scaffold(body: child),
    );
  }

  testWidgets('rememberable 权限请求应展示四个授权按钮并透传 rememberScope', (
    tester,
  ) async {
    String? capturedAction;
    String? capturedRememberScope;

    await tester.pumpWidget(
      createTestWidget(
        ToolCallCard(
          toolCall: const ConversationToolCallDto(
            id: 'tool-1',
            tool: 'apply_change',
            status: ConversationToolStatus.awaitingPermission,
            permissionRequest: ConversationToolPermissionRequestDto(
              description: '主人授权后，Agent 将修改自身编排',
              category: 'agent_self_canvas_edit',
              riskLevel: 'medium',
              sourceLabel: '主 Agent',
              targetType: 'agent',
              targetLabel: '当前 Agent',
              approveEffect: '立即应用到当前草稿',
              denyEffect: '不会修改当前编排',
              diffPreview: {'summary': '新增一个 skill 节点'},
              rememberable: true,
            ),
          ),
          onResolvePermission: (
            toolCallId,
            action, {
            rememberScope,
          }) async {
            capturedAction = action;
            capturedRememberScope = rememberScope;
          },
        ),
      ),
    );

    expect(find.text('自编排修改'), findsOneWidget);
    expect(find.text('中风险'), findsOneWidget);
    expect(find.text('主人授权后，Agent 将修改自身编排'), findsOneWidget);
    expect(find.text('本会话同类始终允许'), findsOneWidget);
    expect(find.text('本会话同类始终拒绝'), findsOneWidget);

    await tester.tap(find.text('本会话同类始终允许'));
    await tester.pumpAndSettle();

    expect(capturedAction, 'approve');
    expect(capturedRememberScope, 'conversation_category');
  });
}
