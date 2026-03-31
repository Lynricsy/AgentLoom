import 'package:freezed_annotation/freezed_annotation.dart';

part 'memory_audit_entry.freezed.dart';
part 'memory_audit_entry.g.dart';

/// Memory 审计日志条目 DTO
@freezed
abstract class MemoryAuditEntryDto with _$MemoryAuditEntryDto {
  const factory MemoryAuditEntryDto({
    required String id,
    required String action,
    required String userId,
    String? targetNodeId,
    String? targetVersionId,
    Map<String, dynamic>? metadata,
    required DateTime createdAt,
  }) = _MemoryAuditEntryDto;

  factory MemoryAuditEntryDto.fromJson(Map<String, dynamic> json) =>
      _$MemoryAuditEntryDtoFromJson(json);
}
