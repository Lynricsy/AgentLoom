import 'package:agentloom_mobile/features/agents/conversation_attachment_payload.dart';
import 'package:agentloom_mobile/features/agents/widgets/conversation_input_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget createTestWidget(Widget child) {
    return MaterialApp(home: Scaffold(body: child));
  }

  testWidgets('存在附件草稿时应展示预览并允许直接发送', (tester) async {
    final controller = TextEditingController();
    var sendCount = 0;
    var removedIndex = -1;

    await tester.pumpWidget(
      createTestWidget(
        ConversationInputBar(
          controller: controller,
          onSend: () {
            sendCount += 1;
          },
          onPickFile: () {},
          onPickImage: () {},
          isBusy: false,
          attachments: const [
            ConversationDraftAttachment(
              kind: 'file',
              fileName: 'notes.txt',
              mimeType: 'text/plain',
              sizeBytes: 18,
              textContent: 'ATTACH-QA-20260406',
            ),
          ],
          onRemoveAttachment: (index) {
            removedIndex = index;
          },
        ),
      ),
    );

    expect(find.text('notes.txt'), findsOneWidget);
    expect(find.byIcon(Icons.send), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('send-button')));
    await tester.pumpAndSettle();
    expect(sendCount, 1);

    await tester.tap(find.byTooltip('移除附件'));
    await tester.pumpAndSettle();
    expect(removedIndex, 0);
  });
}
