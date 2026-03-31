// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_version.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryVersionDto _$MemoryVersionDtoFromJson(Map<String, dynamic> json) =>
    _MemoryVersionDto(
      id: json['id'] as String,
      nodeId: json['nodeId'] as String,
      content: json['content'] as String,
      versionNumber: (json['versionNumber'] as num).toInt(),
      changeType: json['changeType'] as String?,
      deprecated: json['deprecated'] as bool? ?? false,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$MemoryVersionDtoToJson(_MemoryVersionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nodeId': instance.nodeId,
      'content': instance.content,
      'versionNumber': instance.versionNumber,
      'changeType': instance.changeType,
      'deprecated': instance.deprecated,
      'createdAt': instance.createdAt,
    };
