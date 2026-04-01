import 'package:freezed_annotation/freezed_annotation.dart';

part 'conversation_message_dto.freezed.dart';
part 'conversation_message_dto.g.dart';

MessageRole _messageRoleFromJson(String? value) {
  switch (value) {
    case 'user':
      return MessageRole.user;
    case 'system':
      return MessageRole.system;
    case 'tool':
      return MessageRole.tool;
    case 'assistant':
    case 'agent':
    default:
      return MessageRole.assistant;
  }
}

String _messageRoleToJson(MessageRole role) {
  switch (role) {
    case MessageRole.user:
      return 'user';
    case MessageRole.system:
      return 'system';
    case MessageRole.tool:
      return 'tool';
    case MessageRole.assistant:
      return 'assistant';
  }
}

ConversationToolStatus _toolStatusFromJson(String? value) {
  switch (value) {
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
    default:
      return ConversationToolStatus.failed;
  }
}

String _toolStatusToJson(ConversationToolStatus status) {
  switch (status) {
    case ConversationToolStatus.pending:
      return 'pending';
    case ConversationToolStatus.awaitingPermission:
      return 'awaiting_permission';
    case ConversationToolStatus.denied:
      return 'denied';
    case ConversationToolStatus.inProgress:
      return 'in_progress';
    case ConversationToolStatus.completed:
      return 'completed';
    case ConversationToolStatus.failed:
      return 'failed';
  }
}

ConversationToolStatus? _nullableToolStatusFromJson(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  return _toolStatusFromJson(value);
}

String? _nullableToolStatusToJson(ConversationToolStatus? status) {
  if (status == null) {
    return null;
  }
  return _toolStatusToJson(status);
}

Map<String, dynamic> _mapFromJson(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}

Map<String, dynamic>? _nullableMapFromJson(Object? value) {
  final map = _mapFromJson(value);
  return map.isEmpty ? null : map;
}

List<String> _stringListFromJson(Object? value) {
  if (value is List) {
    return value
        .whereType<String>()
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
  }
  return const <String>[];
}

List<ConversationToolTransitionDto> _transitionsFromJson(Object? value) {
  if (value is! List) {
    return const <ConversationToolTransitionDto>[];
  }

  return value
      .whereType<Map<Object?, Object?>>()
      .map((item) => ConversationToolTransitionDto.fromJson(_mapFromJson(item)))
      .toList(growable: false);
}

List<ConversationToolCallDto> _toolCallsFromJson(Object? value) {
  if (value is! List) {
    return const <ConversationToolCallDto>[];
  }

  return value
      .whereType<Map<Object?, Object?>>()
      .map((item) => ConversationToolCallDto.fromJson(_mapFromJson(item)))
      .toList(growable: false);
}

List<ConversationToolResultDto> _toolResultsFromJson(Object? value) {
  if (value is! List) {
    return const <ConversationToolResultDto>[];
  }

  return value
      .whereType<Map<Object?, Object?>>()
      .map((item) => ConversationToolResultDto.fromJson(_mapFromJson(item)))
      .toList(growable: false);
}

ConversationToolPermissionRequestDto? _permissionRequestFromJson(
  Object? value,
) {
  final map = _nullableMapFromJson(value);
  if (map == null) {
    return null;
  }
  return ConversationToolPermissionRequestDto.fromJson(map);
}

/// 消息角色
enum MessageRole { user, assistant, system, tool }

/// 工具调用状态
enum ConversationToolStatus {
  pending,
  awaitingPermission,
  denied,
  inProgress,
  completed,
  failed,
}

extension ConversationToolStatusX on ConversationToolStatus {
  bool get isActive =>
      this == ConversationToolStatus.pending ||
      this == ConversationToolStatus.awaitingPermission ||
      this == ConversationToolStatus.inProgress;

  bool get isFinished =>
      this == ConversationToolStatus.completed ||
      this == ConversationToolStatus.denied ||
      this == ConversationToolStatus.failed;
}

enum ConversationStatus { idle, connecting, connected, executing, error }

/// 沙箱启动准备阶段
enum PreparationPhase {
  queued,
  preparing,
  sandboxCreating,
  agentInitializing,
  running,
}

/// 将服务端 snake_case 字符串映射为 PreparationPhase 枚举
PreparationPhase? parsePreparationPhase(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  switch (value) {
    case 'queued':
      return PreparationPhase.queued;
    case 'preparing':
      return PreparationPhase.preparing;
    case 'sandbox_creating':
      return PreparationPhase.sandboxCreating;
    case 'agent_initializing':
      return PreparationPhase.agentInitializing;
    case 'running':
      return PreparationPhase.running;
    default:
      return null;
  }
}

enum MessageSegmentKind { text, thinking, toolCall }

class MessageSegment {
  const MessageSegment._({required this.kind, this.content, this.toolCallId});

  const MessageSegment.text(String content)
    : this._(kind: MessageSegmentKind.text, content: content);

  const MessageSegment.thinking(String content)
    : this._(kind: MessageSegmentKind.thinking, content: content);

  const MessageSegment.toolCall(String toolCallId)
    : this._(kind: MessageSegmentKind.toolCall, toolCallId: toolCallId);

  final MessageSegmentKind kind;
  final String? content;
  final String? toolCallId;
}

@freezed
abstract class ConversationToolTransitionDto
    with _$ConversationToolTransitionDto {
  const factory ConversationToolTransitionDto({
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? from,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    required ConversationToolStatus to,
    required String timestamp,
    required String source,
  }) = _ConversationToolTransitionDto;

  factory ConversationToolTransitionDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolTransitionDtoFromJson(json);
}

@freezed
abstract class ConversationToolPermissionRequestDto
    with _$ConversationToolPermissionRequestDto {
  const factory ConversationToolPermissionRequestDto({
    String? description,
    @JsonKey(fromJson: _stringListFromJson)
    @Default(<String>[])
    List<String> resourcePaths,
  }) = _ConversationToolPermissionRequestDto;

  factory ConversationToolPermissionRequestDto.fromJson(
    Map<String, dynamic> json,
  ) => _$ConversationToolPermissionRequestDtoFromJson(json);
}

@freezed
abstract class ConversationToolCallDto with _$ConversationToolCallDto {
  const factory ConversationToolCallDto({
    required String id,
    required String tool,
    Object? args,
    @JsonKey(fromJson: _toolStatusFromJson, toJson: _toolStatusToJson)
    required ConversationToolStatus status,
    Object? result,
    String? error,
    @JsonKey(fromJson: _transitionsFromJson)
    @Default(<ConversationToolTransitionDto>[])
    List<ConversationToolTransitionDto> transitions,
    @JsonKey(fromJson: _permissionRequestFromJson)
    ConversationToolPermissionRequestDto? permissionRequest,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? startedAt,
    @JsonKey(includeFromJson: false, includeToJson: false) DateTime? updatedAt,
  }) = _ConversationToolCallDto;

  factory ConversationToolCallDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolCallDtoFromJson(json);
}

@freezed
abstract class ConversationToolResultDto with _$ConversationToolResultDto {
  const factory ConversationToolResultDto({
    String? toolCallId,
    String? tool,
    @JsonKey(
      fromJson: _nullableToolStatusFromJson,
      toJson: _nullableToolStatusToJson,
    )
    ConversationToolStatus? status,
    Object? result,
    String? error,
  }) = _ConversationToolResultDto;

  factory ConversationToolResultDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationToolResultDtoFromJson(json);
}

@freezed
abstract class ConversationMessageDto with _$ConversationMessageDto {
  const factory ConversationMessageDto({
    required String id,
    required String conversationId,
    @JsonKey(fromJson: _messageRoleFromJson, toJson: _messageRoleToJson)
    required MessageRole role,
    required String content,
    @JsonKey(fromJson: _toolCallsFromJson)
    @Default(<ConversationToolCallDto>[])
    List<ConversationToolCallDto> toolCalls,
    @JsonKey(fromJson: _toolResultsFromJson)
    @Default(<ConversationToolResultDto>[])
    List<ConversationToolResultDto> toolResults,
    @JsonKey(fromJson: _mapFromJson)
    @Default(<String, dynamic>{})
    Map<String, dynamic> metadata,
    required String createdAt,
    @JsonKey(includeFromJson: false, includeToJson: false) String? thinking,
    @JsonKey(includeFromJson: false, includeToJson: false)
    @Default(<MessageSegment>[])
    List<MessageSegment> segments,
    @JsonKey(includeFromJson: false, includeToJson: false)
    @Default(false)
    bool isStreaming,
  }) = _ConversationMessageDto;

  factory ConversationMessageDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationMessageDtoFromJson(json);
}

class TerminalEntry {
  const TerminalEntry({
    required this.id,
    required this.output,
    required this.timestamp,
    this.command,
    this.sessionId,
  });

  final String id;
  final String output;
  final DateTime timestamp;
  final String? command;
  final String? sessionId;
}

class WorkspaceFileNode {
  const WorkspaceFileNode({
    required this.name,
    required this.path,
    required this.type,
    this.size,
    this.children = const <WorkspaceFileNode>[],
  });

  factory WorkspaceFileNode.fromJson(Map<String, dynamic> json) {
    final childrenValue = json['children'];
    final children = childrenValue is List
        ? childrenValue
              .whereType<Map<Object?, Object?>>()
              .map((child) => WorkspaceFileNode.fromJson(_mapFromJson(child)))
              .toList(growable: false)
        : const <WorkspaceFileNode>[];

    return WorkspaceFileNode(
      name: json['name'] as String? ?? '',
      path: json['path'] as String? ?? '',
      type: json['type'] as String? ?? 'file',
      size: json['size'] as int?,
      children: children,
    );
  }

  final String name;
  final String path;
  final String type;
  final int? size;
  final List<WorkspaceFileNode> children;

  bool get isDirectory => type == 'directory';

  WorkspaceFileNode copyWith({
    String? name,
    String? path,
    String? type,
    int? size,
    List<WorkspaceFileNode>? children,
  }) {
    return WorkspaceFileNode(
      name: name ?? this.name,
      path: path ?? this.path,
      type: type ?? this.type,
      size: size ?? this.size,
      children: children ?? this.children,
    );
  }
}

class WorkspaceFileContent {
  const WorkspaceFileContent({
    required this.path,
    required this.content,
    required this.size,
    required this.encoding,
  });

  factory WorkspaceFileContent.fromJson(Map<String, dynamic> json) {
    return WorkspaceFileContent(
      path: json['path'] as String? ?? '',
      content: json['content'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      encoding: json['encoding'] as String? ?? 'utf-8',
    );
  }

  final String path;
  final String content;
  final int size;
  final String encoding;
}

class WorkspaceFileChange {
  const WorkspaceFileChange({
    required this.path,
    required this.changeType,
    this.diff,
    this.content,
  });

  final String path;
  final String changeType;
  final String? diff;
  final String? content;
}

class ConversationState {
  const ConversationState({
    this.messages = const <ConversationMessageDto>[],
    this.status = ConversationStatus.idle,
    this.isConnected = false,
    this.terminalEntries = const <TerminalEntry>[],
    this.fileTree = const <WorkspaceFileNode>[],
    this.hasLoadedWorkspaceTree = false,
    this.workspaceTreeOnly = false,
    this.workspacePreviewUnavailableReason,
    this.fileChanges = const <WorkspaceFileChange>[],
    this.selectedFilePath,
    this.selectedFileContent,
    this.isLoadingWorkspace = false,
    this.error,
    this.preparationPhase,
    this.preparationStartTime,
    this.sandboxReused = false,
    this.preparationError,
    this.preparationFailedPhase,
  });

  final List<ConversationMessageDto> messages;
  final ConversationStatus status;
  final bool isConnected;
  final List<TerminalEntry> terminalEntries;
  final List<WorkspaceFileNode> fileTree;
  final bool hasLoadedWorkspaceTree;
  final bool workspaceTreeOnly;
  final String? workspacePreviewUnavailableReason;
  final List<WorkspaceFileChange> fileChanges;
  final String? selectedFilePath;
  final WorkspaceFileContent? selectedFileContent;
  final bool isLoadingWorkspace;
  final String? error;

  /// 当前沙箱启动准备阶段（null 表示未在准备中或已完成）
  final PreparationPhase? preparationPhase;

  /// 准备开始时间，用于计算总耗时
  final DateTime? preparationStartTime;

  /// 是否复用了已有沙箱
  final bool sandboxReused;

  /// 准备过程中的错误信息
  final String? preparationError;

  /// 失败时标记哪一步出了问题
  final PreparationPhase? preparationFailedPhase;

  bool get isBusy =>
      status == ConversationStatus.connecting ||
      status == ConversationStatus.executing;

  ConversationToolCallDto? get latestToolCall {
    for (final message in messages.reversed) {
      if (message.toolCalls.isNotEmpty) {
        return message.toolCalls.last;
      }
    }
    return null;
  }

  String? get latestTerminalLine {
    if (terminalEntries.isEmpty) {
      return null;
    }

    final output = terminalEntries.last.output.trim();
    if (output.isEmpty) {
      return null;
    }

    final lines = output.split('\n').where((line) => line.trim().isNotEmpty);
    return lines.isEmpty ? null : lines.last;
  }

  ConversationState copyWith({
    List<ConversationMessageDto>? messages,
    ConversationStatus? status,
    bool? isConnected,
    List<TerminalEntry>? terminalEntries,
    List<WorkspaceFileNode>? fileTree,
    bool? hasLoadedWorkspaceTree,
    bool? workspaceTreeOnly,
    String? workspacePreviewUnavailableReason,
    bool clearWorkspacePreviewUnavailableReason = false,
    List<WorkspaceFileChange>? fileChanges,
    String? selectedFilePath,
    bool clearSelectedFilePath = false,
    WorkspaceFileContent? selectedFileContent,
    bool clearSelectedFileContent = false,
    bool? isLoadingWorkspace,
    String? error,
    bool clearError = false,
    PreparationPhase? preparationPhase,
    bool clearPreparationPhase = false,
    DateTime? preparationStartTime,
    bool clearPreparationStartTime = false,
    bool? sandboxReused,
    String? preparationError,
    bool clearPreparationError = false,
    PreparationPhase? preparationFailedPhase,
    bool clearPreparationFailedPhase = false,
  }) {
    return ConversationState(
      messages: messages ?? this.messages,
      status: status ?? this.status,
      isConnected: isConnected ?? this.isConnected,
      terminalEntries: terminalEntries ?? this.terminalEntries,
      fileTree: fileTree ?? this.fileTree,
      hasLoadedWorkspaceTree:
          hasLoadedWorkspaceTree ?? this.hasLoadedWorkspaceTree,
      workspaceTreeOnly: workspaceTreeOnly ?? this.workspaceTreeOnly,
      workspacePreviewUnavailableReason: clearWorkspacePreviewUnavailableReason
          ? null
          : workspacePreviewUnavailableReason ??
                this.workspacePreviewUnavailableReason,
      fileChanges: fileChanges ?? this.fileChanges,
      selectedFilePath: clearSelectedFilePath
          ? null
          : selectedFilePath ?? this.selectedFilePath,
      selectedFileContent: clearSelectedFileContent
          ? null
          : selectedFileContent ?? this.selectedFileContent,
      isLoadingWorkspace: isLoadingWorkspace ?? this.isLoadingWorkspace,
      error: clearError ? null : error ?? this.error,
      preparationPhase: clearPreparationPhase
          ? null
          : preparationPhase ?? this.preparationPhase,
      preparationStartTime: clearPreparationStartTime
          ? null
          : preparationStartTime ?? this.preparationStartTime,
      sandboxReused: sandboxReused ?? this.sandboxReused,
      preparationError: clearPreparationError
          ? null
          : preparationError ?? this.preparationError,
      preparationFailedPhase: clearPreparationFailedPhase
          ? null
          : preparationFailedPhase ?? this.preparationFailedPhase,
    );
  }
}
