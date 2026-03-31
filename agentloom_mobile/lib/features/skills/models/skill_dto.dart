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
  }) = _SkillDto;

  factory SkillDto.fromJson(Map<String, dynamic> json) =>
      _$SkillDtoFromJson(json);
}
