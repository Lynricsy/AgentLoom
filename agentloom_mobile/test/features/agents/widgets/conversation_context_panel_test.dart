import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/agents/widgets/conversation_context_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrapWithMaterial(Widget child) {
  return MaterialApp(home: Scaffold(body: child));
}

void main() {
  testWidgets('工作区已加载但目录为空时应显示没有文件树', (tester) async {
    await tester.pumpWidget(
      _wrapWithMaterial(
        ConversationContextPanel(
          state: const ConversationState(hasLoadedWorkspaceTree: true),
          onRefreshWorkspace: () async {},
          onOpenFile: (_) async {},
        ),
      ),
    );

    await tester.tap(find.text('工作区'));
    await tester.pumpAndSettle();

    expect(find.text('没有文件树'), findsOneWidget);
    expect(find.text('工作区暂不可见'), findsNothing);
  });

  testWidgets('tree-only 模式应显示目录结构保留提示', (tester) async {
    await tester.pumpWidget(
      _wrapWithMaterial(
        ConversationContextPanel(
          state: const ConversationState(
            hasLoadedWorkspaceTree: true,
            workspaceTreeOnly: true,
            workspacePreviewUnavailableReason: '此运行已结束，仅保留工作区目录结构，未保留文件内容预览',
            fileTree: [
              WorkspaceFileNode(
                name: 'summary.txt',
                path: 'summary.txt',
                type: 'file',
              ),
            ],
            selectedFilePath: 'summary.txt',
          ),
          onRefreshWorkspace: () async {},
          onOpenFile: (_) async {},
        ),
      ),
    );

    await tester.tap(find.text('工作区'));
    await tester.pumpAndSettle();

    expect(find.text('仅保留目录结构'), findsOneWidget);
    expect(find.textContaining('未保留文件内容预览'), findsOneWidget);
  });
}
