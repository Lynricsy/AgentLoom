// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_node.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryNodeDto _$MemoryNodeDtoFromJson(Map<String, dynamic> json) =>
    _MemoryNodeDto(
      id: json['id'] as String,
      instanceId: json['instanceId'] as String,
      content: json['content'] as String,
      disclosureLevel: json['disclosureLevel'] as String?,
      triggerKeywords:
          (json['triggerKeywords'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$MemoryNodeDtoToJson(_MemoryNodeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'instanceId': instance.instanceId,
      'content': instance.content,
      'disclosureLevel': instance.disclosureLevel,
      'triggerKeywords': instance.triggerKeywords,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };
