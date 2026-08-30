import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

const maxConversationAttachmentBytes = 1500000;
const maxConversationAttachmentTotalBytes = 10000000;
const maxConversationTextAttachmentBytes = 200000;

const _textAttachmentExtensions = <String>{
  'txt',
  'md',
  'markdown',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'xml',
  'csv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'sql',
  'html',
  'css',
  'scss',
  'sh',
  'bash',
  'zsh',
  'env',
  'toml',
  'ini',
  'log',
};

typedef ConversationAttachmentPayload = ({
  String content,
  String contentType,
  Map<String, dynamic> metadata,
});

class ConversationDraftAttachment {
  const ConversationDraftAttachment({
    required this.kind,
    required this.fileName,
    required this.mimeType,
    required this.sizeBytes,
    this.dataBase64,
    this.textContent,
  });

  final String kind;
  final String fileName;
  final String mimeType;
  final int sizeBytes;
  final String? dataBase64;
  final String? textContent;

  Map<String, dynamic> toMetadata() {
    return <String, dynamic>{
      'kind': kind,
      'fileName': fileName,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
      if (dataBase64 != null) 'dataBase64': dataBase64,
      if (textContent != null) 'textContent': textContent,
    };
  }
}

String describeConversationAttachmentsSummary(
  List<ConversationDraftAttachment> attachments,
) {
  if (attachments.isEmpty) {
    return '';
  }

  if (attachments.length == 1) {
    final attachment = attachments.first;
    return '已上传${attachment.kind == 'image' ? '图片' : '文件'} ${attachment.fileName}';
  }

  return '已上传 ${attachments.length} 个附件';
}

bool isConversationAttachmentAutoSummary(
  String content,
  List<ConversationDraftAttachment> attachments,
) {
  if (attachments.isEmpty) {
    return false;
  }

  return content.trim() == describeConversationAttachmentsSummary(attachments);
}

String inferConversationAttachmentContentType(
  List<ConversationDraftAttachment> attachments,
) {
  if (attachments.isEmpty) {
    return 'text';
  }

  final firstKind = attachments.first.kind;
  final homogeneous = attachments.every(
    (attachment) => attachment.kind == firstKind,
  );
  return homogeneous ? firstKind : 'text';
}

int getConversationAttachmentTotalBytes(
  List<ConversationDraftAttachment> attachments,
) {
  return attachments.fold<int>(
    0,
    (sum, attachment) => sum + attachment.sizeBytes,
  );
}

void validateConversationAttachmentTotalBytes(
  List<ConversationDraftAttachment> attachments,
) {
  if (getConversationAttachmentTotalBytes(attachments) >
      maxConversationAttachmentTotalBytes) {
    throw Exception('单条消息附件总大小不能超过 10 MB');
  }
}

Map<String, dynamic> buildConversationAttachmentsMetadata(
  List<ConversationDraftAttachment> attachments, {
  String? contentType,
}) {
  final serializedAttachments = attachments
      .map((attachment) => attachment.toMetadata())
      .toList(growable: false);
  return <String, dynamic>{
    'contentType': ?contentType,
    'attachments': serializedAttachments,
    if (serializedAttachments.length == 1)
      'attachment': serializedAttachments.first,
  };
}

ConversationAttachmentPayload buildConversationOutgoingMessage({
  required List<ConversationDraftAttachment> attachments,
  String? content,
}) {
  final trimmed = content?.trim() ?? '';
  final normalizedContent = trimmed.isNotEmpty
      ? trimmed
      : describeConversationAttachmentsSummary(attachments);
  final contentType = inferConversationAttachmentContentType(attachments);

  return (
    content: normalizedContent,
    contentType: contentType,
    metadata: buildConversationAttachmentsMetadata(
      attachments,
      contentType: contentType,
    ),
  );
}

String _inferMimeType(PlatformFile file, {required bool image}) {
  final extension = file.extension?.toLowerCase();
  if (image) {
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/png';
    }
  }

  switch (extension) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'json':
    case 'jsonl':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'csv':
      return 'text/csv';
    case 'html':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'txt':
    case 'log':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

bool _isLikelyTextAttachment(PlatformFile file) {
  final extension = file.extension?.toLowerCase();
  return extension != null && _textAttachmentExtensions.contains(extension);
}

ConversationDraftAttachment buildConversationDraftAttachment({
  required PlatformFile file,
  required Uint8List bytes,
  required bool image,
}) {
  if (bytes.length > maxConversationAttachmentBytes) {
    throw Exception('文件大小不能超过 1.5 MB');
  }

  final mimeType = _inferMimeType(file, image: image);
  if (image) {
    return ConversationDraftAttachment(
      kind: 'image',
      fileName: file.name,
      mimeType: mimeType,
      sizeBytes: bytes.length,
      dataBase64: base64Encode(bytes),
    );
  }

  if (_isLikelyTextAttachment(file) &&
      bytes.length <= maxConversationTextAttachmentBytes) {
    return ConversationDraftAttachment(
      kind: 'file',
      fileName: file.name,
      mimeType: mimeType,
      sizeBytes: bytes.length,
      textContent: utf8.decode(bytes, allowMalformed: true),
    );
  }

  return ConversationDraftAttachment(
    kind: 'file',
    fileName: file.name,
    mimeType: mimeType,
    sizeBytes: bytes.length,
    dataBase64: base64Encode(bytes),
  );
}

ConversationAttachmentPayload buildConversationAttachmentMessage({
  required PlatformFile file,
  required Uint8List bytes,
  required bool image,
  String? content,
}) {
  final attachment = buildConversationDraftAttachment(
    file: file,
    bytes: bytes,
    image: image,
  );

  return buildConversationOutgoingMessage(
    attachments: [attachment],
    content: content,
  );
}
