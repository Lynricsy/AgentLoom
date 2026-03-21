// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ConversationMessageDto _$ConversationMessageDtoFromJson(
  Map<String, dynamic> json,
) => _ConversationMessageDto(
  id: json['id'] as String,
  conversationId: json['conversation_id'] as String,
  role: $enumDecode(_$MessageRoleEnumMap, json['role']),
  type:
      $enumDecodeNullable(_$MessageTypeEnumMap, json['type']) ??
      MessageType.text,
  content: json['content'] as String,
  toolName: json['tool_name'] as String?,
  toolInput: json['tool_input'] as Map<String, dynamic>?,
  toolOutput: json['tool_output'] as String?,
  attachments: (json['attachments'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  createdAt: json['created_at'] as String,
);

Map<String, dynamic> _$ConversationMessageDtoToJson(
  _ConversationMessageDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'conversation_id': instance.conversationId,
  'role': _$MessageRoleEnumMap[instance.role]!,
  'type': _$MessageTypeEnumMap[instance.type]!,
  'content': instance.content,
  'tool_name': instance.toolName,
  'tool_input': instance.toolInput,
  'tool_output': instance.toolOutput,
  'attachments': instance.attachments,
  'created_at': instance.createdAt,
};

const _$MessageRoleEnumMap = {
  MessageRole.user: 'user',
  MessageRole.agent: 'agent',
  MessageRole.system: 'system',
};

const _$MessageTypeEnumMap = {
  MessageType.text: 'text',
  MessageType.thinking: 'thinking',
  MessageType.toolCall: 'tool_call',
  MessageType.toolResult: 'tool_result',
  MessageType.image: 'image',
};

_TerminalOutputData _$TerminalOutputDataFromJson(Map<String, dynamic> json) =>
    _TerminalOutputData(
      sessionId: json['session_id'] as String?,
      output: json['output'] as String,
      isError: json['is_error'] as bool? ?? false,
    );

Map<String, dynamic> _$TerminalOutputDataToJson(_TerminalOutputData instance) =>
    <String, dynamic>{
      'session_id': instance.sessionId,
      'output': instance.output,
      'is_error': instance.isError,
    };

_ToolCallEventData _$ToolCallEventDataFromJson(Map<String, dynamic> json) =>
    _ToolCallEventData(
      toolName: json['tool_name'] as String,
      toolInput: json['tool_input'] as Map<String, dynamic>?,
      status: json['status'] as String?,
    );

Map<String, dynamic> _$ToolCallEventDataToJson(_ToolCallEventData instance) =>
    <String, dynamic>{
      'tool_name': instance.toolName,
      'tool_input': instance.toolInput,
      'status': instance.status,
    };
