import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../shared/providers/env_provider.dart';
import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../execution/services/execution_socket_service.dart'
    show resolveExecutionSocketUrl;
import '../api/agent_api.dart';
import '../models/agent_conversation_dto.dart';
import '../models/conversation_message_dto.dart';

typedef ConversationParams = ({String agentId, String conversationId});

typedef _ChunkPayload =
    ({String conversationId, String messageId, String chunk});
typedef _ThinkingPayload =
    ({String conversationId, String messageId, String content});
typedef _ToolPayload =
    ({
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
typedef _TerminalPayload =
    ({
      String conversationId,
      String output,
      String? command,
      String? sessionId,
    });
typedef _FileChangePayload =
    ({
      String conversationId,
      String path,
      String changeType,
      String? diff,
      String? content,
    });
typedef _DonePayload = ({String conversationId, String? messageId});
typedef _StatusPayload = ({
  String conversationId,
  String status,
  String? phase,
  String? failedPhase,
  String? error,
  bool? sandboxReused,
});

String _resolveConversationSocketUrl(String apiBaseUrl) {
  final resolvedApiUrl = Uri.parse(apiBaseUrl);
  final executionUrl = resolveExecutionSocketUrl(apiBaseUrl);
  final executionUri = Uri.parse(executionUrl);
  final basePath = executionUri.path.replaceAll('/execution', '');
  final namespacePath = '$basePath/agent-conversation'.replaceAll(
    RegExp(r'/+'),
    '/',
  );
  return resolvedApiUrl.replace(path: namespacePath).toString();
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

String? _readString(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return null;
}

bool? _readBool(Object? value) {
  if (value is bool) {
    return value;
  }
  return null;
}

List<String> _readStringList(Object? value) {
  if (value is! List) {
    return const <String>[];
  }

  return value
      .whereType<String>()
      .where((item) => item.trim().isNotEmpty)
      .toList(growable: false);
}

DateTime _readTimestamp(Object? value) {
  final raw = _readString(value);
  if (raw == null) {
    return DateTime.now();
  }
  return DateTime.tryParse(raw) ?? DateTime.now();
}

ConversationToolStatus? _readToolStatus(Object? value) {
  switch (_readString(value)) {
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

ConversationToolStatus _normalizeToolStatus(
  Object? value, {
  Object? error,
  Object? result,
}) {
  final explicit = _readToolStatus(value);
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

ConversationStatus _normalizeConversationStatus(Object? value) {
  switch (_readString(value)) {
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

ConversationToolPermissionRequestDto? _normalizePermissionRequest(
  Object? value,
) {
  final payload = _asMap(value);
  if (payload.isEmpty) {
    return null;
  }

  final description = _readString(payload['description']);
  final resourcePaths = _readStringList(
    payload['resourcePaths'] ?? payload['resource_paths'],
  );

  if (description == null && resourcePaths.isEmpty) {
    return null;
  }

  return ConversationToolPermissionRequestDto(
    description: description,
    resourcePaths: resourcePaths,
  );
}

List<ConversationToolTransitionDto> _normalizeTransitions(Object? value) {
  if (value is! List) {
    return const <ConversationToolTransitionDto>[];
  }

  final transitions = <ConversationToolTransitionDto>[];
  for (final item in value) {
    final payload = _asMap(item);
    final to = _readToolStatus(payload['to']);
    final timestamp = _readString(payload['timestamp']);
    final source = _readString(payload['source']);
    if (to == null ||
        timestamp == null ||
        (source != 'runtime' && source != 'worker' && source != 'user')) {
      continue;
    }

    transitions.add(
      ConversationToolTransitionDto(
        from: _readToolStatus(payload['from']),
        to: to,
        timestamp: timestamp,
        source: source!,
      ),
    );
  }

  return transitions;
}

String? _extractThinkingContent(Map<String, dynamic> metadata) {
  final decision = _asMap(metadata['decision']);
  if (decision.isEmpty) {
    return null;
  }

  final parts = <String>[
    if (_readString(decision['rationale']) case final rationale?) rationale,
    if (_readString(decision['suggestedContent'])
        case final suggestedContent?)
      suggestedContent,
  ];

  if (parts.isEmpty) {
    return null;
  }

  return parts.join('\n\n');
}

Object? _unwrapMcpResult(Object? value) {
  var parsed = value;
  if (value is String) {
    try {
      parsed = jsonDecode(value);
    } catch (_) {
      return value;
    }
  }

  final payload = _asMap(parsed);
  if (payload.isEmpty) {
    return value;
  }

  final content = payload['content'];
  if (content is! List || content.isEmpty) {
    return value;
  }

  final textParts = <String>[];
  for (final item in content) {
    final entry = _asMap(item);
    if (entry['type'] == 'text' && entry['text'] is String) {
      textParts.add(entry['text'] as String);
    }
  }

  return textParts.isEmpty ? value : textParts.join('');
}

List<ConversationToolCallDto> _normalizeHistoryToolCalls(
  ConversationMessageDto message,
) {
  final toolCalls = message.toolCalls
      .map(
        (toolCall) => toolCall.copyWith(
          result: _unwrapMcpResult(toolCall.result),
          startedAt: toolCall.startedAt ?? _readTimestamp(message.createdAt),
          updatedAt: toolCall.updatedAt ?? _readTimestamp(message.createdAt),
        ),
      )
      .toList(growable: true);

  for (final result in message.toolResults) {
    final toolCallId = result.toolCallId;
    final index = toolCallId == null
        ? -1
        : toolCalls.indexWhere((item) => item.id == toolCallId);

    final nextTool = _readString(result.tool) ?? 'unknown_tool';
    final nextStatus = result.status ??
        _normalizeToolStatus(
          null,
          error: result.error,
          result: result.result,
        );

    if (index >= 0) {
      final current = toolCalls[index];
      toolCalls[index] = current.copyWith(
        tool: current.tool == 'unknown_tool' ? nextTool : current.tool,
        status: nextStatus,
        result: result.result != null
            ? _unwrapMcpResult(result.result)
            : current.result,
        error: result.error ?? current.error,
        updatedAt: DateTime.now(),
      );
      continue;
    }

    if ((toolCallId == null || toolCallId.isEmpty) &&
        (_readString(result.tool) == null)) {
      continue;
    }

    toolCalls.add(
      ConversationToolCallDto(
        id: toolCallId ?? 'tool-result-${DateTime.now().microsecondsSinceEpoch}',
        tool: nextTool,
        status: nextStatus,
        result: _unwrapMcpResult(result.result),
        error: result.error,
        transitions: const <ConversationToolTransitionDto>[],
        startedAt: _readTimestamp(message.createdAt),
        updatedAt: DateTime.now(),
      ),
    );
  }

  return toolCalls;
}

ConversationMessageDto _normalizeHistoryMessage(ConversationMessageDto message) {
  final thinking = _extractThinkingContent(message.metadata);
  final toolCalls = _normalizeHistoryToolCalls(message);
  final segments = <MessageSegment>[
    if (thinking != null && thinking.trim().isNotEmpty)
      MessageSegment.thinking(thinking),
    if (message.content.trim().isNotEmpty) MessageSegment.text(message.content),
    for (final toolCall in toolCalls) MessageSegment.toolCall(toolCall.id),
  ];

  return message.copyWith(
    toolCalls: toolCalls,
    thinking: thinking,
    segments: segments,
    isStreaming: false,
  );
}

({Map<String, dynamic> root, Map<String, dynamic> data, Map<String, dynamic> event})
_unwrapConversationPayload(Object? raw) {
  final root = _asMap(raw);
  final data = _asMap(root['data']);
  final event = _asMap(root['event']);
  return (root: root, data: data, event: event);
}

_ChunkPayload? _normalizeMessageChunkPayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final chunk =
      _readString(payload.root['chunk']) ??
      _readString(payload.data['chunk']) ??
      _readString(payload.event['content']) ??
      _readString(payload.data['content']);
  if (chunk == null) {
    return null;
  }

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        _readString(payload.root['messageId']) ??
        _readString(payload.data['messageId']) ??
        _readString(payload.root['stepId']) ??
        _readString(payload.data['stepId']) ??
        _readString(payload.root['executionId']) ??
        'assistant-stream',
    chunk: chunk,
  );
}

_ThinkingPayload? _normalizeThinkingPayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final content =
      _readString(payload.root['content']) ??
      _readString(payload.data['content']) ??
      _readString(payload.event['content']) ??
      _readString(payload.event['rationale']) ??
      _readString(payload.event['suggestedContent']);
  if (content == null) {
    return null;
  }

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        _readString(payload.root['messageId']) ??
        _readString(payload.data['messageId']) ??
        _readString(payload.root['stepId']) ??
        _readString(payload.data['stepId']) ??
        _readString(payload.root['executionId']) ??
        'assistant-stream',
    content: content,
  );
}

_ToolPayload? _normalizeToolPayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final call = _asMap(payload.event['call']);
  final toolCallId =
      _readString(payload.root['toolCallId']) ??
      _readString(payload.data['toolCallId']) ??
      _readString(call['id']) ??
      _readString(payload.root['id']);
  if (toolCallId == null) {
    return null;
  }

  final result =
      payload.root.containsKey('result')
      ? payload.root['result']
      : payload.data.containsKey('result')
      ? payload.data['result']
      : call.containsKey('result')
      ? call['result']
      : null;
  final error =
      _readString(payload.root['error']) ??
      _readString(payload.data['error']) ??
      _readString(call['error']);

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        _readString(payload.root['messageId']) ??
        _readString(payload.data['messageId']) ??
        _readString(payload.root['stepId']) ??
        _readString(payload.data['stepId']) ??
        _readString(payload.root['executionId']) ??
        'assistant-stream',
    toolCallId: toolCallId,
    tool:
        _readString(payload.root['tool']) ??
        _readString(payload.root['toolName']) ??
        _readString(payload.root['name']) ??
        _readString(payload.data['tool']) ??
        _readString(payload.data['toolName']) ??
        _readString(payload.data['name']) ??
        _readString(payload.event['toolName']) ??
        _readString(call['tool']) ??
        'unknown_tool',
    args:
        payload.root.containsKey('args')
        ? payload.root['args']
        : payload.data.containsKey('args')
        ? payload.data['args']
        : call['args'],
    status: _normalizeToolStatus(
      payload.root['status'] ?? payload.data['status'] ?? call['status'],
      error: error,
      result: result,
    ),
    result: result,
    error: error,
    transitions: _normalizeTransitions(
      payload.root['transitions'] ??
          payload.data['transitions'] ??
          call['transitions'],
    ),
    permissionRequest: _normalizePermissionRequest(
      payload.root['permissionRequest'] ??
          payload.data['permissionRequest'] ??
          call['permissionRequest'],
    ),
  );
}

_TerminalPayload? _normalizeTerminalPayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final output =
      _readString(payload.root['output']) ??
      _readString(payload.data['output']) ??
      _readString(payload.event['data']) ??
      (payload.root['data'] is String ? payload.root['data'] as String : null);
  if (output == null) {
    return null;
  }

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    output: output,
    command:
        _readString(payload.root['command']) ??
        _readString(payload.data['command']),
    sessionId:
        _readString(payload.root['sessionId']) ??
        _readString(payload.data['sessionId']) ??
        _readString(payload.event['sessionId']),
  );
}

_FileChangePayload? _normalizeFileChangePayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final path =
      _readString(payload.root['path']) ?? _readString(payload.data['path']);
  if (path == null) {
    return null;
  }

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    path: path,
    changeType: switch (_readString(
      payload.root['changeType'] ?? payload.data['changeType'],
    )) {
      'created' => 'created',
      'deleted' => 'deleted',
      _ => 'modified',
    },
    diff: _readString(payload.root['diff']) ?? _readString(payload.data['diff']),
    content:
        _readString(payload.root['content']) ??
        _readString(payload.data['content']),
  );
}

_DonePayload _normalizeDonePayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    messageId:
        _readString(payload.root['messageId']) ??
        _readString(payload.data['messageId']) ??
        _readString(payload.root['stepId']) ??
        _readString(payload.data['stepId']),
  );
}

_StatusPayload? _normalizeStatusPayload(Object? raw) {
  final payload = _unwrapConversationPayload(raw);
  final status =
      _readString(payload.root['status']) ?? _readString(payload.data['status']);
  if (status == null) {
    return null;
  }

  return (
    conversationId:
        _readString(payload.root['conversationId']) ??
        _readString(payload.root['executionId']) ??
        _readString(payload.data['conversationId']) ??
        'unknown-conversation',
    status: status,
    phase:
        _readString(payload.root['phase']) ??
        _readString(payload.data['phase']),
    failedPhase:
        _readString(payload.root['failedPhase']) ??
        _readString(payload.data['failedPhase']),
    error:
        _readString(payload.root['error']) ??
        _readString(payload.data['error']),
    sandboxReused:
        _readBool(payload.root['sandboxReused']) ??
        _readBool(payload.data['sandboxReused']),
  );
}

String _nextLocalId(String prefix) {
  return '$prefix-${DateTime.now().microsecondsSinceEpoch}';
}

ConversationMessageDto _seedAssistantMessage({
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

List<MessageSegment> _appendTextSegment(
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

List<MessageSegment> _appendThinkingSegment(
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

List<MessageSegment> _ensureToolSegment(
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

List<ConversationToolCallDto> _upsertToolCall(
  List<ConversationToolCallDto> toolCalls,
  _ToolPayload payload,
) {
  final index = toolCalls.indexWhere((item) => item.id == payload.toolCallId);
  final current = index >= 0 ? toolCalls[index] : null;
  final nextTool =
      payload.tool != 'unknown_tool' || current == null ? payload.tool : current.tool;

  final updated = ConversationToolCallDto(
    id: payload.toolCallId,
    tool: nextTool,
    args: payload.args ?? current?.args,
    status: payload.status,
    result: payload.result != null
        ? _unwrapMcpResult(payload.result)
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

List<ConversationMessageDto> _upsertAssistantMessage(
  List<ConversationMessageDto> messages, {
  required String messageId,
  required String conversationId,
  required ConversationMessageDto Function(ConversationMessageDto current)
  transform,
}) {
  final index = messages.indexWhere((item) => item.id == messageId);
  final current = index >= 0
      ? messages[index]
      : _seedAssistantMessage(
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

List<ConversationMessageDto> _finishStreamingMessage(
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

List<ConversationMessageDto> _upsertMessage(
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

class AgentConversationNotifier extends AsyncNotifier<ConversationState> {
  AgentConversationNotifier(this.params);

  final ConversationParams params;
  io.Socket? _socket;
  int _historyRequestVersion = 0;

  @override
  Future<ConversationState> build() async {
    ref.onDispose(_cleanup);

    final messages = await _fetchHistory();
    Future<void>.microtask(() {
      if (!ref.mounted) {
        return;
      }
      _connectSocket();
      unawaited(_refreshWorkspaceTree(silent: true));
    });

    return ConversationState(
      messages: messages,
      status: ConversationStatus.connecting,
    );
  }

  Future<List<ConversationMessageDto>> _fetchHistory() async {
    final api = ref.read(agentApiProvider);
    final response = await api.getMessages(params.conversationId);
    return response.data.map(_normalizeHistoryMessage).toList(growable: false);
  }

  Future<void> _loadHistory({bool silent = false}) async {
    final requestVersion = ++_historyRequestVersion;
    try {
      final messages = await _fetchHistory();
      if (!ref.mounted || requestVersion != _historyRequestVersion) {
        return;
      }

      _updateState(
        (current) => current.copyWith(
          messages: messages,
          status: current.isConnected
              ? ConversationStatus.connected
              : ConversationStatus.idle,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted || silent) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          error: '加载对话历史失败：$error',
        ),
      );
    }
  }

  void _connectSocket() {
    final authState = ref.read(authProvider).value;
    final env = ref.read(envProvider);
    final accessToken = switch (authState) {
      AuthStateAuthenticated(:final tokens) => tokens.accessToken,
      _ => null,
    };
    if (accessToken == null || accessToken.isEmpty) {
      _updateState(
        (current) => current.copyWith(
          status: ConversationStatus.error,
          error: '当前未登录，无法建立对话实时连接',
        ),
      );
      return;
    }

    final socket = io.io(
      _resolveConversationSocketUrl(env.apiBaseUrl),
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken})
          .enableForceNew()
          .disableAutoConnect()
          .build(),
    );

    _socket = socket;

    socket.onConnect((_) {
      _updateState(
        (current) => current.copyWith(
          isConnected: true,
          status: current.status == ConversationStatus.executing
              ? ConversationStatus.executing
              : ConversationStatus.connected,
          clearError: true,
        ),
      );
      socket.emit('conversation:subscribe', {
        'conversationId': params.conversationId,
      });
    });

    socket.onDisconnect((reason) {
      _updateState(
        (current) => current.copyWith(
          isConnected: false,
          status: ConversationStatus.idle,
          error: _readString(reason) ?? '实时连接已断开',
        ),
      );
    });

    socket.onConnectError((error) {
      _updateState(
        (current) => current.copyWith(
          isConnected: false,
          status: ConversationStatus.error,
          error: '实时连接失败：$error',
        ),
      );
    });

    socket.on('conversation.agent.message_chunk', _handleMessageChunk);
    socket.on('conversation.agent.thinking', _handleThinking);
    socket.on('conversation.agent.tool_call', _handleToolCall);
    socket.on('conversation.agent.tool_result', _handleToolCall);
    socket.on('conversation.sandbox.terminal_output', _handleTerminalOutput);
    socket.on('conversation.sandbox.file_change', _handleFileChange);
    socket.on('conversation.agent.done', _handleAgentDone);
    socket.on('conversation.status.changed', _handleStatusChanged);

    socket.connect();
  }

  void _handleMessageChunk(Object? raw) {
    final payload = _normalizeMessageChunkPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: _upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            content: '${message.content}${payload.chunk}',
            segments: _appendTextSegment(message.segments, payload.chunk),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        // 收到第一个 message_chunk 时清除准备阶段，触发卡片收缩
        clearPreparationPhase: current.preparationPhase != null,
        clearError: true,
      ),
    );
  }

  void _handleThinking(Object? raw) {
    final payload = _normalizeThinkingPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: _upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            thinking: '${message.thinking ?? ''}${payload.content}',
            segments: _appendThinkingSegment(message.segments, payload.content),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        clearError: true,
      ),
    );
  }

  void _handleToolCall(Object? raw) {
    final payload = _normalizeToolPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: _upsertAssistantMessage(
          current.messages,
          messageId: payload.messageId,
          conversationId: params.conversationId,
          transform: (message) => message.copyWith(
            toolCalls: _upsertToolCall(message.toolCalls, payload),
            segments: _ensureToolSegment(message.segments, payload.toolCallId),
            isStreaming: true,
          ),
        ),
        status: ConversationStatus.executing,
        clearError: true,
      ),
    );
  }

  void _handleTerminalOutput(Object? raw) {
    final payload = _normalizeTerminalPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        terminalEntries: [
          ...current.terminalEntries,
          TerminalEntry(
            id: _nextLocalId('terminal'),
            output: payload.output,
            timestamp: DateTime.now(),
            command: payload.command,
            sessionId: payload.sessionId,
          ),
        ],
        clearError: true,
      ),
    );
  }

  void _handleFileChange(Object? raw) {
    final payload = _normalizeFileChangePayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    _updateState((current) {
      final clearSelected =
          payload.changeType == 'deleted' &&
          current.selectedFilePath == payload.path;
      final selectedFileContent =
          current.selectedFilePath == payload.path &&
              payload.content != null &&
              payload.changeType != 'deleted'
          ? WorkspaceFileContent(
              path: payload.path,
              content: payload.content!,
              size: payload.content!.length,
              encoding: 'utf-8',
            )
          : current.selectedFileContent;

      return current.copyWith(
        fileChanges: [
          ...current.fileChanges,
          WorkspaceFileChange(
            path: payload.path,
            changeType: payload.changeType,
            diff: payload.diff,
            content: payload.content,
          ),
        ],
        selectedFileContent: selectedFileContent,
        clearSelectedFileContent: clearSelected,
        clearError: true,
      );
    });
  }

  void _handleAgentDone(Object? raw) {
    final payload = _normalizeDonePayload(raw);
    if (payload.conversationId != params.conversationId) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        messages: _finishStreamingMessage(
          current.messages,
          messageId: payload.messageId,
        ),
        status: current.isConnected
            ? ConversationStatus.connected
            : ConversationStatus.idle,
        clearPreparationPhase: true,
        clearPreparationStartTime: true,
        clearPreparationError: true,
        clearPreparationFailedPhase: true,
        clearError: true,
      ),
    );

    unawaited(_loadHistory(silent: true));
    unawaited(_refreshWorkspaceTree(silent: true));
  }

  void _handleStatusChanged(Object? raw) {
    final payload = _normalizeStatusPayload(raw);
    if (payload == null || payload.conversationId != params.conversationId) {
      return;
    }

    final phase = parsePreparationPhase(payload.phase);
    final failedPhase = parsePreparationPhase(payload.failedPhase);

    _updateState((current) {
      // 记录沙箱复用标志
      final nextSandboxReused = payload.sandboxReused ?? current.sandboxReused;

      // 准备阶段事件（status == 'preparing'）
      if (payload.status == 'preparing' && phase != null) {
        return current.copyWith(
          status: ConversationStatus.executing,
          preparationPhase: phase,
          preparationStartTime:
              current.preparationStartTime ?? DateTime.now(),
          sandboxReused: nextSandboxReused,
          clearError: true,
        );
      }

      // 失败事件，附带 failedPhase
      if (payload.status == 'failed' && failedPhase != null) {
        return current.copyWith(
          status: ConversationStatus.error,
          preparationFailedPhase: failedPhase,
          preparationError: payload.error,
          sandboxReused: nextSandboxReused,
        );
      }

      // running 阶段 — 准备完成，Agent 循环即将开始
      if (phase == PreparationPhase.running) {
        return current.copyWith(
          status: _normalizeConversationStatus(payload.status),
          preparationPhase: PreparationPhase.running,
          sandboxReused: nextSandboxReused,
          clearError: true,
        );
      }

      // 其他常规状态变更（completed / cancelled / 无 phase 的 running 等）
      // 终态（completed/cancelled）需要清除准备状态
      final isTerminal = payload.status == 'completed' ||
          payload.status == 'cancelled';
      return current.copyWith(
        status: _normalizeConversationStatus(payload.status),
        sandboxReused: nextSandboxReused,
        clearPreparationPhase: isTerminal,
        clearPreparationStartTime: isTerminal,
        clearPreparationError: isTerminal,
        clearPreparationFailedPhase: isTerminal,
        clearError: true,
      );
    });
  }

  Future<void> sendMessage(String content) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        status: ConversationStatus.executing,
        // 重置上一轮的准备状态，为新一轮准备做好准备
        clearPreparationPhase: true,
        clearPreparationStartTime: true,
        clearPreparationError: true,
        clearPreparationFailedPhase: true,
        sandboxReused: false,
        clearError: true,
      ),
    );

    try {
      final response = await ref.read(agentApiProvider).sendMessage(
        params.conversationId,
        content: trimmed,
      );
      if (!ref.mounted) {
        return;
      }

      final userMessage = _normalizeHistoryMessage(response);
      _updateState(
        (current) => current.copyWith(
          messages: _upsertMessage(current.messages, userMessage),
          status: ConversationStatus.executing,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          status: current.isConnected
              ? ConversationStatus.connected
              : ConversationStatus.error,
          error: '发送消息失败：$error',
        ),
      );
    }
  }

  Future<void> cancelConversation() async {
    try {
      _socket?.emit('conversation:cancel', {
        'conversationId': params.conversationId,
      });
      await ref.read(agentApiProvider).cancelConversation(params.conversationId);
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          status: current.isConnected
              ? ConversationStatus.connected
              : ConversationStatus.idle,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          error: '取消执行失败：$error',
        ),
      );
    }
  }

  Future<void> resolveToolPermission(
    String toolCallId,
    String action,
  ) async {
    try {
      await ref.read(agentApiProvider).resolveToolPermission(
        params.conversationId,
        toolCallId,
        action: action,
      );
      if (!ref.mounted) {
        return;
      }

      final nextStatus = action == 'approve'
          ? ConversationToolStatus.inProgress
          : ConversationToolStatus.denied;
      final nextTransition = ConversationToolTransitionDto(
        from: action == 'approve'
            ? ConversationToolStatus.awaitingPermission
            : ConversationToolStatus.awaitingPermission,
        to: nextStatus,
        timestamp: DateTime.now().toIso8601String(),
        source: 'user',
      );

      _updateState((current) {
        final messages = current.messages.map((message) {
          final index = message.toolCalls.indexWhere(
            (toolCall) => toolCall.id == toolCallId,
          );
          if (index < 0) {
            return message;
          }

          final nextToolCalls = [...message.toolCalls];
          final toolCall = nextToolCalls[index];
          nextToolCalls[index] = toolCall.copyWith(
            status: nextStatus,
            transitions: [...toolCall.transitions, nextTransition],
            updatedAt: DateTime.now(),
          );
          return message.copyWith(toolCalls: nextToolCalls);
        }).toList(growable: false);

        return current.copyWith(messages: messages, clearError: true);
      });
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          error: '处理工具权限失败：$error',
        ),
      );
    }
  }

  Future<void> refreshWorkspaceTree() {
    return _refreshWorkspaceTree();
  }

  Future<void> _refreshWorkspaceTree({bool silent = false}) async {
    _updateState((current) => current.copyWith(isLoadingWorkspace: true));
    try {
      final tree = await ref.read(agentApiProvider).getWorkspaceTree(
        params.conversationId,
      );
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          fileTree: tree,
          isLoadingWorkspace: false,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          isLoadingWorkspace: false,
          error: silent ? current.error : '加载工作区失败：$error',
        ),
      );
    }
  }

  Future<void> openWorkspaceFile(String path) async {
    if (path.trim().isEmpty) {
      return;
    }

    _updateState(
      (current) => current.copyWith(
        selectedFilePath: path,
        isLoadingWorkspace: true,
        clearError: true,
      ),
    );

    try {
      final file = await ref.read(agentApiProvider).getWorkspaceFile(
        params.conversationId,
        path,
      );
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          selectedFilePath: path,
          selectedFileContent: file,
          isLoadingWorkspace: false,
          clearError: true,
        ),
      );
    } catch (error) {
      if (!ref.mounted) {
        return;
      }
      _updateState(
        (current) => current.copyWith(
          isLoadingWorkspace: false,
          error: '读取文件失败：$error',
        ),
      );
    }
  }

  void _updateState(
    ConversationState Function(ConversationState current) transform,
  ) {
    final current = state.value;
    if (current == null) {
      return;
    }
    state = AsyncValue.data(transform(current));
  }

  void _cleanup() {
    final socket = _socket;
    if (socket == null) {
      return;
    }

    socket.emit('conversation:unsubscribe', {
      'conversationId': params.conversationId,
    });
    socket.dispose();
    _socket = null;
  }
}

final agentConversationProvider = AsyncNotifierProvider.autoDispose
    .family<AgentConversationNotifier, ConversationState, ConversationParams>(
      AgentConversationNotifier.new,
    );

final agentConversationsProvider =
    FutureProvider.family<List<AgentConversationDto>, String>((ref, agentId) {
      final api = ref.read(agentApiProvider);
      return api.listConversations(agentId);
    });
