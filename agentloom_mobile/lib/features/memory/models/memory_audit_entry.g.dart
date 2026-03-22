// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_audit_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryAuditEntryDto _$MemoryAuditEntryDtoFromJson(Map<String, dynamic> json) =>
    _MemoryAuditEntryDto(
      id: json['id'] as String,
      action: json['action'] as String,
      userId: json['user_id'] as String,
      targetNodeId: json['target_node_id'] as String?,
      targetVersionId: json['target_version_id'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );

Map<String, dynamic> _$MemoryAuditEntryDtoToJson(
  _MemoryAuditEntryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'action': instance.action,
  'user_id': instance.userId,
  'target_node_id': instance.targetNodeId,
  'target_version_id': instance.targetVersionId,
  'metadata': instance.metadata,
  'created_at': instance.createdAt.toIso8601String(),
};
