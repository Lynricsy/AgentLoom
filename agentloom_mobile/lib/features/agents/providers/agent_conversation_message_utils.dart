import '../models/conversation_message_dto.dart';
import 'agent_conversation_payloads.dart';

ConversationMessageDto seedAssistantMessage({
  required String messageId,
  required String conversationId,
}) {
  return ConversationMessageDto(
    id: messageId,
    conversationId: conversationId,
    role: MessageRole.assistant,
    content: '',
    toolCalls: const <ConversationToolCallDto>[],
    toolResults: const <ConversationToolResultDto>[],
    metadata: const <String, dynamic>{},
    createdAt: DateTime.now().toIso8601String(),
    segments: const <MessageSegment>[],
    isStreaming: true,
  );
}


List<ConversationToolCallDto> upsertToolCall(
  List<ConversationToolCallDto> toolCalls,
  ToolPayload payload,
) {
  final index = toolCalls.indexWhere((item) => item.id == payload.toolCallId);
  final current = index >= 0 ? toolCalls[index] : null;
  final nextTool = payload.tool != 'unknown_tool' || current == null
      ? payload.tool
      : current.tool;

  final updated = ConversationToolCallDto(
    id: payload.toolCallId,
    tool: nextTool,
    args: payload.args ?? current?.args,
    status: payload.status,
    result: payload.result != null
        ? unwrapMcpResult(payload.result)
        : current?.result,
    error: payload.error ?? current?.error,
    transitions: payload.transitions.isNotEmpty
        ? payload.transitions
        : current?.transitions ?? const <ConversationToolTransitionDto>[],
    permissionRequest: payload.permissionRequest ?? current?.permissionRequest,
    startedAt: current?.startedAt ?? DateTime.now(),
    updatedAt: DateTime.now(),
  );

  if (index < 0) {
    return [...toolCalls, updated];
  }

  final next = [...toolCalls];
  next[index] = updated;
  return next;
}

List<ConversationMessageDto> upsertAssistantMessage(
  List<ConversationMessageDto> messages, {
  required String messageId,
  required String conversationId,
  required ConversationMessageDto Function(ConversationMessageDto current)
  transform,
}) {
  final index = messages.indexWhere((item) => item.id == messageId);
  final current = index >= 0
      ? messages[index]
      : seedAssistantMessage(
          messageId: messageId,
          conversationId: conversationId,
        );
  final updated = transform(current);

  if (index < 0) {
    return [...messages, updated];
  }

  final next = [...messages];
  next[index] = updated;
  return next;
}

List<ConversationMessageDto> finishStreamingMessage(
  List<ConversationMessageDto> messages, {
  String? messageId,
}) {
  if (messages.isEmpty) {
    return messages;
  }

  var targetIndex = -1;
  if (messageId != null) {
    targetIndex = messages.indexWhere((item) => item.id == messageId);
  }
  if (targetIndex < 0) {
    targetIndex = messages.lastIndexWhere(
      (item) => item.role == MessageRole.assistant && item.isStreaming,
    );
  }
  if (targetIndex < 0) {
    return messages;
  }

  final next = [...messages];
  next[targetIndex] = next[targetIndex].copyWith(isStreaming: false);
  return next;
}

List<ConversationMessageDto> upsertMessage(
  List<ConversationMessageDto> messages,
  ConversationMessageDto message,
) {
  final index = messages.indexWhere((item) => item.id == message.id);
  if (index < 0) {
    return [...messages, message];
  }

  final next = [...messages];
  next[index] = message;
  return next;
}

Object? normalizeComparableValue(Object? value) {
  if (value is Map) {
    return {
      for (final entry in value.entries)
        '${entry.key}': normalizeComparableValue(entry.value),
    };
  }

  if (value is List) {
    return value.map(normalizeComparableValue).toList(growable: false);
  }

  return value;
}

bool deepEquals(Object? left, Object? right) {
  if (identical(left, right)) {
    return true;
  }

  if (left is List && right is List) {
    if (left.length != right.length) {
      return false;
    }

    for (var index = 0; index < left.length; index += 1) {
      if (!deepEquals(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (left is Map && right is Map) {
    if (left.length != right.length) {
      return false;
    }

    final normalizedRight = {
      for (final entry in right.entries) '${entry.key}': entry.value,
    };

    for (final entry in left.entries) {
      final key = '${entry.key}';
      if (!normalizedRight.containsKey(key) ||
          !deepEquals(entry.value, normalizedRight[key])) {
        return false;
      }
    }

    return true;
  }

  return left == right;
}

Map<String, Object?> projectComparableMessage(ConversationMessageDto message) {
  final attachments = switch (message.metadata['attachments']) {
    final List<dynamic> values =>
      values.map(normalizeComparableValue).toList(growable: false),
    _ when message.metadata['attachment'] != null => [
      normalizeComparableValue(message.metadata['attachment']),
    ],
    _ => null,
  };

  return <String, Object?>{
    'role': message.role,
    'content': message.content,
    'thinking': message.thinking,
    'attachments': attachments,
    'toolCalls': message.toolCalls
        .map(
          (toolCall) => <String, Object?>{
            'id': toolCall.id,
            'tool': toolCall.tool,
            'status': toolCall.status,
            'args': normalizeComparableValue(toolCall.args),
            'result': normalizeComparableValue(toolCall.result),
            'error': toolCall.error,
          },
        )
        .toList(growable: false),
    'segments': message.segments
        .map(
          (segment) => segment.kind == MessageSegmentKind.toolCall
              ? <String, Object?>{
                  'kind': segment.kind,
                  'toolCallId': segment.toolCallId,
                }
              : <String, Object?>{
                  'kind': segment.kind,
                  'content': segment.content,
                },
        )
        .toList(growable: false),
  };
}

bool areMessagesEquivalent(
  ConversationMessageDto current,
  ConversationMessageDto canonical,
) {
  return deepEquals(
    projectComparableMessage(current),
    projectComparableMessage(canonical),
  );
}

List<ConversationMessageDto> mergeHistoryWithLiveTail(
  List<ConversationMessageDto> currentMessages,
  List<ConversationMessageDto> canonicalMessages,
) {
  if (currentMessages.length < canonicalMessages.length) {
    return canonicalMessages;
  }

  var isCanonicalPrefix = true;
  for (var index = 0; index < canonicalMessages.length; index += 1) {
    final message = canonicalMessages[index];
    final current = currentMessages[index];
    if (!areMessagesEquivalent(current, message)) {
      isCanonicalPrefix = false;
      break;
    }
  }

  if (!isCanonicalPrefix) {
    return canonicalMessages;
  }

  return [
    ...canonicalMessages,
    ...currentMessages.skip(canonicalMessages.length),
  ];
}
