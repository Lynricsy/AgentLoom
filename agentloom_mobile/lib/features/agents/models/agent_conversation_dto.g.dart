// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'agent_conversation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AgentConversationDto _$AgentConversationDtoFromJson(
  Map<String, dynamic> json,
) => _AgentConversationDto(
  id: json['id'] as String,
  agentDefinitionId: json['agent_definition_id'] as String,
  organizationId: json['organization_id'] as String,
  status: json['status'] as String,
  title: json['title'] as String?,
  createdAt: json['created_at'] as String,
  updatedAt: json['updated_at'] as String,
  createdBy: json['created_by'] as String?,
);

Map<String, dynamic> _$AgentConversationDtoToJson(
  _AgentConversationDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'agent_definition_id': instance.agentDefinitionId,
  'organization_id': instance.organizationId,
  'status': instance.status,
  'title': instance.title,
  'created_at': instance.createdAt,
  'updated_at': instance.updatedAt,
  'created_by': instance.createdBy,
};
