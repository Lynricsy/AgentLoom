import 'package:freezed_annotation/freezed_annotation.dart';

import 'json_compat.dart';

part 'workflow_definition_dto.freezed.dart';
part 'workflow_definition_dto.g.dart';

/// 工作流定义 DTO
@freezed
abstract class WorkflowDefinitionDto with _$WorkflowDefinitionDto {
  const factory WorkflowDefinitionDto({
    required String id,
    required String name,
    required String slug,
    String? description,
    String? icon,
    required String status,
    required int version,
    int? publishedReleaseNumber,
    Map<String, dynamic>? metadata,
    String? createdBy,
    String? updatedBy,
    required String createdAt,
    required String updatedAt,
  }) = _WorkflowDefinitionDto;

  factory WorkflowDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$WorkflowDefinitionDtoFromJson(_normalizeWorkflowDefinitionJson(json));
}

Map<String, dynamic> _normalizeWorkflowDefinitionJson(
  Map<String, dynamic> json,
) {
  final normalized = normalizeJsonAliases(
    json,
    aliases: const {
      'publishedReleaseNumber': ['published_release_number'],
      'createdBy': ['created_by'],
      'updatedBy': ['updated_by'],
      'createdAt': ['created_at'],
      'updatedAt': ['updated_at'],
    },
  );

  final metadata = asStringKeyedMap(normalized['metadata']);
  if (metadata != null) {
    normalized['metadata'] = metadata;
  }

  return normalized;
}
