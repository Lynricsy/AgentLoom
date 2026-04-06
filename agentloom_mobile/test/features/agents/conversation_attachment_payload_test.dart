import 'package:agentloom_mobile/features/agents/conversation_attachment_payload.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('conversation_attachment_payload', () {
    test('多附件输出应生成 attachments 元数据并在混合类型时使用 text contentType', () {
      final payload = buildConversationOutgoingMessage(
        attachments: const [
          ConversationDraftAttachment(
            kind: 'image',
            fileName: 'design.png',
            mimeType: 'image/png',
            sizeBytes: 32,
            dataBase64: 'cG5n',
          ),
          ConversationDraftAttachment(
            kind: 'file',
            fileName: 'notes.txt',
            mimeType: 'text/plain',
            sizeBytes: 24,
            textContent: 'ATTACH-QA-20260406',
          ),
        ],
      );

      expect(payload.content, '已上传 2 个附件');
      expect(payload.contentType, 'text');
      expect(payload.metadata, {
        'contentType': 'text',
        'attachments': [
          {
            'kind': 'image',
            'fileName': 'design.png',
            'mimeType': 'image/png',
            'sizeBytes': 32,
            'dataBase64': 'cG5n',
          },
          {
            'kind': 'file',
            'fileName': 'notes.txt',
            'mimeType': 'text/plain',
            'sizeBytes': 24,
            'textContent': 'ATTACH-QA-20260406',
          },
        ],
      });
    });

    test('单消息附件总量超过 10 MB 时应抛错', () {
      expect(
        () => validateConversationAttachmentTotalBytes(const [
          ConversationDraftAttachment(
            kind: 'file',
            fileName: 'a.bin',
            mimeType: 'application/octet-stream',
            sizeBytes: 6_000_000,
            dataBase64: 'YQ==',
          ),
          ConversationDraftAttachment(
            kind: 'file',
            fileName: 'b.bin',
            mimeType: 'application/octet-stream',
            sizeBytes: 4_500_001,
            dataBase64: 'Yg==',
          ),
        ]),
        throwsException,
      );
    });
  });
}
