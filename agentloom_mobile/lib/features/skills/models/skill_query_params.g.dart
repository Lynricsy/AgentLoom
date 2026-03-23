// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'skill_query_params.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SkillQueryParams _$SkillQueryParamsFromJson(Map<String, dynamic> json) =>
    _SkillQueryParams(
      page: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['page_size'] as num?)?.toInt() ?? 20,
      search: json['search'] as String?,
      status: json['status'] as String?,
      isBuiltin: json['is_builtin'] as bool?,
    );

Map<String, dynamic> _$SkillQueryParamsToJson(_SkillQueryParams instance) =>
    <String, dynamic>{
      'page': instance.page,
      'page_size': instance.pageSize,
      'search': instance.search,
      'status': instance.status,
      'is_builtin': instance.isBuiltin,
    };
