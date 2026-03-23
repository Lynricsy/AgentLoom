import 'package:freezed_annotation/freezed_annotation.dart';

part 'skill_dto.freezed.dart';
part 'skill_dto.g.dart';

/// 技能 DTO — 对应服务端 SkillResponseDto
@freezed
abstract class SkillDto with _$SkillDto {
  const factory SkillDto({
    required String id,
    @JsonKey(name: 'tenant_id') required String tenantId,
    required String name,
    required String slug,
    String? description,
    String? content,
    Map<String, dynamic>? frontmatter,
    @JsonKey(name: 'is_builtin') required bool isBuiltin,
    required String status,
    @JsonKey(name: 'file_count') required int fileCount,
    @JsonKey(name: 'total_size_bytes') required int totalSizeBytes,
    required int version,
    @JsonKey(name: 'created_by') String? createdBy,
    @JsonKey(name: 'updated_by') String? updatedBy,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
  }) = _SkillDto;

  factory SkillDto.fromJson(Map<String, dynamic> json) =>
      _$SkillDtoFromJson(json);
}
