// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionStepDto _$ExecutionStepDtoFromJson(Map<String, dynamic> json) =>
    _ExecutionStepDto(
      id: json['id'] as String,
      executionId: json['execution_id'] as String?,
      nodeId: json['node_id'] as String,
      stepOrder: (json['step_order'] as num?)?.toInt(),
      status: json['status'] as String,
      nodeType: json['node_type'] as String?,
      nodeData: json['node_data'] as Map<String, dynamic>?,
      result: json['result'] as Map<String, dynamic>?,
      checkpointData: json['checkpoint_data'] as Map<String, dynamic>?,
      errorMessage: json['error_message'],
      startedAt: json['started_at'] as String?,
      completedAt: json['completed_at'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );

Map<String, dynamic> _$ExecutionStepDtoToJson(_ExecutionStepDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'execution_id': instance.executionId,
      'node_id': instance.nodeId,
      'step_order': instance.stepOrder,
      'status': instance.status,
      'node_type': instance.nodeType,
      'node_data': instance.nodeData,
      'result': instance.result,
      'checkpoint_data': instance.checkpointData,
      'error_message': instance.errorMessage,
      'started_at': instance.startedAt,
      'completed_at': instance.completedAt,
      'created_at': instance.createdAt,
      'updated_at': instance.updatedAt,
    };
