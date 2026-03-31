// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionSummaryDto _$ExecutionSummaryDtoFromJson(Map<String, dynamic> json) =>
    _ExecutionSummaryDto(
      id: json['id'] as String,
      workflowId: json['workflowId'] as String,
      status: json['status'] as String,
      triggerType: json['triggerType'] as String?,
      totalSteps: (json['totalSteps'] as num?)?.toInt(),
      completedSteps: (json['completedSteps'] as num?)?.toInt(),
      startedAt: json['startedAt'] as String?,
      completedAt: json['completedAt'] as String?,
      failedAt: json['failedAt'] as String?,
      definitionSnapshot: json['definitionSnapshot'] as Map<String, dynamic>?,
      errorMessage: json['errorMessage'],
      steps: (json['steps'] as List<dynamic>?)
          ?.map((e) => ExecutionStepDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );

Map<String, dynamic> _$ExecutionSummaryDtoToJson(
  _ExecutionSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'workflowId': instance.workflowId,
  'status': instance.status,
  'triggerType': instance.triggerType,
  'totalSteps': instance.totalSteps,
  'completedSteps': instance.completedSteps,
  'startedAt': instance.startedAt,
  'completedAt': instance.completedAt,
  'failedAt': instance.failedAt,
  'definitionSnapshot': instance.definitionSnapshot,
  'errorMessage': instance.errorMessage,
  'steps': instance.steps?.map((e) => e.toJson()).toList(),
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};
