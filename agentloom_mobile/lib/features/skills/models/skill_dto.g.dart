// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'skill_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SkillDto _$SkillDtoFromJson(Map<String, dynamic> json) => _SkillDto(
  id: json['id'] as String,
  tenantId: json['tenantId'] as String,
  name: json['name'] as String,
  slug: json['slug'] as String,
  description: json['description'] as String?,
  content: json['content'] as String?,
  frontmatter: json['frontmatter'] as Map<String, dynamic>?,
  isBuiltin: json['isBuiltin'] as bool,
  status: json['status'] as String,
  fileCount: (json['fileCount'] as num).toInt(),
  totalSizeBytes: (json['totalSizeBytes'] as num).toInt(),
  version: (json['version'] as num).toInt(),
  createdBy: json['createdBy'] as String?,
  updatedBy: json['updatedBy'] as String?,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
  sourceKind: json['sourceKind'] as String? ?? 'manual',
);

Map<String, dynamic> _$SkillDtoToJson(_SkillDto instance) => <String, dynamic>{
  'id': instance.id,
  'tenantId': instance.tenantId,
  'name': instance.name,
  'slug': instance.slug,
  'description': instance.description,
  'content': instance.content,
  'frontmatter': instance.frontmatter,
  'isBuiltin': instance.isBuiltin,
  'status': instance.status,
  'fileCount': instance.fileCount,
  'totalSizeBytes': instance.totalSizeBytes,
  'version': instance.version,
  'createdBy': instance.createdBy,
  'updatedBy': instance.updatedBy,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
  'sourceKind': instance.sourceKind,
};
