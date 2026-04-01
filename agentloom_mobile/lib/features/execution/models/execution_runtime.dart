import '../../agents/models/conversation_message_dto.dart';

class ExecutionInterventionState {
  const ExecutionInterventionState({
    this.nodeName,
    this.requestedAt,
    this.decision,
    this.partialContent,
  });

  final String? nodeName;
  final String? requestedAt;
  final Map<String, dynamic>? decision;
  final String? partialContent;

  ExecutionInterventionState copyWith({
    String? nodeName,
    bool clearNodeName = false,
    String? requestedAt,
    bool clearRequestedAt = false,
    Map<String, dynamic>? decision,
    bool clearDecision = false,
    String? partialContent,
    bool clearPartialContent = false,
  }) {
    return ExecutionInterventionState(
      nodeName: clearNodeName ? null : nodeName ?? this.nodeName,
      requestedAt: clearRequestedAt ? null : requestedAt ?? this.requestedAt,
      decision: clearDecision ? null : decision ?? this.decision,
      partialContent: clearPartialContent
          ? null
          : partialContent ?? this.partialContent,
    );
  }
}

class ExecutionRuntimeStep {
  const ExecutionRuntimeStep({
    required this.stepId,
    required this.nodeId,
    this.nodeName,
    this.nodeType,
    this.status = 'pending',
    this.output = '',
    this.thinking,
    this.errorMessage,
    this.errorDetail,
    this.checkpointData,
    this.result,
    this.startedAt,
    this.completedAt,
    this.isStreaming = false,
    this.retryAttempt,
    this.retryMaxAttempts,
    this.intervention,
    this.stopReason,
    this.toolCalls = const <ConversationToolCallDto>[],
    this.segments = const <MessageSegment>[],
    this.terminalEntries = const <TerminalEntry>[],
    this.fileChanges = const <WorkspaceFileChange>[],
  });

  final String stepId;
  final String nodeId;
  final String? nodeName;
  final String? nodeType;
  final String status;
  final String output;
  final String? thinking;
  final String? errorMessage;
  final Map<String, dynamic>? errorDetail;
  final Map<String, dynamic>? checkpointData;
  final Map<String, dynamic>? result;
  final String? startedAt;
  final String? completedAt;
  final bool isStreaming;
  final int? retryAttempt;
  final int? retryMaxAttempts;
  final ExecutionInterventionState? intervention;
  final String? stopReason;
  final List<ConversationToolCallDto> toolCalls;
  final List<MessageSegment> segments;
  final List<TerminalEntry> terminalEntries;
  final List<WorkspaceFileChange> fileChanges;

  ExecutionRuntimeStep copyWith({
    String? stepId,
    String? nodeId,
    String? nodeName,
    bool clearNodeName = false,
    String? nodeType,
    bool clearNodeType = false,
    String? status,
    String? output,
    String? thinking,
    bool clearThinking = false,
    String? errorMessage,
    bool clearErrorMessage = false,
    Map<String, dynamic>? errorDetail,
    bool clearErrorDetail = false,
    Map<String, dynamic>? checkpointData,
    bool clearCheckpointData = false,
    Map<String, dynamic>? result,
    bool clearResult = false,
    String? startedAt,
    bool clearStartedAt = false,
    String? completedAt,
    bool clearCompletedAt = false,
    bool? isStreaming,
    int? retryAttempt,
    bool clearRetryAttempt = false,
    int? retryMaxAttempts,
    bool clearRetryMaxAttempts = false,
    ExecutionInterventionState? intervention,
    bool clearIntervention = false,
    String? stopReason,
    bool clearStopReason = false,
    List<ConversationToolCallDto>? toolCalls,
    List<MessageSegment>? segments,
    List<TerminalEntry>? terminalEntries,
    List<WorkspaceFileChange>? fileChanges,
  }) {
    return ExecutionRuntimeStep(
      stepId: stepId ?? this.stepId,
      nodeId: nodeId ?? this.nodeId,
      nodeName: clearNodeName ? null : nodeName ?? this.nodeName,
      nodeType: clearNodeType ? null : nodeType ?? this.nodeType,
      status: status ?? this.status,
      output: output ?? this.output,
      thinking: clearThinking ? null : thinking ?? this.thinking,
      errorMessage: clearErrorMessage
          ? null
          : errorMessage ?? this.errorMessage,
      errorDetail: clearErrorDetail ? null : errorDetail ?? this.errorDetail,
      checkpointData: clearCheckpointData
          ? null
          : checkpointData ?? this.checkpointData,
      result: clearResult ? null : result ?? this.result,
      startedAt: clearStartedAt ? null : startedAt ?? this.startedAt,
      completedAt: clearCompletedAt ? null : completedAt ?? this.completedAt,
      isStreaming: isStreaming ?? this.isStreaming,
      retryAttempt: clearRetryAttempt
          ? null
          : retryAttempt ?? this.retryAttempt,
      retryMaxAttempts: clearRetryMaxAttempts
          ? null
          : retryMaxAttempts ?? this.retryMaxAttempts,
      intervention: clearIntervention
          ? null
          : intervention ?? this.intervention,
      stopReason: clearStopReason ? null : stopReason ?? this.stopReason,
      toolCalls: toolCalls ?? this.toolCalls,
      segments: segments ?? this.segments,
      terminalEntries: terminalEntries ?? this.terminalEntries,
      fileChanges: fileChanges ?? this.fileChanges,
    );
  }
}

class ExecutionMonitorRuntimeData {
  const ExecutionMonitorRuntimeData({
    this.steps = const <String, ExecutionRuntimeStep>{},
    this.appearedStepIds = const <String>[],
  });

  final Map<String, ExecutionRuntimeStep> steps;
  final List<String> appearedStepIds;

  ExecutionRuntimeStep? stepById(String stepId) => steps[stepId];

  ExecutionMonitorRuntimeData copyWith({
    Map<String, ExecutionRuntimeStep>? steps,
    List<String>? appearedStepIds,
  }) {
    return ExecutionMonitorRuntimeData(
      steps: steps ?? this.steps,
      appearedStepIds: appearedStepIds ?? this.appearedStepIds,
    );
  }
}
