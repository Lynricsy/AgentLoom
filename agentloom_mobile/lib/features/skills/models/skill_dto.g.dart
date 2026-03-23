// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'skill_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_SkillDto _$SkillDtoFromJson(Map<String, dynamic> json) => _SkillDto(
  id: json['id'] as String,
  tenantId: json['tenant_id'] as String,
  name: json['name'] as String,
  slug: json['slug'] as String,
  description: json['description'] as String?,
  content: json['content'] as String?,
  frontmatter: json['frontmatter'] as Map<String, dynamic>?,
  isBuiltin: json['is_builtin'] as bool,
  status: json['status'] as String,
  fileCount: (json['file_count'] as num).toInt(),
  totalSizeBytes: (json['total_size_bytes'] as num).toInt(),
  version: (json['version'] as num).toInt(),
  createdBy: json['created_by'] as String?,
  updatedBy: json['updated_by'] as String?,
  createdAt: json['created_at'] as String,
  updatedAt: json['updated_at'] as String,
);

Map<String, dynamic> _$SkillDtoToJson(_SkillDto instance) => <String, dynamic>{
  'id': instance.id,
  'tenant_id': instance.tenantId,
  'name': instance.name,
  'slug': instance.slug,
  'description': instance.description,
  'content': instance.content,
  'frontmatter': instance.frontmatter,
  'is_builtin': instance.isBuiltin,
  'status': instance.status,
  'file_count': instance.fileCount,
  'total_size_bytes': instance.totalSizeBytes,
  'version': instance.version,
  'created_by': instance.createdBy,
  'updated_by': instance.updatedBy,
  'created_at': instance.createdAt,
  'updated_at': instance.updatedAt,
};
