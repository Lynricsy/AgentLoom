import 'dart:convert';

import '../../agents/models/conversation_message_dto.dart';
import '../../workflows/models/execution_step_dto.dart';
import '../../workflows/models/execution_summary_dto.dart';
import '../../../shared/conversation/conversation_normalizers.dart';
import '../models/execution_event.dart';
import '../models/execution_runtime.dart';
import '../models/execution_state.dart';

typedef GraphNodeMeta =
    ({String? nodeName, String? nodeType, String? parentNodeId});

bool isCompoundContainerNodeType(String? nodeType) {
  return nodeType == 'loop' || nodeType == 'iteration';
}

String? buildCompoundAwareNodeName(
  String nodeId,
  GraphNodeMeta meta,
  Map<String, GraphNodeMeta> graphNodeMeta,
) {
  final baseNodeName =
      meta.nodeName?.trim().isNotEmpty == true ? meta.nodeName : nodeId;
  final parentNodeId = meta.parentNodeId;
  if (parentNodeId == null) {
    return baseNodeName;
  }

  final parentMeta = graphNodeMeta[parentNodeId];
  if (parentMeta == null || !isCompoundContainerNodeType(parentMeta.nodeType)) {
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

Map<String, GraphNodeMeta> extractGraphNodeMeta(
  Map<String, dynamic>? definitionSnapshot,
) {
  final rawNodes = definitionSnapshot?['nodes'];
  if (rawNodes is! List) {
    return const {};
  }

  final graphNodeMeta = <String, GraphNodeMeta>{};
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
        nodeName: buildCompoundAwareNodeName(
          entry.key,
          entry.value,
          graphNodeMeta,
        ),
        nodeType: entry.value.nodeType,
        parentNodeId: entry.value.parentNodeId,
      ),
  };
}

StepSnapshot mapExecutionStep(
  ExecutionStepDto step, {
  GraphNodeMeta? graphNodeMeta,
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

ExecutionStateSnapshot buildSnapshotFromExecutionDetail(
  ExecutionSummaryDto execution, {
  ExecutionStateSnapshot? previous,
}) {
  final previousStepsById = {
    for (final step in previous?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };
  final graphNodeMeta = extractGraphNodeMeta(execution.definitionSnapshot);
  final mappedSteps = execution.steps
      ?.map(
        (step) => mapExecutionStep(
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

ExecutionStateSnapshot mergeSnapshotMetadata(
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


int? readInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return null;
}

bool shouldAppearStep(StepSnapshot step) {
  return step.status != 'pending' ||
      step.startedAt != null ||
      step.completedAt != null ||
      (step.result?.isNotEmpty ?? false) ||
      (step.checkpointData?.isNotEmpty ?? false);
}

ConversationToolStatus normalizeConversationToolStatus(
  Object? value, {
  Object? error,
  Object? result,
}) {
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
      if (error != null) {
        return ConversationToolStatus.failed;
      }
      if (result != null) {
        return ConversationToolStatus.completed;
      }
      return ConversationToolStatus.pending;
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

  if (description == null && resourcePaths.isEmpty) {
    return null;
  }

  return ConversationToolPermissionRequestDto(
    description: description,
    resourcePaths: resourcePaths,
  );
}

List<ConversationToolTransitionDto> normalizeTransitions(Object? value) {
  if (value is! List) {
    return const <ConversationToolTransitionDto>[];
  }

  final transitions = <ConversationToolTransitionDto>[];
  for (final item in value) {
    final payload = asMap(item);
    final to = normalizeConversationToolStatus(payload['to']);
    final timestamp = readString(payload['timestamp']);
    final source = readString(payload['source']);
    if (timestamp == null ||
        source == null ||
        (source != 'runtime' && source != 'worker' && source != 'user')) {
      continue;
    }

    transitions.add(
      ConversationToolTransitionDto(
        from: readString(payload['from']) == null
            ? null
            : normalizeConversationToolStatus(payload['from']),
        to: to,
        timestamp: timestamp,
        source: source,
      ),
    );
  }

  return transitions;
}

Object? unwrapMcpResult(Object? value) {
  var parsed = value;
  if (value is String) {
    try {
      parsed = jsonDecode(value);
    } catch (_) {
      return value;
    }
  }

  final payload = asMap(parsed);
  if (payload.isEmpty) {
    return value;
  }

  final content = payload['content'];
  if (content is! List || content.isEmpty) {
    return value;
  }

  final textParts = <String>[];
  for (final item in content) {
    final entry = asMap(item);
    if (entry['type'] == 'text' && entry['text'] is String) {
      textParts.add(entry['text'] as String);
    }
  }

  return textParts.isEmpty ? value : textParts.join('');
}

String extractResultOutput(
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
    final partialContent = readString(
      checkpointData['partialContent'] ?? checkpointData['partial_content'],
    );
    if (partialContent != null) {
      return partialContent;
    }

    final content = readString(checkpointData['content']);
    if (content != null) {
      return content;
    }
  }

  return '';
}

String? extractCheckpointThinking(Map<String, dynamic>? checkpointData) {
  final decision = asMap(checkpointData?['decision']);
  if (decision.isEmpty) {
    return null;
  }

  final parts = <String>[
    if (readString(decision['rationale']) case final rationale?) rationale,
    if (readString(
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

List<ConversationToolCallDto> normalizeCheckpointToolCalls(
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
    final payload = asMap(rawToolCall);
    final id = readString(payload['id']);
    final tool = readString(payload['tool']);
    if (id == null || tool == null) {
      continue;
    }

    toolCalls.add(
      ConversationToolCallDto(
        id: id,
        tool: tool,
        args: payload['args'],
        status: normalizeConversationToolStatus(
          payload['status'],
          error: payload['error'],
          result: payload['result'],
        ),
        result: unwrapMcpResult(payload['result']),
        error: readString(payload['error']),
        transitions: normalizeTransitions(payload['transitions']),
        permissionRequest: normalizePermissionRequest(
          payload['permissionRequest'] ?? payload['permission_request'],
        ),
        startedAt: fallbackTimestamp,
        updatedAt: fallbackTimestamp,
      ),
    );
  }

  return toolCalls;
}


List<MessageSegment> normalizeCheckpointSegments(
  Map<String, dynamic>? checkpointData,
  List<ConversationToolCallDto> toolCalls, {
  required String fallbackContent,
  String? fallbackThinking,
}) {
  final rawSegments = checkpointData?['segments'];
  if (rawSegments is List) {
    var segments = <MessageSegment>[];
    for (final rawSegment in rawSegments) {
      final segment = asMap(rawSegment);
      final type = readString(segment['type']);
      if (type == 'text' || type == 'thinking') {
        final content = readString(segment['content']);
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
            readString(segment['toolCallId']) ??
            readString(segment['tool_call_id']);
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
          segments = appendTextSegment(segments, suffix);
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
          segments = appendThinkingSegment(segments, thinkingSuffix);
        }
      }

      for (final toolCall in toolCalls) {
        segments = ensureToolSegment(segments, toolCall.id);
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

List<ConversationToolCallDto> upsertToolCall(
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
    result: result != null ? unwrapMcpResult(result) : current?.result,
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

ExecutionInterventionState? extractInterventionState(
  Map<String, dynamic>? checkpointData, {
  String? nodeName,
}) {
  if (checkpointData == null) {
    return null;
  }

  final decision = asMap(checkpointData['decision']);
  final requestedAt =
      readString(
        checkpointData['interventionRequestedAt'] ??
            checkpointData['intervention_requested_at'],
      ) ??
      readString(asMap(checkpointData['intervention'])['requested_at']);
  final partialContent = readString(
    checkpointData['partialContent'] ?? checkpointData['partial_content'],
  );

  if (decision.isEmpty && requestedAt == null && partialContent == null) {
    return null;
  }

  return ExecutionInterventionState(
    nodeName:
        readString(
          checkpointData['interventionNodeName'] ??
              checkpointData['intervention_node_name'],
        ) ??
        nodeName,
    requestedAt: requestedAt,
    decision: decision.isEmpty ? null : decision,
    partialContent: partialContent,
  );
}

ExecutionRuntimeStep seedRuntimeStepFromSnapshot(
  StepSnapshot step, {
  ExecutionRuntimeStep? previous,
}) {
  final checkpointData = step.checkpointData ?? previous?.checkpointData;
  final result = step.result ?? previous?.result;
  final output = extractResultOutput(result, checkpointData: checkpointData);
  final toolCalls = normalizeCheckpointToolCalls(checkpointData);
  final thinking = extractCheckpointThinking(checkpointData);
  final segments = normalizeCheckpointSegments(
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
        thinking ?? collectThinkingSegments(segments) ?? previous?.thinking,
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
        extractInterventionState(checkpointData, nodeName: step.nodeName) ??
        previous?.intervention,
    stopReason:
        readString(
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

ExecutionRuntimeStep buildRuntimeStepFromExecutionStep(
  ExecutionStepDto step, {
  StepSnapshot? snapshot,
  ExecutionRuntimeStep? previous,
}) {
  final checkpointData = step.checkpointData;
  final output = extractResultOutput(
    step.result,
    checkpointData: checkpointData,
  );
  final toolCalls = normalizeCheckpointToolCalls(checkpointData);
  final thinking = extractCheckpointThinking(checkpointData);
  final segments = normalizeCheckpointSegments(
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
        thinking ?? collectThinkingSegments(segments) ?? previous?.thinking,
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
        extractInterventionState(
          checkpointData,
          nodeName: snapshot?.nodeName,
        ) ??
        previous?.intervention,
    stopReason:
        readString(
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

ExecutionMonitorRuntimeData buildRuntimeFromExecutionDetail(
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
    final runtimeStep = buildRuntimeStepFromExecutionStep(
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
    if (shouldAppearStep(shadowSnapshot) &&
        !appearedStepIds.contains(step.id)) {
      appearedStepIds.add(step.id);
    }
  }

  return ExecutionMonitorRuntimeData(
    steps: steps,
    appearedStepIds: appearedStepIds,
  );
}

ExecutionMonitorRuntimeData mergeRuntimeFromSnapshot(
  ExecutionMonitorRuntimeData runtime,
  ExecutionStateSnapshot snapshot,
) {
  final steps = <String, ExecutionRuntimeStep>{...runtime.steps};
  final appearedStepIds = <String>[...runtime.appearedStepIds];

  for (final step in snapshot.steps) {
    steps[step.stepId] = seedRuntimeStepFromSnapshot(
      step,
      previous: steps[step.stepId],
    );
    if (shouldAppearStep(step) && !appearedStepIds.contains(step.stepId)) {
      appearedStepIds.add(step.stepId);
    }
  }

  return ExecutionMonitorRuntimeData(
    steps: steps,
    appearedStepIds: appearedStepIds,
  );
}

ExecutionMonitorRuntimeData updateRuntimeStep(
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

ExecutionMonitorRuntimeData updateRuntimeWithNodeStatus(
  ExecutionMonitorRuntimeData runtime,
  NodeStatusChangedData data,
) {
  return updateRuntimeStep(
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

ExecutionMonitorRuntimeData updateRuntimeWithOutputChunk(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final chunk = readString(payload['chunk']);
  if (stepId == null || chunk == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;

  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      output: '${step.output}$chunk',
      segments: appendTextSegment(step.segments, chunk),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithStepRetrying(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  if (stepId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;
  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      retryAttempt: readInt(payload['attempt']),
      retryMaxAttempts: readInt(payload['maxAttempts']),
      errorMessage: readString(payload['errorMessage']) ?? step.errorMessage,
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithAgentEvent(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final event = asMap(payload['event']);
  final type = readString(event['type']);
  if (stepId == null || type == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;

  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) {
      switch (type) {
        case 'message_chunk':
          final chunk = readString(event['content']);
          if (chunk == null) {
            return step;
          }
          return step.copyWith(
            output: '${step.output}$chunk',
            segments: appendTextSegment(step.segments, chunk),
            isStreaming: true,
          );
        case 'plan':
          final content =
              readString(event['content']) ?? readString(event['title']);
          if (content == null) {
            return step;
          }
          return step.copyWith(
            thinking: '${step.thinking ?? ''}$content',
            segments: appendThinkingSegment(step.segments, content),
            isStreaming: true,
          );
        case 'decision':
          final rationale =
              readString(event['rationale']) ??
              readString(event['suggestedContent']);
          if (rationale == null) {
            return step;
          }
          return step.copyWith(
            thinking: '${step.thinking ?? ''}$rationale',
            segments: appendThinkingSegment(step.segments, rationale),
            isStreaming: true,
          );
        case 'tool_call':
          final call = asMap(event['call']);
          final toolCallId = readString(call['id']);
          if (toolCallId == null) {
            return step;
          }
          return step.copyWith(
            toolCalls: upsertToolCall(
              step.toolCalls,
              toolCallId: toolCallId,
              tool: readString(call['tool']) ?? 'unknown_tool',
              args: call['args'],
              status: normalizeConversationToolStatus(
                call['status'],
                error: call['error'],
                result: call['result'],
              ),
              result: call['result'],
              error: readString(call['error']),
              transitions: normalizeTransitions(call['transitions']),
              permissionRequest: normalizePermissionRequest(
                call['permissionRequest'] ?? call['permission_request'],
              ),
            ),
            segments: ensureToolSegment(step.segments, toolCallId),
            isStreaming: true,
          );
        case 'pty.output':
          final data = readString(event['data']);
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
                sessionId: readString(event['sessionId']),
              ),
            ],
          );
        case 'file_change':
          final path = readString(event['path']);
          if (path == null) {
            return step;
          }
          return step.copyWith(
            fileChanges: [
              ...step.fileChanges,
              WorkspaceFileChange(
                path: path,
                changeType: readString(event['changeType']) ?? 'modified',
                diff: readString(event['diff']),
                content: readString(event['content']),
              ),
            ],
          );
        case 'done':
          return step.copyWith(
            isStreaming: false,
            stopReason: readString(event['stopReason']),
          );
        default:
          return step;
      }
    },
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithToolCallStatus(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final toolCallId = readString(payload['toolCallId']);
  if (stepId == null || toolCallId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;
  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: readString(payload['tool']) ?? 'unknown_tool',
        args: payload['args'],
        status: normalizeConversationToolStatus(
          payload['status'],
          error: payload['error'],
          result: payload['result'],
        ),
        result: payload['result'],
        error: readString(payload['error']),
      ),
      segments: ensureToolSegment(step.segments, toolCallId),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithToolPermissionRequired(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final toolCallId = readString(payload['toolCallId']);
  if (stepId == null || toolCallId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;
  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: readString(payload['tool']) ?? 'unknown_tool',
        args: payload['args'],
        status: ConversationToolStatus.awaitingPermission,
        permissionRequest: normalizePermissionRequest(
          payload['permissionRequest'] ?? payload['permission_request'],
        ),
      ),
      segments: ensureToolSegment(step.segments, toolCallId),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithToolPermissionResolved(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final toolCallId = readString(payload['toolCallId']);
  final action = readString(payload['action']);
  if (stepId == null || toolCallId == null || action == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;
  final nextStatus = action == 'approve'
      ? ConversationToolStatus.inProgress
      : ConversationToolStatus.denied;

  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      toolCalls: upsertToolCall(
        step.toolCalls,
        toolCallId: toolCallId,
        tool: readString(payload['tool']) ?? 'unknown_tool',
        status: nextStatus,
      ),
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithInterventionRequired(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  final nodeId = readString(payload['nodeId']);
  if (stepId == null || nodeId == null) {
    return runtime;
  }

  final decision = asMap(payload['decision']);
  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(
      status: 'waiting_intervention',
      intervention: ExecutionInterventionState(
        nodeName: readString(payload['nodeName']) ?? step.nodeName,
        requestedAt: readString(payload['requestedAt']),
        decision: decision.isEmpty ? null : decision,
        partialContent: readString(payload['partialContent']),
      ),
      isStreaming: true,
    ),
  );
}

ExecutionMonitorRuntimeData updateRuntimeWithInterventionResolved(
  ExecutionMonitorRuntimeData runtime,
  Map<String, dynamic> payload,
) {
  final stepId = readString(payload['stepId']);
  if (stepId == null) {
    return runtime;
  }

  final current = runtime.steps[stepId];
  final nodeId = current?.nodeId ?? readString(payload['nodeId']) ?? stepId;
  return updateRuntimeStep(
    runtime,
    stepId: stepId,
    nodeId: nodeId,
    markAppeared: true,
    transform: (step) => step.copyWith(clearIntervention: true),
  );
}
