// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'agent_conversation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AgentConversationDto _$AgentConversationDtoFromJson(
  Map<String, dynamic> json,
) => _AgentConversationDto(
  id: json['id'] as String,
  agentDefinitionId: json['agentDefinitionId'] as String,
  status: json['status'] as String,
  title: json['title'] as String?,
  metadata: json['metadata'] == null
      ? const <String, dynamic>{}
      : _conversationMetadataFromJson(json['metadata']),
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  createdBy: json['createdBy'] as String?,
  organizationId: json['organizationId'] as String?,
);

Map<String, dynamic> _$AgentConversationDtoToJson(
  _AgentConversationDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'agentDefinitionId': instance.agentDefinitionId,
  'status': instance.status,
  'title': instance.title,
  'metadata': instance.metadata,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'createdBy': instance.createdBy,
  'organizationId': instance.organizationId,
};
