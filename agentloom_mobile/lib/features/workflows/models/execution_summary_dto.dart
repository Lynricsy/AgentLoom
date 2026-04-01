// ignore_for_file: invalid_annotation_target

import 'package:freezed_annotation/freezed_annotation.dart';

import 'execution_step_dto.dart';
import 'json_compat.dart';

part 'execution_summary_dto.freezed.dart';
part 'execution_summary_dto.g.dart';

/// 执行摘要 DTO
@freezed
abstract class ExecutionSummaryDto with _$ExecutionSummaryDto {
  @JsonSerializable(fieldRename: FieldRename.snake)
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
      _$ExecutionSummaryDtoFromJson(_normalizeExecutionSummaryJson(json));
}

Map<String, dynamic> _normalizeExecutionSummaryJson(Map<String, dynamic> json) {
  final normalized = normalizeJsonAliases(
    json,
    aliases: const {
      'workflow_id': ['workflowId', 'workflowDefinitionId'],
      'trigger_type': ['triggerType'],
      'total_steps': ['totalSteps'],
      'completed_steps': ['completedSteps'],
      'started_at': ['startedAt'],
      'completed_at': ['completedAt'],
      'failed_at': ['failedAt'],
      'definition_snapshot': ['definitionSnapshot'],
      'error_message': ['errorMessage'],
      'created_at': ['createdAt'],
      'updated_at': ['updatedAt'],
    },
    transforms: {
      'definition_snapshot': (value) => asStringKeyedMap(value) ?? value,
    },
  );

  final steps = normalizeJsonMapList(
    normalized['steps'],
    normalizeExecutionStepJson,
  );
  if (steps != null) {
    normalized['steps'] = steps;
  }

  return normalized;
}
