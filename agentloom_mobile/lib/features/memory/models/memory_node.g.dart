// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_node.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryNodeDto _$MemoryNodeDtoFromJson(Map<String, dynamic> json) =>
    _MemoryNodeDto(
      id: json['id'] as String,
      instanceId: json['instanceId'] as String,
      contentType: json['contentType'] as String,
      metadata: json['metadata'] as Map<String, dynamic>?,
      disclosureLevel: (json['disclosureLevel'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] as String,
    );

Map<String, dynamic> _$MemoryNodeDtoToJson(_MemoryNodeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'instanceId': instance.instanceId,
      'contentType': instance.contentType,
      'metadata': instance.metadata,
      'disclosureLevel': instance.disclosureLevel,
      'createdAt': instance.createdAt,
    };
