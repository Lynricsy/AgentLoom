import 'package:freezed_annotation/freezed_annotation.dart';

part 'skill_dto.freezed.dart';
part 'skill_dto.g.dart';

/// 技能 DTO — 对应服务端 SkillResponseDto
@freezed
abstract class SkillDto with _$SkillDto {
  const factory SkillDto({
    required String id,
    required String tenantId,
    required String name,
    required String slug,
    String? description,
    String? content,
    Map<String, dynamic>? frontmatter,
    required bool isBuiltin,
    required String status,
    required int fileCount,
    required int totalSizeBytes,
    required int version,
    String? createdBy,
    String? updatedBy,
    required String createdAt,
    required String updatedAt,
    @Default('manual') String sourceKind,
  }) = _SkillDto;

  factory SkillDto.fromJson(Map<String, dynamic> json) =>
      _$SkillDtoFromJson(_normalizeSkillJson(json));
}

Map<String, dynamic> _normalizeSkillJson(Map<String, dynamic> json) {
  final normalized = Map<String, dynamic>.from(json);

  const aliases = {
    'tenantId': 'tenant_id',
    'isBuiltin': 'is_builtin',
    'fileCount': 'file_count',
    'totalSizeBytes': 'total_size_bytes',
    'createdBy': 'created_by',
    'updatedBy': 'updated_by',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'sourceKind': 'source_kind',
  };

  for (final entry in aliases.entries) {
    normalized.putIfAbsent(entry.key, () => json[entry.value]);
  }

  return normalized;
}
