import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../shared/utils/json_key_normalizer.dart';

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
    @Default('manual') String resourceSourceKind,
  }) = _WorkflowDefinitionDto;

  factory WorkflowDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$WorkflowDefinitionDtoFromJson(normalizeJsonMap(json));

  const WorkflowDefinitionDto._();

  bool get isShareImported => resourceSourceKind == 'share_imported';
}
