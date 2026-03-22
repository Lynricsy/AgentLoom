// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_version.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryVersionDto _$MemoryVersionDtoFromJson(Map<String, dynamic> json) =>
    _MemoryVersionDto(
      id: json['id'] as String,
      nodeId: json['node_id'] as String,
      content: json['content'] as String,
      versionNumber: (json['version_number'] as num).toInt(),
      changeType: json['change_type'] as String?,
      deprecated: json['deprecated'] as bool? ?? false,
      createdAt: json['created_at'] as String,
    );

Map<String, dynamic> _$MemoryVersionDtoToJson(_MemoryVersionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'node_id': instance.nodeId,
      'content': instance.content,
      'version_number': instance.versionNumber,
      'change_type': instance.changeType,
      'deprecated': instance.deprecated,
      'created_at': instance.createdAt,
    };
