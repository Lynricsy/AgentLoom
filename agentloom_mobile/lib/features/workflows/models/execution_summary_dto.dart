import 'package:freezed_annotation/freezed_annotation.dart';

import 'execution_step_dto.dart';

part 'execution_summary_dto.freezed.dart';
part 'execution_summary_dto.g.dart';

/// 执行摘要 DTO
@freezed
abstract class ExecutionSummaryDto with _$ExecutionSummaryDto {
  const factory ExecutionSummaryDto({
    required String id,
    @JsonKey(name: 'workflow_id') required String workflowId,
    required String status,
    @JsonKey(name: 'trigger_type') String? triggerType,
    @JsonKey(name: 'total_steps') int? totalSteps,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'failed_at') String? failedAt,
    @JsonKey(name: 'definition_snapshot')
    Map<String, dynamic>? definitionSnapshot,
    @JsonKey(name: 'error_message') Object? errorMessage,
    List<ExecutionStepDto>? steps,
    @JsonKey(includeFromJson: false, includeToJson: false) String? workflowName,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'updated_at') required String updatedAt,
  }) = _ExecutionSummaryDto;

  factory ExecutionSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionSummaryDtoFromJson(json);
}
