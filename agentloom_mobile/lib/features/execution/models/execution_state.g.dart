// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_StepSnapshot _$StepSnapshotFromJson(Map<String, dynamic> json) =>
    _StepSnapshot(
      stepId: json['step_id'] as String,
      nodeId: json['node_id'] as String,
      nodeName: json['node_name'] as String?,
      nodeType: json['node_type'] as String?,
      status: json['status'] as String,
      startedAt: json['started_at'] as String?,
      completedAt: json['completed_at'] as String?,
      errorMessage: json['error_message'] as String?,
      errorDetail: json['error_detail'] as Map<String, dynamic>?,
      checkpointData: json['checkpoint_data'] as Map<String, dynamic>?,
      result: json['result'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$StepSnapshotToJson(_StepSnapshot instance) =>
    <String, dynamic>{
      'step_id': instance.stepId,
      'node_id': instance.nodeId,
      'node_name': instance.nodeName,
      'node_type': instance.nodeType,
      'status': instance.status,
      'started_at': instance.startedAt,
      'completed_at': instance.completedAt,
      'error_message': instance.errorMessage,
      'error_detail': instance.errorDetail,
      'checkpoint_data': instance.checkpointData,
      'result': instance.result,
    };

_ExecutionStateSnapshot _$ExecutionStateSnapshotFromJson(
  Map<String, dynamic> json,
) => _ExecutionStateSnapshot(
  executionId: json['execution_id'] as String,
  status: json['status'] as String,
  completedSteps: (json['completed_steps'] as num?)?.toInt(),
  totalSteps: (json['total_steps'] as num?)?.toInt(),
  steps: (json['steps'] as List<dynamic>)
      .map((e) => StepSnapshot.fromJson(e as Map<String, dynamic>))
      .toList(),
  snapshotAt: json['snapshot_at'] as String?,
  lastEventId: (json['last_event_id'] as num?)?.toInt(),
);

Map<String, dynamic> _$ExecutionStateSnapshotToJson(
  _ExecutionStateSnapshot instance,
) => <String, dynamic>{
  'execution_id': instance.executionId,
  'status': instance.status,
  'completed_steps': instance.completedSteps,
  'total_steps': instance.totalSteps,
  'steps': instance.steps.map((e) => e.toJson()).toList(),
  'snapshot_at': instance.snapshotAt,
  'last_event_id': instance.lastEventId,
};
