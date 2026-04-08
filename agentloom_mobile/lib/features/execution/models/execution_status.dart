import 'package:flutter/material.dart';

/// 执行状态枚举，与服务端 ExecutionStatus 对齐
enum ExecutionStatus {
  pending,
  running,
  paused,
  completed,
  failed,
  cancelled;

  /// 从服务端 JSON 字符串解析
  static ExecutionStatus fromJson(String value) {
    return ExecutionStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => ExecutionStatus.pending,
    );
  }

  String toJson() => name;

  /// 是否为终态
  bool get isTerminal =>
      this == completed || this == failed || this == cancelled;

  /// 状态对应的 Material 颜色
  Color get color => switch (this) {
    ExecutionStatus.pending => Colors.grey,
    ExecutionStatus.running => Colors.blue,
    ExecutionStatus.paused => Colors.amber,
    ExecutionStatus.completed => Colors.green,
    ExecutionStatus.failed => Colors.red,
    ExecutionStatus.cancelled => Colors.orange,
  };

  /// 状态的本地化显示文本
  String get label => switch (this) {
    ExecutionStatus.pending => '等待中',
    ExecutionStatus.running => '运行中',
    ExecutionStatus.paused => '已暂停',
    ExecutionStatus.completed => '已完成',
    ExecutionStatus.failed => '失败',
    ExecutionStatus.cancelled => '已取消',
  };

  /// 状态对应的图标
  IconData get icon => switch (this) {
    ExecutionStatus.pending => Icons.schedule,
    ExecutionStatus.running => Icons.play_circle_outline,
    ExecutionStatus.paused => Icons.pause_circle_outline,
    ExecutionStatus.completed => Icons.check_circle_outline,
    ExecutionStatus.failed => Icons.error_outline,
    ExecutionStatus.cancelled => Icons.cancel_outlined,
  };
}

/// 步骤状态枚举，与服务端 StepStatus 对齐
enum StepStatus {
  pending,
  queued,
  running,
  waitingIntervention,
  completed,
  failed,
  skipped,
  cancelled;

  /// 从服务端 JSON 字符串解析（处理 snake_case）
  static StepStatus fromJson(String value) {
    // 服务端发送 waiting_intervention
    if (value == 'waiting_intervention') return StepStatus.waitingIntervention;
    return StepStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => StepStatus.pending,
    );
  }

  String toJson() => switch (this) {
    StepStatus.waitingIntervention => 'waiting_intervention',
    _ => name,
  };

  /// 是否为终态
  bool get isTerminal =>
      this == completed ||
      this == failed ||
      this == skipped ||
      this == cancelled;

  /// 步骤状态对应的 Material 颜色
  Color get color => switch (this) {
    StepStatus.pending => Colors.grey.shade300,
    StepStatus.queued => Colors.grey.shade500,
    StepStatus.running => Colors.blue,
    StepStatus.waitingIntervention => Colors.amber,
    StepStatus.completed => Colors.green,
    StepStatus.failed => Colors.red,
    StepStatus.skipped => Colors.grey.shade400,
    StepStatus.cancelled => Colors.orange,
  };

  /// 步骤状态的显示文本
  String get label => switch (this) {
    StepStatus.pending => '等待中',
    StepStatus.queued => '队列中',
    StepStatus.running => '运行中',
    StepStatus.waitingIntervention => '等待介入',
    StepStatus.completed => '已完成',
    StepStatus.failed => '失败',
    StepStatus.skipped => '已跳过',
    StepStatus.cancelled => '已取消',
  };

  /// 步骤状态对应的图标
  IconData get icon => switch (this) {
    StepStatus.pending => Icons.circle_outlined,
    StepStatus.queued => Icons.hourglass_empty,
    StepStatus.running => Icons.sync,
    StepStatus.waitingIntervention => Icons.front_hand_outlined,
    StepStatus.completed => Icons.check_circle,
    StepStatus.failed => Icons.error,
    StepStatus.skipped => Icons.skip_next,
    StepStatus.cancelled => Icons.cancel,
  };
}
