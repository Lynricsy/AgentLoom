import 'package:freezed_annotation/freezed_annotation.dart';

part 'skill_review_dto.freezed.dart';
part 'skill_review_dto.g.dart';

/// Skill 评价 DTO
@freezed
abstract class SkillReviewDto with _$SkillReviewDto {
  const factory SkillReviewDto({
    required String id,
    required int rating,
    String? content,
    @JsonKey(name: 'created_at') String? createdAt,
  }) = _SkillReviewDto;

  factory SkillReviewDto.fromJson(Map<String, dynamic> json) =>
      _$SkillReviewDtoFromJson(json);
}

/// 安装响应 DTO
@freezed
abstract class SkillInstallResponse with _$SkillInstallResponse {
  const factory SkillInstallResponse({
    @JsonKey(name: 'plugin_db_id') String? pluginDbId,
    @JsonKey(name: 'plugin_id') String? pluginId,
    String? name,
    String? message,
  }) = _SkillInstallResponse;

  factory SkillInstallResponse.fromJson(Map<String, dynamic> json) =>
      _$SkillInstallResponseFromJson(json);
}
