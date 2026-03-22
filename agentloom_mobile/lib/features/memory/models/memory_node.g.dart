// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_node.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryNodeDto _$MemoryNodeDtoFromJson(Map<String, dynamic> json) =>
    _MemoryNodeDto(
      id: json['id'] as String,
      instanceId: json['instance_id'] as String,
      content: json['content'] as String,
      disclosureLevel: json['disclosure_level'] as String?,
      triggerKeywords:
          (json['trigger_keywords'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
    );

Map<String, dynamic> _$MemoryNodeDtoToJson(_MemoryNodeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'instance_id': instance.instanceId,
      'content': instance.content,
      'disclosure_level': instance.disclosureLevel,
      'trigger_keywords': instance.triggerKeywords,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
    };
