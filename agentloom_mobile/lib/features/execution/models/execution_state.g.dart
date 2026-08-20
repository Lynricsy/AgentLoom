// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_StepSnapshot _$StepSnapshotFromJson(Map<String, dynamic> json) =>
    _StepSnapshot(
      stepId: json['stepId'] as String,
      nodeId: json['nodeId'] as String,
      nodeName: json['nodeName'] as String?,
      nodeType: json['nodeType'] as String?,
      status: json['status'] as String,
      startedAt: json['startedAt'] as String?,
      completedAt: json['completedAt'] as String?,
      errorMessage: json['errorMessage'] as String?,
      errorDetail: json['errorDetail'] as Map<String, dynamic>?,
      checkpointData: json['checkpointData'] as Map<String, dynamic>?,
      result: json['result'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$StepSnapshotToJson(_StepSnapshot instance) =>
    <String, dynamic>{
      'stepId': instance.stepId,
      'nodeId': instance.nodeId,
      'nodeName': instance.nodeName,
      'nodeType': instance.nodeType,
      'status': instance.status,
      'startedAt': instance.startedAt,
      'completedAt': instance.completedAt,
      'errorMessage': instance.errorMessage,
      'errorDetail': instance.errorDetail,
      'checkpointData': instance.checkpointData,
      'result': instance.result,
    };

_ExecutionStateSnapshot _$ExecutionStateSnapshotFromJson(
  Map<String, dynamic> json,
) => _ExecutionStateSnapshot(
  executionId: json['executionId'] as String,
  status: json['status'] as String,
  completedSteps: (json['completedSteps'] as num?)?.toInt(),
  totalSteps: (json['totalSteps'] as num?)?.toInt(),
  steps: (json['steps'] as List<dynamic>)
      .map((e) => StepSnapshot.fromJson(e as Map<String, dynamic>))
      .toList(),
  snapshotAt: json['snapshotAt'] as String?,
  lastEventId: (json['lastEventId'] as num?)?.toInt(),
);

Map<String, dynamic> _$ExecutionStateSnapshotToJson(
  _ExecutionStateSnapshot instance,
) => <String, dynamic>{
  'executionId': instance.executionId,
  'status': instance.status,
  'completedSteps': instance.completedSteps,
  'totalSteps': instance.totalSteps,
  'steps': instance.steps.map((e) => e.toJson()).toList(),
  'snapshotAt': instance.snapshotAt,
  'lastEventId': instance.lastEventId,
};
