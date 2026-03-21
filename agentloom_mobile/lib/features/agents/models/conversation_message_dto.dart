import 'package:freezed_annotation/freezed_annotation.dart';

part 'conversation_message_dto.freezed.dart';
part 'conversation_message_dto.g.dart';

/// 消息角色枚举
enum MessageRole {
  @JsonValue('user')
  user,
  @JsonValue('agent')
  agent,
  @JsonValue('system')
  system,
}

/// 消息类型枚举
enum MessageType {
  @JsonValue('text')
  text,
  @JsonValue('thinking')
  thinking,
  @JsonValue('tool_call')
  toolCall,
  @JsonValue('tool_result')
  toolResult,
  @JsonValue('image')
  image,
}

/// 对话消息 DTO
@freezed
abstract class ConversationMessageDto with _$ConversationMessageDto {
  const factory ConversationMessageDto({
    required String id,
    @JsonKey(name: 'conversation_id') required String conversationId,
    required MessageRole role,
    @Default(MessageType.text) MessageType type,
    required String content,
    @JsonKey(name: 'tool_name') String? toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    @JsonKey(name: 'tool_output') String? toolOutput,
    List<String>? attachments,
    @JsonKey(name: 'created_at') required String createdAt,
  }) = _ConversationMessageDto;

  factory ConversationMessageDto.fromJson(Map<String, dynamic> json) =>
      _$ConversationMessageDtoFromJson(json);
}

/// 终端输出数据
@freezed
abstract class TerminalOutputData with _$TerminalOutputData {
  const factory TerminalOutputData({
    @JsonKey(name: 'session_id') String? sessionId,
    required String output,
    @Default(false) @JsonKey(name: 'is_error') bool isError,
  }) = _TerminalOutputData;

  factory TerminalOutputData.fromJson(Map<String, dynamic> json) =>
      _$TerminalOutputDataFromJson(json);
}

/// 工具调用事件数据
@freezed
abstract class ToolCallEventData with _$ToolCallEventData {
  const factory ToolCallEventData({
    @JsonKey(name: 'tool_name') required String toolName,
    @JsonKey(name: 'tool_input') Map<String, dynamic>? toolInput,
    String? status,
  }) = _ToolCallEventData;

  factory ToolCallEventData.fromJson(Map<String, dynamic> json) =>
      _$ToolCallEventDataFromJson(json);
}

/// 对话状态
class ConversationState {
  final List<ConversationMessageDto> messages;
  final bool isLoading;
  final bool isAgentTyping;
  final String? streamingContent;
  final String? thinkingContent;
  final ToolCallEventData? activeToolCall;
  final List<String> terminalOutput;
  final String? latestTerminalLine;
  final bool isSandboxActive;
  final String? error;

  const ConversationState({
    this.messages = const [],
    this.isLoading = false,
    this.isAgentTyping = false,
    this.streamingContent,
    this.thinkingContent,
    this.activeToolCall,
    this.terminalOutput = const [],
    this.latestTerminalLine,
    this.isSandboxActive = false,
    this.error,
  });

  ConversationState copyWith({
    List<ConversationMessageDto>? messages,
    bool? isLoading,
    bool? isAgentTyping,
    String? streamingContent,
    String? thinkingContent,
    ToolCallEventData? activeToolCall,
    List<String>? terminalOutput,
    String? latestTerminalLine,
    bool? isSandboxActive,
    String? error,
  }) {
    return ConversationState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      isAgentTyping: isAgentTyping ?? this.isAgentTyping,
      streamingContent: streamingContent ?? this.streamingContent,
      thinkingContent: thinkingContent ?? this.thinkingContent,
      activeToolCall: activeToolCall ?? this.activeToolCall,
      terminalOutput: terminalOutput ?? this.terminalOutput,
      latestTerminalLine: latestTerminalLine ?? this.latestTerminalLine,
      isSandboxActive: isSandboxActive ?? this.isSandboxActive,
      error: error ?? this.error,
    );
  }
}
