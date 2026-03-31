// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'execution_event.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ExecutionEventEnvelope _$ExecutionEventEnvelopeFromJson(
  Map<String, dynamic> json,
) => _ExecutionEventEnvelope(
  eventId: (json['eventId'] as num).toInt(),
  event: json['event'] as String,
  timestamp: json['timestamp'] as String,
  executionId: json['executionId'] as String,
  tenantId: json['tenantId'] as String?,
  data: json['data'] as Map<String, dynamic>,
);

Map<String, dynamic> _$ExecutionEventEnvelopeToJson(
  _ExecutionEventEnvelope instance,
) => <String, dynamic>{
  'eventId': instance.eventId,
  'event': instance.event,
  'timestamp': instance.timestamp,
  'executionId': instance.executionId,
  'tenantId': instance.tenantId,
  'data': instance.data,
};

_ExecutionStatusChangedData _$ExecutionStatusChangedDataFromJson(
  Map<String, dynamic> json,
) => _ExecutionStatusChangedData(
  executionId: json['executionId'] as String,
  status: json['status'] as String,
  completedSteps: (json['completedSteps'] as num?)?.toInt(),
  totalSteps: (json['totalSteps'] as num?)?.toInt(),
  errorMessage: json['errorMessage'] as String?,
);

Map<String, dynamic> _$ExecutionStatusChangedDataToJson(
  _ExecutionStatusChangedData instance,
) => <String, dynamic>{
  'executionId': instance.executionId,
  'status': instance.status,
  'completedSteps': instance.completedSteps,
  'totalSteps': instance.totalSteps,
  'errorMessage': instance.errorMessage,
};

_NodeStatusChangedData _$NodeStatusChangedDataFromJson(
  Map<String, dynamic> json,
) => _NodeStatusChangedData(
  stepId: json['stepId'] as String,
  nodeId: json['nodeId'] as String,
  nodeName: json['nodeName'] as String?,
  nodeType: json['nodeType'] as String?,
  from: json['from'] as String,
  to: json['to'] as String,
  startedAt: json['startedAt'] as String?,
  completedAt: json['completedAt'] as String?,
  errorDetail: json['errorDetail'] as Map<String, dynamic>?,
  errorMessage: json['errorMessage'] as String?,
);

Map<String, dynamic> _$NodeStatusChangedDataToJson(
  _NodeStatusChangedData instance,
) => <String, dynamic>{
  'stepId': instance.stepId,
  'nodeId': instance.nodeId,
  'nodeName': instance.nodeName,
  'nodeType': instance.nodeType,
  'from': instance.from,
  'to': instance.to,
  'startedAt': instance.startedAt,
  'completedAt': instance.completedAt,
  'errorDetail': instance.errorDetail,
  'errorMessage': instance.errorMessage,
};
