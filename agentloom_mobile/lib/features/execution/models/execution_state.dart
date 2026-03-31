import 'package:freezed_annotation/freezed_annotation.dart';
import 'execution_status.dart';

part 'execution_state.freezed.dart';
part 'execution_state.g.dart';

/// 步骤快照，与服务端 ExecutionStateSnapshot.steps[] 对齐
@freezed
abstract class StepSnapshot with _$StepSnapshot {
  const factory StepSnapshot({
    required String stepId,
    required String nodeId,
    String? nodeName,
    String? nodeType,
    required String status,
    String? startedAt,
    String? completedAt,
    String? errorMessage,
    Map<String, dynamic>? errorDetail,
    Map<String, dynamic>? checkpointData,
    Map<String, dynamic>? result,
  }) = _StepSnapshot;

  factory StepSnapshot.fromJson(Map<String, dynamic> json) =>
      _$StepSnapshotFromJson(json);
}

/// 执行状态快照，subscribe ACK 或 state.snapshot 事件返回
@freezed
abstract class ExecutionStateSnapshot with _$ExecutionStateSnapshot {
  const factory ExecutionStateSnapshot({
    required String executionId,
    required String status,
    int? completedSteps,
    int? totalSteps,
    required List<StepSnapshot> steps,
    String? snapshotAt,
    int? lastEventId,
  }) = _ExecutionStateSnapshot;

  factory ExecutionStateSnapshot.fromJson(Map<String, dynamic> json) =>
      _$ExecutionStateSnapshotFromJson(json);
}

/// ExecutionStateSnapshot 的便捷扩展
extension ExecutionStateSnapshotX on ExecutionStateSnapshot {
  ExecutionStatus get executionStatus => ExecutionStatus.fromJson(status);

  /// 获取指定步骤的 StepStatus，不存在时返回 null
  StepStatus? stepStatusOf(String stepId) {
    final idx = steps.indexWhere((s) => s.stepId == stepId);
    if (idx == -1) return null;
    return StepStatus.fromJson(steps[idx].status);
  }
}
