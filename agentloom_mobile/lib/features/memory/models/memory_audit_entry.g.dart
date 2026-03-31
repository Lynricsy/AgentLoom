// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'memory_audit_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MemoryAuditEntryDto _$MemoryAuditEntryDtoFromJson(Map<String, dynamic> json) =>
    _MemoryAuditEntryDto(
      id: json['id'] as String,
      action: json['action'] as String,
      userId: json['userId'] as String,
      targetNodeId: json['targetNodeId'] as String?,
      targetVersionId: json['targetVersionId'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$MemoryAuditEntryDtoToJson(
  _MemoryAuditEntryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'action': instance.action,
  'userId': instance.userId,
  'targetNodeId': instance.targetNodeId,
  'targetVersionId': instance.targetVersionId,
  'metadata': instance.metadata,
  'createdAt': instance.createdAt.toIso8601String(),
};
