import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_audit_entry.freezed.dart';
part 'memory_audit_entry.g.dart';

/// Memory 审计日志条目 DTO
@freezed
abstract class MemoryAuditEntryDto with _$MemoryAuditEntryDto {
  const factory MemoryAuditEntryDto({
    required String id,
    required String action,
    @JsonKey(name: 'user_id') required String userId,
    @JsonKey(name: 'target_node_id') String? targetNodeId,
    @JsonKey(name: 'target_version_id') String? targetVersionId,
    Map<String, dynamic>? metadata,
    @JsonKey(name: 'created_at') required DateTime createdAt,
  }) = _MemoryAuditEntryDto;

  factory MemoryAuditEntryDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryAuditEntryDtoFromJson(json);
}
