// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_WorkspaceDto _$WorkspaceDtoFromJson(Map<String, dynamic> json) =>
    _WorkspaceDto(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      storageKey: json['storageKey'] as String,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
      status: json['status'] as String,
      config: json['config'] as Map<String, dynamic>?,
      sourceKind: json['sourceKind'] as String? ?? 'manual',
      isAutoArchived: json['isAutoArchived'] as bool? ?? false,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$WorkspaceDtoToJson(_WorkspaceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'storageKey': instance.storageKey,
      'sizeBytes': instance.sizeBytes,
      'status': instance.status,
      'config': instance.config,
      'sourceKind': instance.sourceKind,
      'isAutoArchived': instance.isAutoArchived,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };
