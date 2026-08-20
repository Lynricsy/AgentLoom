// ignore_for_file: invalid_annotation_target

import 'package:freezed_annotation/freezed_annotation.dart';

part 'execution_event.freezed.dart';
part 'execution_event.g.dart';

/// 服务端事件信封 `ExecutionEvent<T>`
/// 所有 Socket.IO 事件均包裹在此信封中（除 execution.state.snapshot）
@freezed
abstract class ExecutionEventEnvelope with _$ExecutionEventEnvelope {
  // server 的 Socket 信封与载荷是 camelCase（见 agentloom-contracts），
  // 不能声明 FieldRename.snake，否则生成的解析代码会去读 event_id 之类的键。
  const factory ExecutionEventEnvelope({
    required int eventId,
    required String event,
    required String timestamp,
    required String executionId,
    // 契约层信封声明 tenantId 必需，server 的 createEnvelope 恒写入该字段。
    required String tenantId,
    required Map<String, dynamic> data,
  }) = _ExecutionEventEnvelope;

  factory ExecutionEventEnvelope.fromJson(Map<String, dynamic> json) =>
      _$ExecutionEventEnvelopeFromJson(json);
}

/// execution.status.changed 事件的 data 部分
@freezed
abstract class ExecutionStatusChangedData with _$ExecutionStatusChangedData {
  // server 的 Socket 信封与载荷是 camelCase（见 agentloom-contracts），
  // 不能声明 FieldRename.snake，否则生成的解析代码会去读 event_id 之类的键。
  const factory ExecutionStatusChangedData({
    required String executionId,
    required String status,
    int? completedSteps,
    int? totalSteps,
    String? errorMessage,
  }) = _ExecutionStatusChangedData;

  factory ExecutionStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStatusChangedDataFromJson(json);
}

/// execution.node.status-changed 事件的 data 部分
@freezed
abstract class NodeStatusChangedData with _$NodeStatusChangedData {
  // server 的 Socket 信封与载荷是 camelCase（见 agentloom-contracts），
  // 不能声明 FieldRename.snake，否则生成的解析代码会去读 event_id 之类的键。
  const factory NodeStatusChangedData({
    required String stepId,
    required String nodeId,
    String? nodeName,
    String? nodeType,
    required String from,
    required String to,
    String? startedAt,
    String? completedAt,
    Map<String, dynamic>? errorDetail,
    String? errorMessage,
  }) = _NodeStatusChangedData;

  factory NodeStatusChangedData.fromJson(Map<String, dynamic> json) =>
      _$NodeStatusChangedDataFromJson(json);
}
