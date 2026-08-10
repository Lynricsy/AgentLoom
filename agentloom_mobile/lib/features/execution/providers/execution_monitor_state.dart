import '../models/execution_runtime.dart';
import '../models/execution_state.dart';

/// 连接模式
enum ConnectionMode {
  websocket,
  polling,
  reconnecting,
  disconnected;

  String get label => switch (this) {
    ConnectionMode.websocket => 'WebSocket',
    ConnectionMode.polling => 'Polling',
    ConnectionMode.reconnecting => 'Reconnecting',
    ConnectionMode.disconnected => 'Disconnected',
  };
}

/// 执行监控状态 (sealed class)
sealed class ExecutionMonitorState {
  const ExecutionMonitorState();
}

/// 初始加载中
class ExecutionMonitorLoading extends ExecutionMonitorState {
  const ExecutionMonitorLoading();
}

/// WebSocket 已连接，实时监控中
class ExecutionMonitorConnected extends ExecutionMonitorState {
  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorConnected({
    required this.snapshot,
    this.connectionMode = ConnectionMode.websocket,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });

  ExecutionMonitorConnected copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
    ExecutionMonitorRuntimeData? runtime,
  }) {
    return ExecutionMonitorConnected(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
      runtime: runtime ?? this.runtime,
    );
  }
}

/// 降级轮询中
class ExecutionMonitorPolling extends ExecutionMonitorState {
  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorPolling({
    required this.snapshot,
    this.connectionMode = ConnectionMode.polling,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });

  ExecutionMonitorPolling copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
    ExecutionMonitorRuntimeData? runtime,
  }) {
    return ExecutionMonitorPolling(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
      runtime: runtime ?? this.runtime,
    );
  }
}

/// 错误态
class ExecutionMonitorError extends ExecutionMonitorState {
  final String message;
  final String? executionId;

  const ExecutionMonitorError({required this.message, this.executionId});
}

/// 已断开（终态后自动清理）
class ExecutionMonitorDisconnected extends ExecutionMonitorState {
  final ExecutionStateSnapshot? lastSnapshot;
  final ExecutionMonitorRuntimeData runtime;

  const ExecutionMonitorDisconnected({
    this.lastSnapshot,
    this.runtime = const ExecutionMonitorRuntimeData(),
  });
}

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/// 从当前状态中提取 snapshot（connected 或 polling）
ExecutionStateSnapshot? extractMonitorSnapshot(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.snapshot;
  if (s is ExecutionMonitorPolling) return s.snapshot;
  if (s is ExecutionMonitorDisconnected) return s.lastSnapshot;
  return null;
}

/// 从当前状态中提取连接模式
ConnectionMode extractMonitorConnectionMode(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.connectionMode;
  if (s is ExecutionMonitorPolling) return s.connectionMode;
  if (s is ExecutionMonitorDisconnected) return ConnectionMode.disconnected;
  return ConnectionMode.websocket;
}

ExecutionMonitorRuntimeData extractMonitorRuntime(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.runtime;
  if (s is ExecutionMonitorPolling) return s.runtime;
  if (s is ExecutionMonitorDisconnected) return s.runtime;
  return const ExecutionMonitorRuntimeData();
}
