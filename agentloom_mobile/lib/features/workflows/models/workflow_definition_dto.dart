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
    required String status,
    required int version,
    Map<String, dynamic>? metadata,
    @JsonKey(name: 'created_by') String? createdBy,
    @JsonKey(name: 'updated_by') String? updatedBy,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
  }) = _WorkflowDefinitionDto;

  factory WorkflowDefinitionDto.fromJson(Map<String, dynamic> json) =>
      _$WorkflowDefinitionDtoFromJson(json);
}
