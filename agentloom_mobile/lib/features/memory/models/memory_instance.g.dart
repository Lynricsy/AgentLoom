// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_instance.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryInstanceDto _$MemoryInstanceDtoFromJson(Map<String, dynamic> json) =>
    _MemoryInstanceDto(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      config: json['config'] as Map<String, dynamic>?,
      status: json['status'] as String,
      nodeCount: (json['nodeCount'] as num?)?.toInt() ?? 0,
      edgeCount: (json['edgeCount'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$MemoryInstanceDtoToJson(_MemoryInstanceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'config': instance.config,
      'status': instance.status,
      'nodeCount': instance.nodeCount,
      'edgeCount': instance.edgeCount,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };
