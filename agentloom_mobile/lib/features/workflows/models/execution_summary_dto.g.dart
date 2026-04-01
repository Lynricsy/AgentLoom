// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionSummaryDto _$ExecutionSummaryDtoFromJson(Map<String, dynamic> json) =>
    _ExecutionSummaryDto(
      id: json['id'] as String,
      workflowId: json['workflow_id'] as String,
      status: json['status'] as String,
      triggerType: json['trigger_type'] as String?,
      totalSteps: (json['total_steps'] as num?)?.toInt(),
      completedSteps: (json['completed_steps'] as num?)?.toInt(),
      startedAt: json['started_at'] as String?,
      completedAt: json['completed_at'] as String?,
      failedAt: json['failed_at'] as String?,
      definitionSnapshot: json['definition_snapshot'] as Map<String, dynamic>?,
      errorMessage: json['error_message'],
      steps: (json['steps'] as List<dynamic>?)
          ?.map((e) => ExecutionStepDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
    );

Map<String, dynamic> _$ExecutionSummaryDtoToJson(
  _ExecutionSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'workflow_id': instance.workflowId,
  'status': instance.status,
  'trigger_type': instance.triggerType,
  'total_steps': instance.totalSteps,
  'completed_steps': instance.completedSteps,
  'started_at': instance.startedAt,
  'completed_at': instance.completedAt,
  'failed_at': instance.failedAt,
  'definition_snapshot': instance.definitionSnapshot,
  'error_message': instance.errorMessage,
  'steps': instance.steps?.map((e) => e.toJson()).toList(),
  'created_at': instance.createdAt,
  'updated_at': instance.updatedAt,
};
