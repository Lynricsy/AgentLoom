// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workflow_definition_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_WorkflowDefinitionDto _$WorkflowDefinitionDtoFromJson(
  Map<String, dynamic> json,
) => _WorkflowDefinitionDto(
  id: json['id'] as String,
  name: json['name'] as String,
  slug: json['slug'] as String,
  description: json['description'] as String?,
  status: json['status'] as String,
  version: (json['version'] as num).toInt(),
  metadata: json['metadata'] as Map<String, dynamic>?,
  createdBy: json['created_by'] as String?,
  updatedBy: json['updated_by'] as String?,
  createdAt: json['created_at'] as String,
  updatedAt: json['updated_at'] as String,
);

Map<String, dynamic> _$WorkflowDefinitionDtoToJson(
  _WorkflowDefinitionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'slug': instance.slug,
  'description': instance.description,
  'status': instance.status,
  'version': instance.version,
  'metadata': instance.metadata,
  'created_by': instance.createdBy,
  'updated_by': instance.updatedBy,
  'created_at': instance.createdAt,
  'updated_at': instance.updatedAt,
};
