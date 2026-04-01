import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../agents/models/conversation_message_dto.dart';
import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../workflows/api/workflow_api.dart';
import '../../workflows/models/execution_step_dto.dart';
import '../../workflows/models/execution_summary_dto.dart';
import '../models/execution_event.dart';
import '../models/execution_runtime.dart';
import '../models/execution_state.dart';
import '../models/execution_status.dart';
import '../services/execution_socket_service.dart';
import '../../../shared/providers/env_provider.dart';

/// 连接模式
enum ConnectionMode {
  websocket,
  polling,
  reconnecting,
  disconnected;

  String get label => switch (this) {
    ConnectionMode.websocket => 'WebSocket',
    ConnectionMode.polling => 'Polling',
    ConnectionMode.reconnecting => 'Reconnecting',
    ConnectionMode.disconnected => 'Disconnected',
  };
}

/// 执行监控状态 (sealed class)
sealed class ExecutionMonitorState {
  const ExecutionMonitorState();
}

/// 初始加载中
class ExecutionMonitorLoading extends ExecutionMonitorState {
  const ExecutionMonitorLoading();
}

/// WebSocket 已连接，实时监控中
class ExecutionMonitorConnected extends ExecutionMonitorState {
  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorConnected({
    required this.snapshot,
    this.connectionMode = ConnectionMode.websocket,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });

  ExecutionMonitorConnected copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
    ExecutionMonitorRuntimeData? runtime,
  }) {
    return ExecutionMonitorConnected(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
      runtime: runtime ?? this.runtime,
    );
  }
}

/// 降级轮询中
class ExecutionMonitorPolling extends ExecutionMonitorState {
  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorPolling({
    required this.snapshot,
    this.connectionMode = ConnectionMode.polling,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });

  ExecutionMonitorPolling copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
    ExecutionMonitorRuntimeData? runtime,
  }) {
    return ExecutionMonitorPolling(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
      runtime: runtime ?? this.runtime,
    );
  }
}

/// 错误态
class ExecutionMonitorError extends ExecutionMonitorState {
  final String message;
  final String? executionId;

  const ExecutionMonitorError({required this.message, this.executionId});
}

/// 已断开（终态后自动清理）
class ExecutionMonitorDisconnected extends ExecutionMonitorState {
  final ExecutionStateSnapshot? lastSnapshot;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorDisconnected({
    this.lastSnapshot,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });
}

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/// 从当前状态中提取 snapshot（connected 或 polling）
ExecutionStateSnapshot? extractMonitorSnapshot(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.snapshot;
  if (s is ExecutionMonitorPolling) return s.snapshot;
  if (s is ExecutionMonitorDisconnected) return s.lastSnapshot;
  return null;
}

/// 从当前状态中提取连接模式
ConnectionMode extractMonitorConnectionMode(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.connectionMode;
  if (s is ExecutionMonitorPolling) return s.connectionMode;
  if (s is ExecutionMonitorDisconnected) return ConnectionMode.disconnected;
  return ConnectionMode.websocket;
}

ExecutionMonitorRuntimeData extractMonitorRuntime(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.runtime;
  if (s is ExecutionMonitorPolling) return s.runtime;
  if (s is ExecutionMonitorDisconnected) return s.runtime;
  return const ExecutionMonitorRuntimeData();
}

typedef _GraphNodeMeta =
    ({String? nodeName, String? nodeType, String? parentNodeId});

bool _isCompoundContainerNodeType(String? nodeType) {
  return nodeType == 'loop' || nodeType == 'iteration';
}

String? _buildCompoundAwareNodeName(
  String nodeId,
  _GraphNodeMeta meta,
  Map<String, _GraphNodeMeta> graphNodeMeta,
) {
  final baseNodeName =
      meta.nodeName?.trim().isNotEmpty == true ? meta.nodeName : nodeId;
  final parentNodeId = meta.parentNodeId;
  if (parentNodeId == null) {
    return baseNodeName;
  }

  final parentMeta = graphNodeMeta[parentNodeId];
  if (parentMeta == null || !_isCompoundContainerNodeType(parentMeta.nodeType)) {
    return baseNodeName;
  }

  final parentNodeName = parentMeta.nodeName?.trim().isNotEmpty == true
      ? parentMeta.nodeName
      : parentNodeId;

  if (parentNodeName == null || parentNodeName.isEmpty) {
    return baseNodeName;
  }

  return '$parentNodeName / $baseNodeName';
}

Map<String, _GraphNodeMeta> _extractGraphNodeMeta(
  Map<String, dynamic>? definitionSnapshot,
) {
  final rawNodes = definitionSnapshot?['nodes'];
  if (rawNodes is! List) {
    return const {};
  }

  final graphNodeMeta = <String, _GraphNodeMeta>{};
  for (final rawNode in rawNodes) {
    if (rawNode is! Map<String, dynamic>) {
      continue;
    }

    final id = rawNode['id'];
    if (id is! String || id.isEmpty) {
      continue;
    }

    final rawData = rawNode['data'];
    final data = rawData is Map<String, dynamic> ? rawData : null;
    final nodeName = switch (data?['label']) {
      final String value when value.isNotEmpty => value,
      String _ => null,
      _ => null,
    };
    final nodeType = switch (data?['nodeType']) {
      final String value when value.isNotEmpty => value,
      String _ => null,
      _ => switch (rawNode['type']) {
        final String value when value.isNotEmpty => value,
        _ => null,
      },
    };
    final parentNodeId = switch (rawNode['parentId']) {
      final String value when value.isNotEmpty => value,
      _ => null,
    };

    graphNodeMeta[id] = (
      nodeName: nodeName,
      nodeType: nodeType,
      parentNodeId: parentNodeId,
    );
  }

  return {
    for (final entry in graphNodeMeta.entries)
      entry.key: (
        nodeName: _buildCompoundAwareNodeName(
          entry.key,
          entry.value,
          graphNodeMeta,
        ),
        nodeType: entry.value.nodeType,
        parentNodeId: entry.value.parentNodeId,
      ),
  };
}

StepSnapshot _mapExecutionStep(
  ExecutionStepDto step, {
  _GraphNodeMeta? graphNodeMeta,
  StepSnapshot? previous,
}) {
  final nodeName =
      graphNodeMeta?.nodeName ??
      step.resolvedNodeLabel ??
      previous?.nodeName ??
      step.nodeId;
  final nodeType =
      graphNodeMeta?.nodeType ?? step.resolvedNodeType ?? previous?.nodeType;

  return StepSnapshot(
    stepId: step.id,
    nodeId: step.nodeId,
    nodeName: nodeName,
    nodeType: nodeType,
    status: step.status,
    startedAt: step.startedAt ?? previous?.startedAt,
    completedAt: step.completedAt ?? previous?.completedAt,
    errorMessage: step.resolvedErrorMessage ?? previous?.errorMessage,
    errorDetail: step.errorDetailMap ?? previous?.errorDetail,
    checkpointData: step.checkpointData ?? previous?.checkpointData,
    result: step.result ?? previous?.result,
  );
}

ExecutionStateSnapshot _buildSnapshotFromExecutionDetail(
  ExecutionSummaryDto execution, {
  ExecutionStateSnapshot? previous,
}) {
  final previousStepsById = {
    for (final step in previous?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };
  final graphNodeMeta = _extractGraphNodeMeta(execution.definitionSnapshot);
  final mappedSteps = execution.steps
      ?.map(
        (step) => _mapExecutionStep(
          step,
          graphNodeMeta: graphNodeMeta[step.nodeId],
          previous: previousStepsById[step.id],
        ),
      )
      .toList();

  return ExecutionStateSnapshot(
    executionId: execution.id,
    status: execution.status,
    completedSteps: execution.completedSteps,
    totalSteps: execution.totalSteps,
    steps: mappedSteps ?? previous?.steps ?? const [],
    snapshotAt: execution.updatedAt,
    lastEventId: previous?.lastEventId,
  );
}

ExecutionStateSnapshot _mergeSnapshotMetadata(
  ExecutionStateSnapshot incoming, {
  ExecutionStateSnapshot? previous,
}) {
  final previousStepsById = {
    for (final step in previous?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };

  if (incoming.steps.isEmpty && previous != null && previous.steps.isNotEmpty) {
    return incoming.copyWith(steps: previous.steps);
  }

  final mergedSteps = incoming.steps
      .map((step) {
        final previousStep = previousStepsById[step.stepId];
        return step.copyWith(
          nodeName: step.nodeName ?? previousStep?.nodeName,
          nodeType: step.nodeType ?? previousStep?.nodeType,
          startedAt: step.startedAt ?? previousStep?.startedAt,
          completedAt: step.completedAt ?? previousStep?.completedAt,
          errorMessage: step.errorMessage ?? previousStep?.errorMessage,
          errorDetail: step.errorDetail ?? previousStep?.errorDetail,
          checkpointData: step.checkpointData ?? previousStep?.checkpointData,
          result: step.result ?? previousStep?.result,
        );
      })
      .toList(growable: false);

  return incoming.copyWith(steps: mergedSteps);
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

int? _readInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
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

bool _shouldAppearStep(StepSnapshot step) {
  return step.status != 'pending' ||
      step.startedAt != null ||
      step.completedAt != null ||
      (step.result?.isNotEmpty ?? false) ||
      (step.checkpointData?.isNotEmpty ?? false);
}

ConversationToolStatus _normalizeConversationToolStatus(
  Object? value, {
  Object? error,
  Object? result,
}) {
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
      if (error != null) {
        return ConversationToolStatus.failed;
      }
      if (result != null) {
        return ConversationToolStatus.completed;
      }
      return ConversationToolStatus.pending;
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
    final to = _normalizeConversationToolStatus(payload['to']);
    final timestamp = _readString(payload['timestamp']);
    final source = _readString(payload['source']);
    if (timestamp == null ||
        source == null ||
        (source != 'runtime' && source != 'worker' && source != 'user')) {
      continue;
    }

    transitions.add(
      ConversationToolTransitionDto(
        from: _readString(payload['from']) == null
            ? null
            : _normalizeConversationToolStatus(payload['from']),
        to: to,
        timestamp: timestamp,
        source: source,
      ),
    );
  }

  return transitions;
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

String _extractResultOutput(
  Map<String, dynamic>? result, {
  Map<String, dynamic>? checkpointData,
}) {
  if (result != null) {
    final content = result['content'];
    if (content is String && content.isNotEmpty) {
      return content;
    }

    final output = result['output'];
    if (output is String && output.isNotEmpty) {
      return output;
    }
  }

  if (checkpointData != null) {
    final partialContent = _readString(
      checkpointData['partialContent'] ?? checkpointData['partial_content'],
    );
    if (partialContent != null) {
      return partialContent;
    }

    final content = _readString(checkpointData['content']);
    if (content != null) {
      return content;
    }
  }

  return '';
}

String? _extractCheckpointThinking(Map<String, dynamic>? checkpointData) {
  final decision = _asMap(checkpointData?['decision']);
  if (decision.isEmpty) {
    return null;
  }

  final parts = <String>[
    if (_readString(decision['rationale']) case final rationale?) rationale,
    if (_readString(
          decision['suggestedContent'] ?? decision['suggested_content'],
        )
        case final suggestedContent?)
      suggestedContent,
  ];

  if (parts.isEmpty) {
    return null;
  }

  return parts.join('\n\n');
}

List<ConversationToolCallDto> _normalizeCheckpointToolCalls(
  Map<String, dynamic>? checkpointData,
) {
  final rawToolCalls =
      checkpointData?['toolCalls'] ?? checkpointData?['tool_calls'];
  if (rawToolCalls is! List) {
    return const <ConversationToolCallDto>[];
  }

  final fallbackTimestamp = DateTime.now();
  final toolCalls = <ConversationToolCallDto>[];
  for (final rawToolCall in rawToolCalls) {
    final payload = _asMap(rawToolCall);
    final id = _readString(payload['id']);
    final tool = _readString(payload['tool']);
    if (id == null || tool == null) {
      continue;
    }

    toolCalls.add(
      ConversationToolCallDto(
        id: id,
        tool: tool,
        args: payload['args'],
        status: _normalizeConversationToolStatus(
          payload['status'],
          error: payload['error'],
          result: payload['result'],
        ),
        result: _unwrapMcpResult(payload['result']),
        error: _readString(payload['error']),
        transitions: _normalizeTransitions(payload['transitions']),
        permissionRequest: _normalizePermissionRequest(
          payload['permissionRequest'] ?? payload['permission_request'],
        ),
        startedAt: fallbackTimestamp,
        updatedAt: fallbackTimestamp,
      ),
    );
  }

  return toolCalls;
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

String? _collectThinkingSegments(List<MessageSegment> segments) {
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

List<MessageSegment> _normalizeCheckpointSegments(
  Map<String, dynamic>? checkpointData,
  List<ConversationToolCallDto> toolCalls, {
  required String fallbackContent,
  String? fallbackThinking,
}) {
  final rawSegments = checkpointData?['segments'];
  if (rawSegments is List) {
    var segments = <MessageSegment>[];
    for (final rawSegment in rawSegments) {
      final segment = _asMap(rawSegment);
      final type = _readString(segment['type']);
      if (type == 'text' || type == 'thinking') {
        final content = _readString(segment['content']);
        if (content == null) {
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
            _readString(segment['toolCallId']) ??
            _readString(segment['tool_call_id']);
        if (toolCallId != null &&
            toolCalls.any((toolCall) => toolCall.id == toolCallId)) {
          segments.add(MessageSegment.toolCall(toolCallId));
        }
      }
    }

    if (segments.isNotEmpty) {
      final persistedText = segments
          .where((segment) => segment.kind == MessageSegmentKind.text)
          .map((segment) => segment.content ?? '')
          .join();
      if (fallbackContent.isNotEmpty) {
        final suffix = fallbackContent.startsWith(persistedText)
            ? fallbackContent.substring(persistedText.length)
            : persistedText.isEmpty
            ? fallbackContent
            : '';
        if (suffix.isNotEmpty) {
          segments = _appendTextSegment(segments, suffix);
        }
      }

      final persistedThinking = segments
          .where((segment) => segment.kind == MessageSegmentKind.thinking)
          .map((segment) => segment.content ?? '')
          .join();
      if (fallbackThinking != null && fallbackThinking.isNotEmpty) {
        final thinkingSuffix = fallbackThinking.startsWith(persistedThinking)
            ? fallbackThinking.substring(persistedThinking.length)
            : persistedThinking.isEmpty
            ? fallbackThinking
            : '';
        if (thinkingSuffix.isNotEmpty) {
          segments = _appendThinkingSegment(segments, thinkingSuffix);
        }
      }

      for (final toolCall in toolCalls) {
        segments = _ensureToolSegment(segments, toolCall.id);
      }

      return segments;
    }
  }

  return <MessageSegment>[
    if (fallbackThinking != null && fallbackThinking.trim().isNotEmpty)
      MessageSegment.thinking(fallbackThinking),
    if (fallbackContent.trim().isNotEmpty) MessageSegment.text(fallbackContent),
    for (final toolCall in toolCalls) MessageSegment.toolCall(toolCall.id),
  ];
}

List<ConversationToolCallDto> _upsertToolCall(
  List<ConversationToolCallDto> toolCalls, {
  required String toolCallId,
  required String tool,
  Object? args,
  required ConversationToolStatus status,
  Object? result,
  String? error,
  List<ConversationToolTransitionDto> transitions =
      const <ConversationToolTransitionDto>[],
  ConversationToolPermissionRequestDto? permissionRequest,
}) {
  final index = toolCalls.indexWhere((item) => item.id == toolCallId);
  final current = index >= 0 ? toolCalls[index] : null;
  final nextTool = tool != 'unknown_tool' || current == null
      ? tool
      : current.tool;

  final updated = ConversationToolCallDto(
    id: toolCallId,
    tool: nextTool,
    args: args ?? current?.args,
    status: status,
    result: result != null ? _unwrapMcpResult(result) : current?.result,
    error: error ?? current?.error,
    transitions: transitions.isNotEmpty
        ? transitions
        : current?.transitions ?? const <ConversationToolTransitionDto>[],
    permissionRequest: permissionRequest ?? current?.permissionRequest,
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

ExecutionInterventionState? _extractInterventionState(
  Map<String, dynamic>? checkpointData, {
  String? nodeName,
}) {
  if (checkpointData == null) {
    return null;
  }

  final decision = _asMap(checkpointData['decision']);
  final requestedAt =
      _readString(
        checkpointData['interventionRequestedAt'] ??
            checkpointData['intervention_requested_at'],
      ) ??
      _readString(_asMap(checkpointData['intervention'])['requested_at']);
  final partialContent = _readString(
    checkpointData['partialContent'] ?? checkpointData['partial_content'],
  );

  if (decision.isEmpty && requestedAt == null && partialContent == null) {
    return null;
  }

  return ExecutionInterventionState(
    nodeName:
        _readString(
          checkpointData['interventionNodeName'] ??
              checkpointData['intervention_node_name'],
        ) ??
        nodeName,
    requestedAt: requestedAt,
    decision: decision.isEmpty ? null : decision,
    partialContent: partialContent,
  );
}

ExecutionRuntimeStep _seedRuntimeStepFromSnapshot(
  StepSnapshot step, {
  ExecutionRuntimeStep? previous,
}) {
  final checkpointData = step.checkpointData ?? previous?.checkpointData;
  final result = step.result ?? previous?.result;
  final output = _extractResultOutput(result, checkpointData: checkpointData);
  final toolCalls = _normalizeCheckpointToolCalls(checkpointData);
  final thinking = _extractCheckpointThinking(checkpointData);
  final segments = _normalizeCheckpointSegments(
    checkpointData,
    toolCalls,
    fallbackContent: output,
    fallbackThinking: thinking,
  );

  return ExecutionRuntimeStep(
    stepId: step.stepId,
    nodeId: step.nodeId,
    nodeName: step.nodeName ?? previous?.nodeName,
    nodeType: step.nodeType ?? previous?.nodeType,
    status: step.status,
    output: output.isNotEmpty ? output : previous?.output ?? '',
    thinking:
        thinking ?? _collectThinkingSegments(segments) ?? previous?.thinking,
    errorMessage: step.errorMessage ?? previous?.errorMessage,
    errorDetail: step.errorDetail ?? previous?.errorDetail,
    checkpointData: checkpointData,
    result: result,
    startedAt: step.startedAt ?? previous?.startedAt,
    completedAt: step.completedAt ?? previous?.completedAt,
    isStreaming:
        step.status == 'running' ||
        step.status == 'queued' ||
        step.status == 'waiting_intervention',
    retryAttempt: previous?.retryAttempt,
    retryMaxAttempts: previous?.retryMaxAttempts,
    intervention:
        _extractInterventionState(checkpointData, nodeName: step.nodeName) ??
        previous?.intervention,
    stopReason:
        _readString(
          checkpointData?['stopReason'] ?? checkpointData?['stop_reason'],
        ) ??
        previous?.stopReason,
    toolCalls: toolCalls.isNotEmpty
        ? toolCalls
        : previous?.toolCalls ?? const <ConversationToolCallDto>[],
    segments: segments.isNotEmpty ? segments : previous?.segments ?? const [],
    terminalEntries: previous?.terminalEntries ?? const <TerminalEntry>[],
    fileChanges: previous?.fileChanges ?? const <WorkspaceFileChange>[],
  );
}

ExecutionRuntimeStep _buildRuntimeStepFromExecutionStep(
  ExecutionStepDto step, {
  StepSnapshot? snapshot,
  ExecutionRuntimeStep? previous,
}) {
  final checkpointData = step.checkpointData;
  final output = _extractResultOutput(
    step.result,
    checkpointData: checkpointData,
  );
  final toolCalls = _normalizeCheckpointToolCalls(checkpointData);
  final thinking = _extractCheckpointThinking(checkpointData);
  final segments = _normalizeCheckpointSegments(
    checkpointData,
    toolCalls,
    fallbackContent: output,
    fallbackThinking: thinking,
  );

  return ExecutionRuntimeStep(
    stepId: step.id,
    nodeId: step.nodeId,
    nodeName:
        snapshot?.nodeName ?? step.resolvedNodeLabel ?? previous?.nodeName,
    nodeType: snapshot?.nodeType ?? step.resolvedNodeType ?? previous?.nodeType,
    status: step.status,
    output: output.isNotEmpty ? output : previous?.output ?? '',
    thinking:
        thinking ?? _collectThinkingSegments(segments) ?? previous?.thinking,
    errorMessage:
        step.resolvedErrorMessage ??
        snapshot?.errorMessage ??
        previous?.errorMessage,
    errorDetail:
        step.errorDetailMap ?? snapshot?.errorDetail ?? previous?.errorDetail,
    checkpointData:
        checkpointData ?? snapshot?.checkpointData ?? previous?.checkpointData,
    result: step.result ?? snapshot?.result ?? previous?.result,
    startedAt: step.startedAt ?? snapshot?.startedAt ?? previous?.startedAt,
    completedAt:
        step.completedAt ?? snapshot?.completedAt ?? previous?.completedAt,
    isStreaming:
        step.status == 'running' ||
        step.status == 'queued' ||
        step.status == 'waiting_intervention',
    retryAttempt: previous?.retryAttempt,
    retryMaxAttempts: previous?.retryMaxAttempts,
    intervention:
        _extractInterventionState(
          checkpointData,
          nodeName: snapshot?.nodeName,
        ) ??
        previous?.intervention,
    stopReason:
        _readString(
          checkpointData?['stopReason'] ?? checkpointData?['stop_reason'],
        ) ??
        previous?.stopReason,
    toolCalls: toolCalls.isNotEmpty
        ? toolCalls
        : previous?.toolCalls ?? const [],
    segments: segments.isNotEmpty ? segments : previous?.segments ?? const [],
    terminalEntries: previous?.terminalEntries ?? const <TerminalEntry>[],
    fileChanges: previous?.fileChanges ?? const <WorkspaceFileChange>[],
  );
}

ExecutionMonitorRuntimeData _buildRuntimeFromExecutionDetail(
  ExecutionSummaryDto execution, {
  ExecutionMonitorRuntimeData? previous,
  ExecutionStateSnapshot? snapshot,
}) {
  final current = previous ?? const ExecutionMonitorRuntimeData();
  final steps = <String, ExecutionRuntimeStep>{...current.steps};
  final appearedStepIds = <String>[...current.appearedStepIds];
  final snapshotById = {
    for (final step in snapshot?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };

  for (final step in execution.steps ?? const <ExecutionStepDto>[]) {
    final runtimeStep = _buildRuntimeStepFromExecutionStep(
      step,
      snapshot: snapshotById[step.id],
      previous: steps[step.id],
    );
    steps[step.id] = runtimeStep;

    final shadowSnapshot =
        snapshotById[step.id] ??
        StepSnapshot(
          stepId: step.id,
          nodeId: step.nodeId,
          nodeName: runtimeStep.nodeName,
          nodeType: runtimeStep.nodeType,
          status: runtimeStep.status,
          startedAt: runtimeStep.startedAt,
          completedAt: runtimeStep.completedAt,
          errorMessage: runtimeStep.errorMessage,
          errorDetail: runtimeStep.errorDetail,
          checkpointData: runtimeStep.checkpointData,
          result: runtimeStep.result,
        );
    if (_shouldAppearStep(shadowSnapshot) &&
        !appearedStepIds.contains(step.id)) {
      appearedStepIds.add(step.id);
    }
  }

  return ExecutionMonitorRuntimeData(
    steps: steps,
    appearedStepIds: appearedStepIds,
  );
}

ExecutionMonitorRuntimeData _mergeRuntimeFromSnapshot(
  ExecutionMonitorRuntimeData runtime,
  ExecutionStateSnapshot snapshot,
) {
  final steps = <String, ExecutionRuntimeStep>{...runtime.steps};
  final appearedStepIds = <String>[...runtime.appearedStepIds];

  for (final step in snapshot.steps) {
    steps[step.stepId] = _seedRuntimeStepFromSnapshot(
      step,
      previous: steps[step.stepId],
    );
    if (_shouldAppearStep(step) && !appearedStepIds.contains(step.stepId)) {
      appearedStepIds.add(step.stepId);
    }
  }

  return ExecutionMonitorRuntimeData(
    steps: steps,
    appearedStepIds: appearedStepIds,
  );
}

ExecutionMonitorRuntimeData _updateRuntimeStep(
  ExecutionMonitorRuntimeData runtime, {
  required String stepId,
  required String nodeId,
  required ExecutionRuntimeStep Function(ExecutionRuntimeStep current)
  transform,
  bool markAppeared = false,
}) {
  final current =
      runtime.steps[stepId] ??
      ExecutionRuntimeStep(stepId: stepId, nodeId: nodeId);
  final steps = <String, ExecutionRuntimeStep>{
    ...runtime.steps,
    stepId: transform(current),
  };
  final appearedStepIds =
      markAppeared && !runtime.appearedStepIds.contains(stepId)
      ? [...runtime.appearedStepIds, stepId]
      : runtime.appearedStepIds;

  return runtime.copyWith(steps: steps, appearedStepIds: appearedStepIds);
}

ExecutionMonitorRuntimeData _updateRuntimeWithNodeStatus(
  ExecutionMonitorRuntimeData runtime,
  NodeStatusChangedData data,
) {
  return _updateRuntimeStep(
    runtime,
    stepId: data.stepId,
    nodeId: data.nodeId,
    markAppeared: data.to != 'pending',
    transform: (current) => current.copyWith(
      nodeName: data.nodeName,
      nodeType: data.nodeType,
      status: data.to,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      errorMessage: data.errorMessage,
      errorDetail: data.errorDetail,
      isStreaming: data.to == 'running' || data.to == 'queued',
      clearIntervention: data.to != 'waiting_intervention',
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithOutputChunk(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final chunk = _readString(payload['chunk']);
  if (stepId == null || chunk == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;

  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      output: '${step.output}$chunk',
      segments: _appendTextSegment(step.segments, chunk),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithStepRetrying(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  if (stepId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;
  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      retryAttempt: _readInt(payload['attempt']),
      retryMaxAttempts: _readInt(payload['maxAttempts']),
      errorMessage: _readString(payload['errorMessage']) ?? step.errorMessage,
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithAgentEvent(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final event = _asMap(payload['event']);
  final type = _readString(event['type']);
  if (stepId == null || type == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;

  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) {
      switch (type) {
        case 'message_chunk':
          final chunk = _readString(event['content']);
          if (chunk == null) {
            return step;
          }
          return step.copyWith(
            output: '${step.output}$chunk',
            segments: _appendTextSegment(step.segments, chunk),
            isStreaming: true,
          );
        case 'plan':
          final content =
              _readString(event['content']) ?? _readString(event['title']);
          if (content == null) {
            return step;
          }
          return step.copyWith(
            thinking: '${step.thinking ?? ''}$content',
            segments: _appendThinkingSegment(step.segments, content),
            isStreaming: true,
          );
        case 'decision':
          final rationale =
              _readString(event['rationale']) ??
              _readString(event['suggestedContent']);
          if (rationale == null) {
            return step;
          }
          return step.copyWith(
            thinking: '${step.thinking ?? ''}$rationale',
            segments: _appendThinkingSegment(step.segments, rationale),
            isStreaming: true,
          );
        case 'tool_call':
          final call = _asMap(event['call']);
          final toolCallId = _readString(call['id']);
          if (toolCallId == null) {
            return step;
          }
          return step.copyWith(
            toolCalls: _upsertToolCall(
              step.toolCalls,
              toolCallId: toolCallId,
              tool: _readString(call['tool']) ?? 'unknown_tool',
              args: call['args'],
              status: _normalizeConversationToolStatus(
                call['status'],
                error: call['error'],
                result: call['result'],
              ),
              result: call['result'],
              error: _readString(call['error']),
              transitions: _normalizeTransitions(call['transitions']),
              permissionRequest: _normalizePermissionRequest(
                call['permissionRequest'] ?? call['permission_request'],
              ),
            ),
            segments: _ensureToolSegment(step.segments, toolCallId),
            isStreaming: true,
          );
        case 'pty.output':
          final data = _readString(event['data']);
          if (data == null) {
            return step;
          }
          return step.copyWith(
            terminalEntries: [
              ...step.terminalEntries,
              TerminalEntry(
                id: 'terminal-${DateTime.now().microsecondsSinceEpoch}',
                output: data,
                timestamp: DateTime.now(),
                sessionId: _readString(event['sessionId']),
              ),
            ],
          );
        case 'file_change':
          final path = _readString(event['path']);
          if (path == null) {
            return step;
          }
          return step.copyWith(
            fileChanges: [
              ...step.fileChanges,
              WorkspaceFileChange(
                path: path,
                changeType: _readString(event['changeType']) ?? 'modified',
                diff: _readString(event['diff']),
                content: _readString(event['content']),
              ),
            ],
          );
        case 'done':
          return step.copyWith(
            isStreaming: false,
            stopReason: _readString(event['stopReason']),
          );
        default:
          return step;
      }
    },
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithToolCallStatus(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final toolCallId = _readString(payload['toolCallId']);
  if (stepId == null || toolCallId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;
  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: _upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: _readString(payload['tool']) ?? 'unknown_tool',
        args: payload['args'],
        status: _normalizeConversationToolStatus(
          payload['status'],
          error: payload['error'],
          result: payload['result'],
        ),
        result: payload['result'],
        error: _readString(payload['error']),
      ),
      segments: _ensureToolSegment(step.segments, toolCallId),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithToolPermissionRequired(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final toolCallId = _readString(payload['toolCallId']);
  if (stepId == null || toolCallId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;
  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: _upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: _readString(payload['tool']) ?? 'unknown_tool',
        args: payload['args'],
        status: ConversationToolStatus.awaitingPermission,
        permissionRequest: _normalizePermissionRequest(
          payload['permissionRequest'] ?? payload['permission_request'],
        ),
      ),
      segments: _ensureToolSegment(step.segments, toolCallId),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithToolPermissionResolved(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final toolCallId = _readString(payload['toolCallId']);
  final action = _readString(payload['action']);
  if (stepId == null || toolCallId == null || action == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;
  final nextStatus = action == 'approve'
      ? ConversationToolStatus.inProgress
      : ConversationToolStatus.denied;

  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: _upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: _readString(payload['tool']) ?? 'unknown_tool',
        status: nextStatus,
      ),
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithInterventionRequired(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  final nodeId = _readString(payload['nodeId']);
  if (stepId == null || nodeId == null) {
    return runtime;
  }

  final decision = _asMap(payload['decision']);
  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      status: 'waiting_intervention',
      intervention: ExecutionInterventionState(
        nodeName: _readString(payload['nodeName']) ?? step.nodeName,
        requestedAt: _readString(payload['requestedAt']),
        decision: decision.isEmpty ? null : decision,
        partialContent: _readString(payload['partialContent']),
      ),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData _updateRuntimeWithInterventionResolved(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = _readString(payload['stepId']);
  if (stepId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? _readString(payload['nodeId']) ?? stepId;
  return _updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(clearIntervention: true),
  );
}

// ---------------------------------------------------------------------------
// Notifier — AutoDispose Family
// ---------------------------------------------------------------------------

/// 执行监控 Notifier (Riverpod 3.x AutoDispose Family)
///
/// 生命周期：
/// 1. build() → REST 获取初始快照
/// 2. 连接 WebSocket → subscribe → 实时事件驱动更新
/// 3. 断连 → 自动降级 5s REST 轮询
/// 4. 重连 → 停止轮询 + re-subscribe(lastEventId)
/// 5. 终态 → 断开 WS + 停止轮询 → disconnected
class ExecutionMonitorNotifier extends AsyncNotifier<ExecutionMonitorState> {
  /// executionId 通过构造函数注入 (Riverpod 3.x family pattern)
  ExecutionMonitorNotifier(this.executionId);
  final String executionId;

  ExecutionSocketService? _socketService;
  Timer? _pollingTimer;
  int? _lastEventId;

  final List<StreamSubscription<dynamic>> _subscriptions = [];

  @override
  Future<ExecutionMonitorState> build() async {
    ref.onDispose(_cleanup);
    return _startMonitoring();
  }

  // -----------------------------------------------------------------------
  // 启动监控
  // -----------------------------------------------------------------------

  Future<ExecutionMonitorState> _startMonitoring() async {
    // 1. REST 获取初始状态
    ExecutionStateSnapshot initialSnapshot;
    ExecutionMonitorRuntimeData initialRuntime;
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      initialSnapshot = _buildSnapshotFromExecutionDetail(execution);
      initialRuntime = _buildRuntimeFromExecutionDetail(
        execution,
        snapshot: initialSnapshot,
      );
    } catch (e) {
      return ExecutionMonitorError(
        message: 'Failed to load execution: $e',
        executionId: executionId,
      );
    }

    // 终态无需 WS
    final status = ExecutionStatus.fromJson(initialSnapshot.status);
    if (status.isTerminal) {
      return ExecutionMonitorDisconnected(
        lastSnapshot: initialSnapshot,
        runtime: initialRuntime,
      );
    }

    // 2. 尝试 WebSocket
    try {
      final wsSnapshot = await _connectWebSocket(initialSnapshot);
      final mergedRuntime = _mergeRuntimeFromSnapshot(
        initialRuntime,
        wsSnapshot,
      );
      _startPolling();
      return ExecutionMonitorConnected(
        snapshot: wsSnapshot,
        runtime: mergedRuntime,
      );
    } catch (_) {
      // WS 连接失败 → 直接降级到轮询
      _startPolling();
      return ExecutionMonitorPolling(
        snapshot: initialSnapshot,
        runtime: initialRuntime,
      );
    }
  }

  // -----------------------------------------------------------------------
  // WebSocket 连接
  // -----------------------------------------------------------------------

  Future<ExecutionStateSnapshot> _connectWebSocket(
    ExecutionStateSnapshot currentSnapshot,
  ) async {
    final env = ref.read(envProvider);
    final authState = ref.read(authProvider).value;

    String? token;
    if (authState is AuthStateAuthenticated) {
      token = authState.tokens.accessToken;
    }
    if (token == null) {
      throw StateError('Not authenticated');
    }

    final factory = ref.read(socketServiceFactoryProvider);
    _socketService = factory(baseUrl: env.apiBaseUrl, authToken: token);

    // 注册事件监听（在 connect 之前）
    _setupEventListeners();

    _socketService!.connect();

    // 等待连接成功（最多 10 秒）
    await _socketService!.onConnected.first.timeout(
      const Duration(seconds: 10),
      onTimeout: () => throw TimeoutException('WebSocket connection timeout'),
    );

    // 订阅执行事件
    final ack = await _socketService!.subscribe(
      executionId: executionId,
      lastEventId: _lastEventId,
    );

    if (ack.status == 'error') {
      throw StateError('Subscribe failed: ${ack.error}');
    }

    // 如果 ACK 返回了 snapshot，用它作为最新状态
    if (ack.currentState != null) {
      final mergedSnapshot = _mergeSnapshotMetadata(
        ack.currentState!,
        previous: currentSnapshot,
      );
      _lastEventId = mergedSnapshot.lastEventId;
      return mergedSnapshot;
    }

    return currentSnapshot;
  }

  // -----------------------------------------------------------------------
  // 事件监听
  // -----------------------------------------------------------------------

  void _setupEventListeners() {
    final socket = _socketService!;

    _subscriptions.add(
      socket.executionStatusChanged.listen(_handleStatusChanged),
    );
    _subscriptions.add(
      socket.nodeStatusChanged.listen(_handleNodeStatusChanged),
    );
    _subscriptions.add(socket.stepAgentEvent.listen(_handleStepAgentEvent));
    _subscriptions.add(socket.stepRetrying.listen(_handleStepRetrying));
    _subscriptions.add(socket.outputChunk.listen(_handleOutputChunk));
    _subscriptions.add(
      socket.interventionRequired.listen(_handleInterventionRequired),
    );
    _subscriptions.add(
      socket.interventionResolved.listen(_handleInterventionResolved),
    );
    _subscriptions.add(
      socket.toolCallStatusChanged.listen(_handleToolCallStatusChanged),
    );
    _subscriptions.add(
      socket.toolPermissionRequired.listen(_handleToolPermissionRequired),
    );
    _subscriptions.add(
      socket.toolPermissionResolved.listen(_handleToolPermissionResolved),
    );
    _subscriptions.add(socket.stateSnapshot.listen(_handleSnapshot));
    _subscriptions.add(socket.onDisconnected.listen(_handleDisconnected));
    _subscriptions.add(socket.onReconnected.listen(_handleReconnected));
  }

  /// 处理执行状态变更事件
  void _handleStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final data = ExecutionStatusChangedData.fromJson(
      envelope.data.cast<String, dynamic>(),
    );

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final currentRuntime = extractMonitorRuntime(state.value);
    final mode = extractMonitorConnectionMode(state.value);

    final updatedSnapshot = currentSnapshot.copyWith(
      status: data.status,
      completedSteps: data.completedSteps ?? currentSnapshot.completedSteps,
      totalSteps: data.totalSteps ?? currentSnapshot.totalSteps,
    );

    final newStatus = ExecutionStatus.fromJson(data.status);
    if (newStatus.isTerminal) {
      unawaited(
        _finalizeTerminalState(
          fallbackSnapshot: updatedSnapshot,
          fallbackRuntime: currentRuntime,
        ),
      );
      return;
    }

    state = AsyncValue.data(
      ExecutionMonitorConnected(
        snapshot: updatedSnapshot,
        connectionMode: mode,
        runtime: currentRuntime,
      ),
    );
  }

  Future<void> _finalizeTerminalState({
    required ExecutionStateSnapshot fallbackSnapshot,
    required ExecutionMonitorRuntimeData fallbackRuntime,
  }) async {
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      if (!ref.mounted) {
        return;
      }

      final latestSnapshot = _buildSnapshotFromExecutionDetail(
        execution,
        previous: fallbackSnapshot,
      );
      final terminalSnapshot = latestSnapshot.copyWith(
        status: fallbackSnapshot.status,
        completedSteps: fallbackSnapshot.completedSteps,
        totalSteps: fallbackSnapshot.totalSteps,
      );
      final latestRuntime = _buildRuntimeFromExecutionDetail(
        execution,
        previous: fallbackRuntime,
        snapshot: terminalSnapshot,
      );
      _onTerminalState(terminalSnapshot, runtime: latestRuntime);
    } catch (_) {
      if (!ref.mounted) {
        return;
      }

      final mergedRuntime = _mergeRuntimeFromSnapshot(
        fallbackRuntime,
        fallbackSnapshot,
      );
      _onTerminalState(fallbackSnapshot, runtime: mergedRuntime);
    }
  }

  /// 处理节点状态变更事件
  void _handleNodeStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final data = NodeStatusChangedData.fromJson(
      envelope.data.cast<String, dynamic>(),
    );

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final currentRuntime = extractMonitorRuntime(state.value);

    // 更新对应 step 的状态
    var hasMatchedStep = false;
    final updatedSteps = currentSnapshot.steps
        .map((step) {
          if (step.stepId == data.stepId) {
            hasMatchedStep = true;
            return step.copyWith(
              nodeName: data.nodeName ?? step.nodeName,
              nodeType: data.nodeType ?? step.nodeType,
              status: data.to,
              startedAt: data.startedAt ?? step.startedAt,
              completedAt: data.completedAt ?? step.completedAt,
              errorMessage: data.errorMessage,
              errorDetail: data.errorDetail,
            );
          }
          return step;
        })
        .toList(growable: true);

    if (!hasMatchedStep) {
      updatedSteps.add(
        StepSnapshot(
          stepId: data.stepId,
          nodeId: data.nodeId,
          nodeName: data.nodeName ?? data.nodeId,
          nodeType: data.nodeType,
          status: data.to,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          errorMessage: data.errorMessage,
          errorDetail: data.errorDetail,
        ),
      );
    }

    final updatedSnapshot = currentSnapshot.copyWith(steps: updatedSteps);
    final updatedRuntime = _updateRuntimeWithNodeStatus(currentRuntime, data);

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: updatedSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: updatedSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleStepAgentEvent(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithAgentEvent(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleStepRetrying(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithStepRetrying(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleOutputChunk(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithOutputChunk(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleInterventionRequired(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithInterventionRequired(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleInterventionResolved(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithInterventionResolved(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolCallStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithToolCallStatus(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolPermissionRequired(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithToolPermissionRequired(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolPermissionResolved(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = _updateRuntimeWithToolPermissionResolved(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  /// 处理全量快照事件（gap recovery）
  void _handleSnapshot(ExecutionStateSnapshot snapshot) {
    final mergedSnapshot = _mergeSnapshotMetadata(
      snapshot,
      previous: extractMonitorSnapshot(state.value),
    );
    final mergedRuntime = _mergeRuntimeFromSnapshot(
      extractMonitorRuntime(state.value),
      mergedSnapshot,
    );
    _lastEventId = mergedSnapshot.lastEventId;

    final status = ExecutionStatus.fromJson(mergedSnapshot.status);
    if (status.isTerminal) {
      _onTerminalState(mergedSnapshot, runtime: mergedRuntime);
      return;
    }

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: mergedSnapshot,
          runtime: mergedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: mergedSnapshot,
          runtime: mergedRuntime,
        ),
      );
    }
  }

  // -----------------------------------------------------------------------
  // 断连 / 重连
  // -----------------------------------------------------------------------

  void _handleDisconnected(String reason) {
    final snapshot = extractMonitorSnapshot(state.value);
    if (snapshot == null) return;
    final runtime = extractMonitorRuntime(state.value);

    final status = ExecutionStatus.fromJson(snapshot.status);
    if (status.isTerminal) return;

    // 服务端主动断连（认证失败）不重连
    if (reason == 'io server disconnect') {
      state = AsyncValue.data(
        ExecutionMonitorError(
          message: 'Server disconnected: authentication failed',
          executionId: executionId,
        ),
      );
      return;
    }

    // 降级到轮询
    _startPolling();
    state = AsyncValue.data(
      ExecutionMonitorPolling(
        snapshot: snapshot,
        connectionMode: ConnectionMode.reconnecting,
        runtime: runtime,
      ),
    );
  }

  void _handleReconnected(void _) async {
    _stopPolling();

    // re-subscribe with lastEventId
    if (_socketService != null) {
      try {
        final previousSnapshot = extractMonitorSnapshot(state.value);
        final previousRuntime = extractMonitorRuntime(state.value);
        final ack = await _socketService!.subscribe(
          executionId: executionId,
          lastEventId: _lastEventId,
        );

        if (ack.status == 'subscribed' && ack.currentState != null) {
          final mergedSnapshot = _mergeSnapshotMetadata(
            ack.currentState!,
            previous: previousSnapshot,
          );
          final mergedRuntime = _mergeRuntimeFromSnapshot(
            previousRuntime,
            mergedSnapshot,
          );
          _lastEventId = mergedSnapshot.lastEventId;
          _startPolling();
          state = AsyncValue.data(
            ExecutionMonitorConnected(
              snapshot: mergedSnapshot,
              runtime: mergedRuntime,
            ),
          );
          return;
        }
      } catch (_) {
        // subscribe 失败则保持当前快照
      }
    }

    final snapshot = extractMonitorSnapshot(state.value);
    if (snapshot != null) {
      _startPolling();
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: snapshot,
          runtime: extractMonitorRuntime(state.value),
        ),
      );
    }
  }

  // -----------------------------------------------------------------------
  // REST 对账 / 断线降级
  // -----------------------------------------------------------------------

  void _startPolling() {
    _stopPolling();
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _pollExecution();
    });
  }

  Future<void> _pollExecution() async {
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      final polledSnapshot = _buildSnapshotFromExecutionDetail(
        execution,
        previous: extractMonitorSnapshot(state.value),
      );
      final polledRuntime = _buildRuntimeFromExecutionDetail(
        execution,
        previous: extractMonitorRuntime(state.value),
        snapshot: polledSnapshot,
      );

      final status = ExecutionStatus.fromJson(execution.status);
      if (status.isTerminal) {
        _onTerminalState(polledSnapshot, runtime: polledRuntime);
        return;
      }

      final mode = extractMonitorConnectionMode(state.value);
      if (state.value is ExecutionMonitorConnected) {
        state = AsyncValue.data(
          ExecutionMonitorConnected(
            snapshot: polledSnapshot,
            connectionMode: mode,
            runtime: polledRuntime,
          ),
        );
      } else {
        state = AsyncValue.data(
          ExecutionMonitorPolling(
            snapshot: polledSnapshot,
            connectionMode: mode,
            runtime: polledRuntime,
          ),
        );
      }
    } catch (_) {
      // 轮询失败不更新状态，等下一次重试
    }
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  // -----------------------------------------------------------------------
  // 终态处理
  // -----------------------------------------------------------------------

  void _onTerminalState(
    ExecutionStateSnapshot snapshot, {
    ExecutionMonitorRuntimeData? runtime,
  }) {
    _stopPolling();
    _disposeSocket();
    state = AsyncValue.data(
      ExecutionMonitorDisconnected(
        lastSnapshot: snapshot,
        runtime: runtime ?? extractMonitorRuntime(state.value),
      ),
    );
  }

  void _disposeSocket() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _subscriptions.clear();
    _socketService?.dispose();
    _socketService = null;
  }

  void _cleanup() {
    _stopPolling();
    _disposeSocket();
  }
}

/// 执行监控 Provider（AutoDispose + Family）
///
/// Riverpod 3.x 模式：构造函数接收 executionId 参数
final executionMonitorProvider = AsyncNotifierProvider.autoDispose
    .family<ExecutionMonitorNotifier, ExecutionMonitorState, String>(
      ExecutionMonitorNotifier.new,
    );

/// SocketService 工厂 Provider（可在测试中覆盖）
typedef SocketServiceFactory =
    ExecutionSocketService Function({
      required String baseUrl,
      required String authToken,
    });

final socketServiceFactoryProvider = Provider<SocketServiceFactory>(
  (ref) =>
      ({required baseUrl, required authToken}) =>
          ExecutionSocketService(baseUrl: baseUrl, authToken: authToken),
);
