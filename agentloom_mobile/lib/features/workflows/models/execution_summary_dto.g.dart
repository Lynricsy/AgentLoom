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
  'created_at': instance.createdAt,
  'updated_at': instance.updatedAt,
};
