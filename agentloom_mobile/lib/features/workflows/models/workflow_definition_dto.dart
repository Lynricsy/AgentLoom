import 'package:freezed_annotation/freezed_annotation.dart';

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
      _$WorkflowDefinitionDtoFromJson(json);
}
