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
  icon: json['icon'] as String?,
  status: json['status'] as String,
  version: (json['version'] as num).toInt(),
  publishedReleaseNumber: (json['publishedReleaseNumber'] as num?)?.toInt(),
  metadata: json['metadata'] as Map<String, dynamic>?,
  createdBy: json['createdBy'] as String?,
  updatedBy: json['updatedBy'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  resourceSourceKind: json['resourceSourceKind'] as String? ?? 'manual',
);

Map<String, dynamic> _$WorkflowDefinitionDtoToJson(
  _WorkflowDefinitionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'slug': instance.slug,
  'description': instance.description,
  'icon': instance.icon,
  'status': instance.status,
  'version': instance.version,
  'publishedReleaseNumber': instance.publishedReleaseNumber,
  'metadata': instance.metadata,
  'createdBy': instance.createdBy,
  'updatedBy': instance.updatedBy,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'resourceSourceKind': instance.resourceSourceKind,
};
