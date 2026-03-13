import 'package:freezed_annotation/freezed_annotation.dart';

part 'execution_event.freezed.dart';
part 'execution_event.g.dart';

/// 服务端事件信封 `ExecutionEvent<T>`
/// 所有 Socket.IO 事件均包裹在此信封中（除 execution.state.snapshot）
@freezed
abstract class ExecutionEventEnvelope with _$ExecutionEventEnvelope {
  const factory ExecutionEventEnvelope({
    @JsonKey(name: 'event_id') required int eventId,
    required String event,
    required String timestamp,
    @JsonKey(name: 'execution_id') required String executionId,
    @JsonKey(name: 'tenant_id') String? tenantId,
    required Map<String, dynamic> data,
  }) = _ExecutionEventEnvelope;

  factory ExecutionEventEnvelope.fromJson(Map<String, dynamic> json) =>
      _$ExecutionEventEnvelopeFromJson(json);
}

/// execution.status.changed 事件的 data 部分
@freezed
abstract class ExecutionStatusChangedData with _$ExecutionStatusChangedData {
  const factory ExecutionStatusChangedData({
    @JsonKey(name: 'execution_id') required String executionId,
    required String status,
    @JsonKey(name: 'completed_steps') int? completedSteps,
    @JsonKey(name: 'total_steps') int? totalSteps,
    @JsonKey(name: 'error_message') String? errorMessage,
  }) = _ExecutionStatusChangedData;

  factory ExecutionStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStatusChangedDataFromJson(json);
}

/// execution.node.status-changed 事件的 data 部分
@freezed
abstract class NodeStatusChangedData with _$NodeStatusChangedData {
  const factory NodeStatusChangedData({
    @JsonKey(name: 'step_id') required String stepId,
    @JsonKey(name: 'node_id') required String nodeId,
    @JsonKey(name: 'node_name') String? nodeName,
    @JsonKey(name: 'node_type') String? nodeType,
    required String from,
    required String to,
    @JsonKey(name: 'started_at') String? startedAt,
    @JsonKey(name: 'completed_at') String? completedAt,
    @JsonKey(name: 'error_detail') Map<String, dynamic>? errorDetail,
    @JsonKey(name: 'error_message') String? errorMessage,
  }) = _NodeStatusChangedData;

  factory NodeStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$NodeStatusChangedDataFromJson(json);
}
