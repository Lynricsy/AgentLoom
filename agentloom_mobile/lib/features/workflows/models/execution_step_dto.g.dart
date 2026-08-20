// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionStepDto _$ExecutionStepDtoFromJson(Map<String, dynamic> json) =>
    _ExecutionStepDto(
      id: json['id'] as String,
      executionId: json['executionId'] as String?,
      nodeId: json['nodeId'] as String,
      stepOrder: (json['stepOrder'] as num?)?.toInt(),
      status: json['status'] as String,
      nodeType: json['nodeType'] as String?,
      nodeData: json['nodeData'] as Map<String, dynamic>?,
      result: json['result'] as Map<String, dynamic>?,
      checkpointData: json['checkpointData'] as Map<String, dynamic>?,
      errorMessage: json['errorMessage'],
      startedAt: json['startedAt'] as String?,
      completedAt: json['completedAt'] as String?,
      createdAt: json['createdAt'] as String?,
      updatedAt: json['updatedAt'] as String?,
    );

Map<String, dynamic> _$ExecutionStepDtoToJson(_ExecutionStepDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'executionId': instance.executionId,
      'nodeId': instance.nodeId,
      'stepOrder': instance.stepOrder,
      'status': instance.status,
      'nodeType': instance.nodeType,
      'nodeData': instance.nodeData,
      'result': instance.result,
      'checkpointData': instance.checkpointData,
      'errorMessage': instance.errorMessage,
      'startedAt': instance.startedAt,
      'completedAt': instance.completedAt,
      'createdAt': instance.createdAt,
      'updatedAt': instance.updatedAt,
    };
