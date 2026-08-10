import '../../features/agents/models/conversation_message_dto.dart';

Map<String, dynamic> asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

String? readString(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return null;
}

List<String> readStringList(Object? value) {
  if (value is! List) {
    return const <String>[];
  }

  return value
      .whereType<String>()
      .where((item) => item.trim().isNotEmpty)
      .toList(growable: false);
}

String? collectThinkingSegments(List<MessageSegment> segments) {
  final parts = segments
      .where((segment) => segment.kind == MessageSegmentKind.thinking)
      .map((segment) => segment.content?.trim() ?? '')
      .where((content) => content.isNotEmpty)
      .toList(growable: false);
  if (parts.isEmpty) {
    return null;
  }
  return parts.join('\n\n');
}

List<MessageSegment> appendTextSegment(
  List<MessageSegment> segments,
  String chunk,
) {
  if (segments.isEmpty || segments.last.kind != MessageSegmentKind.text) {
    return [...segments, MessageSegment.text(chunk)];
  }

  final updated = [...segments];
  final last = updated.removeLast();
  updated.add(MessageSegment.text('${last.content ?? ''}$chunk'));
  return updated;
}

List<MessageSegment> appendThinkingSegment(
  List<MessageSegment> segments,
  String content,
) {
  if (segments.isEmpty || segments.last.kind != MessageSegmentKind.thinking) {
    return [...segments, MessageSegment.thinking(content)];
  }

  final updated = [...segments];
  final last = updated.removeLast();
  updated.add(MessageSegment.thinking('${last.content ?? ''}$content'));
  return updated;
}

List<MessageSegment> ensureToolSegment(
  List<MessageSegment> segments,
  String toolCallId,
) {
  final exists = segments.any(
    (segment) =>
        segment.kind == MessageSegmentKind.toolCall &&
        segment.toolCallId == toolCallId,
  );
  if (exists) {
    return segments;
  }
  return [...segments, MessageSegment.toolCall(toolCallId)];
}
