import 'package:freezed_annotation/freezed_annotation.dart';

part 'skill_query_params.freezed.dart';
part 'skill_query_params.g.dart';

/// 技能列表查询参数 — 对应服务端 SkillQueryDto
@freezed
abstract class SkillQueryParams with _$SkillQueryParams {
  const factory SkillQueryParams({
    @Default(1) int page,
    @JsonKey(name: 'page_size') @Default(20) int pageSize,
    String? search,
    String? status,
    @JsonKey(name: 'is_builtin') bool? isBuiltin,
  }) = _SkillQueryParams;

  factory SkillQueryParams.fromJson(Map<String, dynamic> json) =>
      _$SkillQueryParamsFromJson(json);
}
