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
      nodeCount: (json['node_count'] as num?)?.toInt() ?? 0,
      edgeCount: (json['edge_count'] as num?)?.toInt() ?? 0,
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
    );

Map<String, dynamic> _$MemoryInstanceDtoToJson(_MemoryInstanceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'config': instance.config,
      'status': instance.status,
      'node_count': instance.nodeCount,
      'edge_count': instance.edgeCount,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
    };
