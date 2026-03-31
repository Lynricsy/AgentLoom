import 'package:freezed_annotation/freezed_annotation.dart';

import 'execution_step_dto.dart';

part 'execution_summary_dto.freezed.dart';
part 'execution_summary_dto.g.dart';

/// 执行摘要 DTO
@freezed
abstract class ExecutionSummaryDto with _$ExecutionSummaryDto {
  const factory ExecutionSummaryDto({
    required String id,
    required String workflowId,
    required String status,
    String? triggerType,
    int? totalSteps,
    int? completedSteps,
    String? startedAt,
    String? completedAt,
    String? failedAt,
    Map<String, dynamic>? definitionSnapshot,
    Object? errorMessage,
    List<ExecutionStepDto>? steps,
    @JsonKey(includeFromJson: false, includeToJson: false) String? workflowName,
    required String createdAt,
    required String updatedAt,
  }) = _ExecutionSummaryDto;

  factory ExecutionSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$ExecutionSummaryDtoFromJson(json);
}
