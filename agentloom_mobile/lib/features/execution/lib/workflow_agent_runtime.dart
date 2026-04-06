import '../../agents/models/conversation_message_dto.dart';
import 'output_content.dart';
import '../models/execution_runtime.dart';
import '../models/execution_state.dart';

bool isWorkflowAgentNodeType(String? nodeType) {
  if (nodeType == null || nodeType.isEmpty) {
    return false;
  }

  return nodeType.contains('agent');
}

String extractRuntimeOutput(StepSnapshot step, ExecutionRuntimeStep? runtime) {
  return extractWorkflowOutputText(step, runtime);
}

ConversationState buildWorkflowAgentConversationState({
  required StepSnapshot step,
  required ExecutionRuntimeStep? runtime,
  List<WorkspaceFileNode> fileTree = const <WorkspaceFileNode>[],
  List<WorkspaceFileChange>? fileChanges,
  String? selectedFilePath,
  WorkspaceFileContent? selectedFileContent,
  bool isLoadingWorkspace = false,
  String? error,
}) {
  final output = extractRuntimeOutput(step, runtime);
  final toolCalls = runtime?.toolCalls ?? const <ConversationToolCallDto>[];
  final segments = runtime?.segments ?? const <MessageSegment>[];
  final thinking = runtime?.thinking;

  final messages =
      output.trim().isEmpty && toolCalls.isEmpty && segments.isEmpty
      ? const <ConversationMessageDto>[]
      : [
          ConversationMessageDto(
            id: '${step.stepId}-assistant',
            conversationId: step.stepId,
            role: MessageRole.assistant,
            content: output,
            toolCalls: toolCalls,
            metadata: const <String, dynamic>{},
            createdAt: step.startedAt ?? DateTime.now().toIso8601String(),
            thinking: thinking,
            segments: segments,
            isStreaming: runtime?.isStreaming ?? false,
          ),
        ];

  return ConversationState(
    messages: messages,
    status:
        step.status == 'running' ||
            step.status == 'queued' ||
            step.status == 'waiting_intervention'
        ? ConversationStatus.executing
        : ConversationStatus.connected,
    isConnected: true,
    terminalEntries: runtime?.terminalEntries ?? const <TerminalEntry>[],
    fileTree: fileTree,
    fileChanges:
        fileChanges ?? runtime?.fileChanges ?? const <WorkspaceFileChange>[],
    selectedFilePath: selectedFilePath,
    selectedFileContent: selectedFileContent,
    isLoadingWorkspace: isLoadingWorkspace,
    error: error,
  );
}

String summarizeExecutionStep(
  StepSnapshot step,
  ExecutionRuntimeStep? runtime,
) {
  final activeToolCalls =
      runtime?.toolCalls
          .where((toolCall) => toolCall.status.isActive)
          .toList(growable: false) ??
      const <ConversationToolCallDto>[];
  if (activeToolCalls.isNotEmpty) {
    final awaitingTool = activeToolCalls.last;
    final action =
        awaitingTool.status == ConversationToolStatus.awaitingPermission
        ? '等待授权'
        : '执行中';
    return '$action · ${awaitingTool.tool}';
  }

  if (step.status == 'waiting_intervention') {
    return '等待人工介入';
  }

  if (step.errorMessage != null && step.errorMessage!.trim().isNotEmpty) {
    return step.errorMessage!;
  }

  if (runtime?.retryAttempt != null && runtime?.retryMaxAttempts != null) {
    return '重试 ${runtime!.retryAttempt}/${runtime.retryMaxAttempts}';
  }

  final format = getWorkflowOutputFormat(step.nodeType);
  final output = extractRuntimeOutput(step, runtime).trim();
  final preview = buildOutputPreviewText(
    format: format,
    output: output,
    jsonValue: extractWorkflowJsonValue(step, runtime),
    isStreaming: runtime?.isStreaming ?? false,
    maxChars: 120,
  );
  if (preview != null && preview.isNotEmpty) {
    return preview.replaceAll('\n', ' ');
  }

  final result = step.result;
  if (result != null && result.isNotEmpty) {
    return '已产出 ${result.keys.join(' / ')}';
  }

  if (isWorkflowOutputNodeType(step.nodeType)) {
    return '点击查看输出详情';
  }

  if (isWorkflowAgentNodeType(step.nodeType)) {
    return '点击查看 Agent 运行界面';
  }

  return switch (step.status) {
    'queued' => '等待调度',
    'running' => '正在执行',
    'completed' => '执行完成',
    'failed' => '执行失败',
    'cancelled' => '已取消',
    'skipped' => '已跳过',
    _ => '等待开始',
  };
}
