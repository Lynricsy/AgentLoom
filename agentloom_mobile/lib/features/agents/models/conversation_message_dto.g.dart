// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ConversationToolTransitionDto _$ConversationToolTransitionDtoFromJson(
  Map<String, dynamic> json,
) => _ConversationToolTransitionDto(
  from: _nullableToolStatusFromJson(json['from'] as String?),
  to: _toolStatusFromJson(json['to'] as String?),
  timestamp: json['timestamp'] as String,
  source: json['source'] as String,
);

Map<String, dynamic> _$ConversationToolTransitionDtoToJson(
  _ConversationToolTransitionDto instance,
) => <String, dynamic>{
  'from': _nullableToolStatusToJson(instance.from),
  'to': _toolStatusToJson(instance.to),
  'timestamp': instance.timestamp,
  'source': instance.source,
};

_ConversationToolPermissionRequestDto
_$ConversationToolPermissionRequestDtoFromJson(Map<String, dynamic> json) =>
    _ConversationToolPermissionRequestDto(
      description: json['description'] as String?,
      resourcePaths: json['resourcePaths'] == null
          ? const <String>[]
          : _stringListFromJson(json['resourcePaths']),
      domain: json['domain'] as String?,
      category: json['category'] as String?,
      riskLevel: json['riskLevel'] as String?,
      sourceLabel: json['sourceLabel'] as String?,
      targetType: json['targetType'] as String?,
      targetLabel: json['targetLabel'] as String?,
      approveEffect: json['approveEffect'] as String?,
      denyEffect: json['denyEffect'] as String?,
      diffPreview: _nullableMapFromJson(json['diffPreview']),
      rememberable: json['rememberable'] as bool?,
    );

Map<String, dynamic> _$ConversationToolPermissionRequestDtoToJson(
  _ConversationToolPermissionRequestDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'resourcePaths': instance.resourcePaths,
  'domain': instance.domain,
  'category': instance.category,
  'riskLevel': instance.riskLevel,
  'sourceLabel': instance.sourceLabel,
  'targetType': instance.targetType,
  'targetLabel': instance.targetLabel,
  'approveEffect': instance.approveEffect,
  'denyEffect': instance.denyEffect,
  'diffPreview': instance.diffPreview,
  'rememberable': instance.rememberable,
};

_ConversationToolCallDto _$ConversationToolCallDtoFromJson(
  Map<String, dynamic> json,
) => _ConversationToolCallDto(
  id: json['id'] as String,
  tool: json['tool'] as String,
  args: json['args'],
  status: _toolStatusFromJson(json['status'] as String?),
  result: json['result'],
  error: json['error'] as String?,
  transitions: json['transitions'] == null
      ? const <ConversationToolTransitionDto>[]
      : _transitionsFromJson(json['transitions']),
  permissionRequest: _permissionRequestFromJson(json['permissionRequest']),
);

Map<String, dynamic> _$ConversationToolCallDtoToJson(
  _ConversationToolCallDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'tool': instance.tool,
  'args': instance.args,
  'status': _toolStatusToJson(instance.status),
  'result': instance.result,
  'error': instance.error,
  'transitions': instance.transitions.map((e) => e.toJson()).toList(),
  'permissionRequest': instance.permissionRequest?.toJson(),
};

_ConversationToolResultDto _$ConversationToolResultDtoFromJson(
  Map<String, dynamic> json,
) => _ConversationToolResultDto(
  toolCallId: json['toolCallId'] as String?,
  tool: json['tool'] as String?,
  status: _nullableToolStatusFromJson(json['status'] as String?),
  result: json['result'],
  error: json['error'] as String?,
);

Map<String, dynamic> _$ConversationToolResultDtoToJson(
  _ConversationToolResultDto instance,
) => <String, dynamic>{
  'toolCallId': instance.toolCallId,
  'tool': instance.tool,
  'status': _nullableToolStatusToJson(instance.status),
  'result': instance.result,
  'error': instance.error,
};

_ConversationMessageDto _$ConversationMessageDtoFromJson(
  Map<String, dynamic> json,
) => _ConversationMessageDto(
  id: json['id'] as String,
  conversationId: json['conversationId'] as String,
  role: _messageRoleFromJson(json['role'] as String?),
  content: json['content'] as String,
  toolCalls: json['toolCalls'] == null
      ? const <ConversationToolCallDto>[]
      : _toolCallsFromJson(json['toolCalls']),
  toolResults: json['toolResults'] == null
      ? const <ConversationToolResultDto>[]
      : _toolResultsFromJson(json['toolResults']),
  metadata: json['metadata'] == null
      ? const <String, dynamic>{}
      : _mapFromJson(json['metadata']),
  createdAt: json['createdAt'] as String,
);

Map<String, dynamic> _$ConversationMessageDtoToJson(
  _ConversationMessageDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'conversationId': instance.conversationId,
  'role': _messageRoleToJson(instance.role),
  'content': instance.content,
  'toolCalls': instance.toolCalls.map((e) => e.toJson()).toList(),
  'toolResults': instance.toolResults.map((e) => e.toJson()).toList(),
  'metadata': instance.metadata,
  'createdAt': instance.createdAt,
};
