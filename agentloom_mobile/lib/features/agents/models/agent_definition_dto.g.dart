// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'agent_definition_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AgentDefinitionDto _$AgentDefinitionDtoFromJson(Map<String, dynamic> json) =>
    _AgentDefinitionDto(
      id: json['id'] as String,
      organizationId: json['organization_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      status: json['status'] as String,
      systemPrompt: json['system_prompt'] as String?,
      modelId: json['model_id'] as String?,
      autonomyMode: json['autonomy_mode'] as String?,
      maxIterations: (json['max_iterations'] as num?)?.toInt(),
      timeoutSeconds: (json['timeout_seconds'] as num?)?.toInt(),
      version: (json['version'] as num?)?.toInt(),
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
      createdBy: json['created_by'] as String?,
    );

Map<String, dynamic> _$AgentDefinitionDtoToJson(_AgentDefinitionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'organization_id': instance.organizationId,
      'name': instance.name,
      'description': instance.description,
      'status': instance.status,
      'system_prompt': instance.systemPrompt,
      'model_id': instance.modelId,
      'autonomy_mode': instance.autonomyMode,
      'max_iterations': instance.maxIterations,
      'timeout_seconds': instance.timeoutSeconds,
      'version': instance.version,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
      'created_by': instance.createdBy,
    };
