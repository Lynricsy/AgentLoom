import 'dart:convert';

import '../../../shared/conversation/conversation_normalizers.dart';
import '../api/agent_api.dart';
import '../models/conversation_message_dto.dart';

typedef ChunkPayload = ({
  String conversationId,
  String messageId,
  String chunk,
});
typedef ThinkingPayload = ({
  String conversationId,
  String messageId,
  String content,
});
typedef ToolPayload = ({
  String conversationId,
  String messageId,
  String toolCallId,
  String tool,
  Object? args,
  ConversationToolStatus status,
  Object? result,
  String? error,
  List<ConversationToolTransitionDto> transitions,
  ConversationToolPermissionRequestDto? permissionRequest,
});
typedef TerminalPayload = ({
  String conversationId,
  String output,
  String? command,
  String? sessionId,
});
typedef FileChangePayload = ({
  String conversationId,
  String path,
  String changeType,
  String? diff,
  String? content,
});
typedef DonePayload = ({String conversationId, String? messageId});
typedef StatusPayload = ({
  String conversationId,
  String status,
  String? phase,
  String? failedPhase,
  String? error,
  String? errorMessage,
  bool? sandboxReused,
});
typedef ConversationHistorySnapshot = ({
  List<ConversationMessageDto> messages,
  String? runningState,
  String? errorMessage,
  PreparationPhase? failedPhase,
  String? loadedPublishedVersionId,
});
typedef ConversationBootstrap = ({
  String runtimeMode,
  String? workspacePreviewId,
  String? tenantId,
});

bool? readBool(Object? value) {
  if (value is bool) {
    return value;
  }
  return null;
}
Map<String, dynamic>? asNullableMap(Object? value) {
  final map = asMap(value);
  return map.isEmpty ? null : map;
}



DateTime readTimestamp(Object? value) {
  final raw = readString(value);
  if (raw == null) {
    return DateTime.now();
  }
  return DateTime.tryParse(raw) ?? DateTime.now();
}

ConversationToolStatus? readToolStatus(Object? value) {
  switch (readString(value)) {
    case 'pending':
      return ConversationToolStatus.pending;
    case 'awaiting_permission':
      return ConversationToolStatus.awaitingPermission;
    case 'denied':
      return ConversationToolStatus.denied;
    case 'in_progress':
      return ConversationToolStatus.inProgress;
    case 'completed':
      return ConversationToolStatus.completed;
    case 'failed':
      return ConversationToolStatus.failed;
    default:
      return null;
  }
}

ConversationToolStatus normalizeToolStatus(
  Object? value, {
  Object? error,
  Object? result,
}) {
  final explicit = readToolStatus(value);
  if (explicit != null) {
    return explicit;
  }
  if (error != null) {
    return ConversationToolStatus.failed;
  }
  if (result != null) {
    return ConversationToolStatus.completed;
  }
  return ConversationToolStatus.pending;
}

ConversationStatus normalizeConversationStatus(Object? value) {
  switch (readString(value)) {
    case 'running':
    case 'executing':
      return ConversationStatus.executing;
    case 'error':
    case 'failed':
      return ConversationStatus.error;
    case 'completed':
    case 'cancelled':
    case 'idle':
    default:
      return ConversationStatus.connected;
  }
}

ConversationToolPermissionRequestDto? normalizePermissionRequest(
  Object? value,
) {
  final payload = asMap(value);
  if (payload.isEmpty) {
    return null;
  }

  final description = readString(payload['description']);
  final resourcePaths = readStringList(
    payload['resourcePaths'] ?? payload['resource_paths'],
  );
  final domain = readString(payload['domain']);
  final category = readString(payload['category']);
  final riskLevel = readString(payload['riskLevel'] ?? payload['risk_level']);
  final sourceLabel = readString(
    payload['sourceLabel'] ?? payload['source_label'],
  );
  final targetType = readString(
    payload['targetType'] ?? payload['target_type'],
  );
  final targetLabel = readString(
    payload['targetLabel'] ?? payload['target_label'],
  );
  final approveEffect = readString(
    payload['approveEffect'] ?? payload['approve_effect'],
  );
  final denyEffect = readString(
    payload['denyEffect'] ?? payload['deny_effect'],
  );
  final diffPreview = asNullableMap(
    payload['diffPreview'] ?? payload['diff_preview'],
  );
  final rememberable = readBool(
    payload['rememberable'] ?? payload['remember_able'],
  );

  if (description == null &&
      resourcePaths.isEmpty &&
      domain == null &&
      category == null &&
      riskLevel == null &&
      sourceLabel == null &&
      targetType == null &&
      targetLabel == null &&
      approveEffect == null &&
      denyEffect == null &&
      diffPreview == null &&
      rememberable == null) {
    return null;
  }

  return ConversationToolPermissionRequestDto(
    description: description,
    resourcePaths: resourcePaths,
    domain: domain,
    category: category,
    riskLevel: riskLevel,
    sourceLabel: sourceLabel,
    targetType: targetType,
    targetLabel: targetLabel,
    approveEffect: approveEffect,
    denyEffect: denyEffect,
    diffPreview: diffPreview,
    rememberable: rememberable,
  );
}

List<ConversationToolTransitionDto> normalizeTransitions(Object? value) {
  if (value is! List) {
    return const <ConversationToolTransitionDto>[];
  }

  final transitions = <ConversationToolTransitionDto>[];
  for (final item in value) {
    final payload = asMap(item);
    final to = readToolStatus(payload['to']);
    final timestamp = readString(payload['timestamp']);
    final source = readString(payload['source']);
    if (to == null ||
        timestamp == null ||
        (source != 'runtime' && source != 'worker' && source != 'user')) {
      continue;
    }

    transitions.add(
      ConversationToolTransitionDto(
        from: readToolStatus(payload['from']),
        to: to,
        timestamp: timestamp,
        source: source!,
      ),
    );
  }

  return transitions;
}

String? extractThinkingContent(Map<String, dynamic> metadata) {
  final decision = asMap(metadata['decision']);
  if (decision.isEmpty) {
    return null;
  }

  final parts = <String>[
    if (readString(decision['rationale']) case final rationale?) rationale,
    if (readString(decision['suggestedContent']) case final suggestedContent?)
      suggestedContent,
  ];

  if (parts.isEmpty) {
    return null;
  }

  return parts.join('\n\n');
}

Object? unwrapMcpResult(Object? value) {
  final parsed = parseJsonLike(value);

  final payload = asMap(parsed);
  if (payload.isEmpty) {
    return parsed;
  }

  final content = payload['content'];
  if (content is! List || content.isEmpty) {
    return parsed;
  }

  final textParts = <String>[];
  for (final item in content) {
    final entry = asMap(item);
    if (entry['type'] == 'text' && entry['text'] is String) {
      textParts.add(entry['text'] as String);
    }
  }

  if (textParts.isEmpty) {
    return parsed;
  }

  return parseJsonLike(textParts.join(''));
}

Object? parseJsonLike(Object? value) {
  if (value is! String) {
    return value;
  }

  try {
    return jsonDecode(value);
  } catch (_) {
    return value;
  }
}

List<ConversationToolCallDto> normalizeHistoryToolCalls(
  ConversationMessageDto message,
) {
  final toolCalls = message.toolCalls
      .map(
        (toolCall) => toolCall.copyWith(
          result: unwrapMcpResult(toolCall.result),
          startedAt: toolCall.startedAt ?? readTimestamp(message.createdAt),
          updatedAt: toolCall.updatedAt ?? readTimestamp(message.createdAt),
        ),
      )
      .toList(growable: true);

  for (final result in message.toolResults) {
    final toolCallId = result.toolCallId;
    final index = toolCallId == null
        ? -1
        : toolCalls.indexWhere((item) => item.id == toolCallId);

    final nextTool = readString(result.tool) ?? 'unknown_tool';
    final nextStatus =
        result.status ??
        normalizeToolStatus(null, error: result.error, result: result.result);

    if (index >= 0) {
      final current = toolCalls[index];
      toolCalls[index] = current.copyWith(
        tool: current.tool == 'unknown_tool' ? nextTool : current.tool,
        status: nextStatus,
        result: result.result != null
            ? unwrapMcpResult(result.result)
            : current.result,
        error: result.error ?? current.error,
        updatedAt: DateTime.now(),
      );
      continue;
    }

    if ((toolCallId == null || toolCallId.isEmpty) &&
        (readString(result.tool) == null)) {
      continue;
    }

    toolCalls.add(
      ConversationToolCallDto(
        id:
            toolCallId ??
            'tool-result-${DateTime.now().microsecondsSinceEpoch}',
        tool: nextTool,
        status: nextStatus,
        result: unwrapMcpResult(result.result),
        error: result.error,
        transitions: const <ConversationToolTransitionDto>[],
        startedAt: readTimestamp(message.createdAt),
        updatedAt: DateTime.now(),
      ),
    );
  }

  return toolCalls;
}

ConversationMessageDto normalizeHistoryMessage(
  ConversationMessageDto message,
) {
  final toolCalls = normalizeHistoryToolCalls(message);
  final segments = normalizeHistorySegments(message, toolCalls);
  final thinking =
      extractThinkingContent(message.metadata) ??
      collectThinkingSegments(segments);

  return message.copyWith(
    toolCalls: toolCalls,
    thinking: thinking,
    segments: segments,
    isStreaming: false,
  );
}

List<MessageSegment> normalizeHistorySegments(
  ConversationMessageDto message,
  List<ConversationToolCallDto> toolCalls,
) {
  final rawSegments = message.metadata['segments'];
  if (rawSegments is List) {
    final segments = <MessageSegment>[];
    for (final rawSegment in rawSegments) {
      final segment = asMap(rawSegment);
      final type = readString(segment['type']);
      if (type == 'text' || type == 'thinking') {
        final content = readString(segment['content']);
        if (content == null || content.isEmpty) {
          continue;
        }

        segments.add(
          type == 'thinking'
              ? MessageSegment.thinking(content)
              : MessageSegment.text(content),
        );
        continue;
      }

      if (type == 'tool_call') {
        final toolCallId =
            readString(segment['toolCallId']) ??
            readString(segment['tool_call_id']);
        if (toolCallId != null &&
            toolCalls.any((toolCall) => toolCall.id == toolCallId)) {
          segments.add(MessageSegment.toolCall(toolCallId));
        }
      }
    }

    if (segments.isNotEmpty) {
      return segments;
    }
  }

  return <MessageSegment>[
    if (extractThinkingContent(message.metadata) case final thinking?
        when thinking.trim().isNotEmpty)
      MessageSegment.thinking(thinking),
    if (message.content.trim().isNotEmpty) MessageSegment.text(message.content),
    for (final toolCall in toolCalls) MessageSegment.toolCall(toolCall.id),
  ];
}

({
  Map<String, dynamic> root,
  Map<String, dynamic> data,
  Map<String, dynamic> event,
})
unwrapConversationPayload(Object? raw) {
  final root = asMap(raw);
  final data = asMap(root['data']);
  final event = asMap(root['event']);
  return (root: root, data: data, event: event);
}

ChunkPayload? normalizeMessageChunkPayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final chunk =
      readString(payload.root['chunk']) ??
      readString(payload.data['chunk']) ??
      readString(payload.event['content']) ??
      readString(payload.data['content']);
  if (chunk == null) {
    return null;
  }

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        readString(payload.root['messageId']) ??
        readString(payload.data['messageId']) ??
        readString(payload.root['stepId']) ??
        readString(payload.data['stepId']) ??
        readString(payload.root['executionId']) ??
        'assistant-stream',
    chunk: chunk,
  );
}

ThinkingPayload? normalizeThinkingPayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final content =
      readString(payload.root['content']) ??
      readString(payload.data['content']) ??
      readString(payload.event['content']) ??
      readString(payload.event['rationale']) ??
      readString(payload.event['suggestedContent']);
  if (content == null) {
    return null;
  }

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        readString(payload.root['messageId']) ??
        readString(payload.data['messageId']) ??
        readString(payload.root['stepId']) ??
        readString(payload.data['stepId']) ??
        readString(payload.root['executionId']) ??
        'assistant-stream',
    content: content,
  );
}

ToolPayload? normalizeToolPayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final call = asMap(payload.event['call']);
  final toolCallId =
      readString(payload.root['toolCallId']) ??
      readString(payload.data['toolCallId']) ??
      readString(call['id']) ??
      readString(payload.root['id']);
  if (toolCallId == null) {
    return null;
  }

  final result = payload.root.containsKey('result')
      ? payload.root['result']
      : payload.data.containsKey('result')
      ? payload.data['result']
      : call.containsKey('result')
      ? call['result']
      : null;
  final error =
      readString(payload.root['error']) ??
      readString(payload.data['error']) ??
      readString(call['error']);

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        readString(payload.root['messageId']) ??
        readString(payload.data['messageId']) ??
        readString(payload.root['stepId']) ??
        readString(payload.data['stepId']) ??
        readString(payload.root['executionId']) ??
        'assistant-stream',
    toolCallId: toolCallId,
    tool:
        readString(payload.root['tool']) ??
        readString(payload.root['toolName']) ??
        readString(payload.root['name']) ??
        readString(payload.data['tool']) ??
        readString(payload.data['toolName']) ??
        readString(payload.data['name']) ??
        readString(payload.event['toolName']) ??
        readString(call['tool']) ??
        'unknown_tool',
    args: payload.root.containsKey('args')
        ? payload.root['args']
        : payload.data.containsKey('args')
        ? payload.data['args']
        : call['args'],
    status: normalizeToolStatus(
      payload.root['status'] ?? payload.data['status'] ?? call['status'],
      error: error,
      result: result,
    ),
    result: result,
    error: error,
    transitions: normalizeTransitions(
      payload.root['transitions'] ??
          payload.data['transitions'] ??
          call['transitions'],
    ),
    permissionRequest: normalizePermissionRequest(
      payload.root['permissionRequest'] ??
          payload.data['permissionRequest'] ??
          call['permissionRequest'],
    ),
  );
}

TerminalPayload? normalizeTerminalPayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final output =
      readString(payload.root['output']) ??
      readString(payload.data['output']) ??
      readString(payload.event['data']) ??
      (payload.root['data'] is String ? payload.root['data'] as String : null);
  if (output == null) {
    return null;
  }

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    output: output,
    command:
        readString(payload.root['command']) ??
        readString(payload.data['command']),
    sessionId:
        readString(payload.root['sessionId']) ??
        readString(payload.data['sessionId']) ??
        readString(payload.event['sessionId']),
  );
}

FileChangePayload? normalizeFileChangePayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final path =
      readString(payload.root['path']) ?? readString(payload.data['path']);
  if (path == null) {
    return null;
  }

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    path: path,
    changeType: switch (readString(
      payload.root['changeType'] ?? payload.data['changeType'],
    )) {
      'created' => 'created',
      'deleted' => 'deleted',
      _ => 'modified',
    },
    diff:
        readString(payload.root['diff']) ?? readString(payload.data['diff']),
    content:
        readString(payload.root['content']) ??
        readString(payload.data['content']),
  );
}

DonePayload normalizeDonePayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        readString(payload.root['messageId']) ??
        readString(payload.data['messageId']) ??
        readString(payload.root['stepId']) ??
        readString(payload.data['stepId']),
  );
}

StatusPayload? normalizeStatusPayload(Object? raw) {
  final payload = unwrapConversationPayload(raw);
  final status =
      readString(payload.root['status']) ??
      readString(payload.data['status']);
  if (status == null) {
    return null;
  }

  return (
    conversationId:
        readString(payload.root['conversationId']) ??
        readString(payload.root['executionId']) ??
        readString(payload.data['conversationId']) ??
        'unknown-conversation',
    status: status,
    phase:
        readString(payload.root['phase']) ??
        readString(payload.data['phase']),
    failedPhase:
        readString(payload.root['failedPhase']) ??
        readString(payload.data['failedPhase']),
    error:
        readString(payload.root['error']) ??
        readString(payload.data['error']) ??
        readString(payload.root['errorMessage']) ??
        readString(payload.data['errorMessage']),
    errorMessage:
        readString(payload.root['errorMessage']) ??
        readString(payload.data['errorMessage']) ??
        readString(payload.root['error']) ??
        readString(payload.data['error']),
    sandboxReused:
        readBool(payload.root['sandboxReused']) ??
        readBool(payload.data['sandboxReused']),
  );
}

ConversationHistorySnapshot normalizeConversationHistorySnapshot(
  AgentConversationDetailDto detail,
) {
  final execution = asMap(detail.metadata['execution']);
  final runningState = switch (readString(execution['runningState'])) {
    'idle' => 'idle',
    'running' => 'running',
    'failed' => 'failed',
    'cancelled' => 'cancelled',
    _ => null,
  };
  final errorMessage =
      readString(execution['errorMessage']) ??
      readString(execution['rawErrorMessage']) ??
      readString(execution['lastErrorMessage']);
  final failedPhase = parsePreparationPhase(
    readString(execution['failedPhase']),
  );
  final loadedPublishedVersionId = readString(
    execution['loadedPublishedVersionId'],
  );

  return (
    messages: detail.messages.data
        .map(normalizeHistoryMessage)
        .toList(growable: false),
    runningState: runningState,
    errorMessage: errorMessage,
    failedPhase: failedPhase,
    loadedPublishedVersionId: loadedPublishedVersionId,
  );
}
