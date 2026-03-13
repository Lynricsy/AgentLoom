// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_event.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionEventEnvelope _$ExecutionEventEnvelopeFromJson(
  Map<String, dynamic> json,
) => _ExecutionEventEnvelope(
  eventId: (json['event_id'] as num).toInt(),
  event: json['event'] as String,
  timestamp: json['timestamp'] as String,
  executionId: json['execution_id'] as String,
  tenantId: json['tenant_id'] as String?,
  data: json['data'] as Map<String, dynamic>,
);

Map<String, dynamic> _$ExecutionEventEnvelopeToJson(
  _ExecutionEventEnvelope instance,
) => <String, dynamic>{
  'event_id': instance.eventId,
  'event': instance.event,
  'timestamp': instance.timestamp,
  'execution_id': instance.executionId,
  'tenant_id': instance.tenantId,
  'data': instance.data,
};

_ExecutionStatusChangedData _$ExecutionStatusChangedDataFromJson(
  Map<String, dynamic> json,
) => _ExecutionStatusChangedData(
  executionId: json['execution_id'] as String,
  status: json['status'] as String,
  completedSteps: (json['completed_steps'] as num?)?.toInt(),
  totalSteps: (json['total_steps'] as num?)?.toInt(),
  errorMessage: json['error_message'] as String?,
);

Map<String, dynamic> _$ExecutionStatusChangedDataToJson(
  _ExecutionStatusChangedData instance,
) => <String, dynamic>{
  'execution_id': instance.executionId,
  'status': instance.status,
  'completed_steps': instance.completedSteps,
  'total_steps': instance.totalSteps,
  'error_message': instance.errorMessage,
};

_NodeStatusChangedData _$NodeStatusChangedDataFromJson(
  Map<String, dynamic> json,
) => _NodeStatusChangedData(
  stepId: json['step_id'] as String,
  nodeId: json['node_id'] as String,
  from: json['from'] as String,
  to: json['to'] as String,
  errorDetail: json['error_detail'] as Map<String, dynamic>?,
  errorMessage: json['error_message'] as String?,
);

Map<String, dynamic> _$NodeStatusChangedDataToJson(
  _NodeStatusChangedData instance,
) => <String, dynamic>{
  'step_id': instance.stepId,
  'node_id': instance.nodeId,
  'from': instance.from,
  'to': instance.to,
  'error_detail': instance.errorDetail,
  'error_message': instance.errorMessage,
};
