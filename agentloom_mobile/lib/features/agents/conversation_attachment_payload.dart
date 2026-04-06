import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

const _maxConversationAttachmentBytes = 1500000;
const _maxConversationTextAttachmentBytes = 200000;
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

String _describeAttachmentContent({required bool image, required String name}) {
  return '已上传${image ? '图片' : '文件'} $name';
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

ConversationAttachmentPayload buildConversationAttachmentMessage({
  required PlatformFile file,
  required Uint8List bytes,
  required bool image,
  String? content,
}) {
  if (bytes.length > _maxConversationAttachmentBytes) {
    throw Exception('文件大小不能超过 1.5 MB');
  }

  final mimeType = _inferMimeType(file, image: image);
  final normalizedContent = (content != null && content.trim().isNotEmpty)
      ? content.trim()
      : _describeAttachmentContent(image: image, name: file.name);

  if (image) {
    return (
      content: normalizedContent,
      contentType: 'image',
      metadata: <String, dynamic>{
        'attachment': <String, dynamic>{
          'kind': 'image',
          'fileName': file.name,
          'mimeType': mimeType,
          'sizeBytes': bytes.length,
          'dataBase64': base64Encode(bytes),
        },
      },
    );
  }

  if (_isLikelyTextAttachment(file) &&
      bytes.length <= _maxConversationTextAttachmentBytes) {
    return (
      content: normalizedContent,
      contentType: 'file',
      metadata: <String, dynamic>{
        'attachment': <String, dynamic>{
          'kind': 'file',
          'fileName': file.name,
          'mimeType': mimeType,
          'sizeBytes': bytes.length,
          'textContent': utf8.decode(bytes, allowMalformed: true),
        },
      },
    );
  }

  return (
    content: normalizedContent,
    contentType: 'file',
    metadata: <String, dynamic>{
      'attachment': <String, dynamic>{
        'kind': 'file',
        'fileName': file.name,
        'mimeType': mimeType,
        'sizeBytes': bytes.length,
        'dataBase64': base64Encode(bytes),
      },
    },
  );
}
