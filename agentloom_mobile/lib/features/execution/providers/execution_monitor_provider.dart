import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../workflows/api/workflow_api.dart';
import '../../workflows/models/execution_step_dto.dart';
import '../../workflows/models/execution_summary_dto.dart';
import '../models/execution_event.dart';
import '../models/execution_state.dart';
import '../models/execution_status.dart';
import '../services/execution_socket_service.dart';
import '../../../shared/providers/env_provider.dart';

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

  const ExecutionMonitorConnected({
    required this.snapshot,
    this.connectionMode = ConnectionMode.websocket,
  });

  ExecutionMonitorConnected copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
  }) {
    return ExecutionMonitorConnected(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
    );
  }
}

/// 降级轮询中
class ExecutionMonitorPolling extends ExecutionMonitorState {
  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;

  const ExecutionMonitorPolling({
    required this.snapshot,
    this.connectionMode = ConnectionMode.polling,
  });

  ExecutionMonitorPolling copyWith({
    ExecutionStateSnapshot? snapshot,
    ConnectionMode? connectionMode,
  }) {
    return ExecutionMonitorPolling(
      snapshot: snapshot ?? this.snapshot,
      connectionMode: connectionMode ?? this.connectionMode,
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

  const ExecutionMonitorDisconnected({this.lastSnapshot});
}

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/// 从当前状态中提取 snapshot（connected 或 polling）
ExecutionStateSnapshot? _extractSnapshot(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.snapshot;
  if (s is ExecutionMonitorPolling) return s.snapshot;
  if (s is ExecutionMonitorDisconnected) return s.lastSnapshot;
  return null;
}

/// 从当前状态中提取连接模式
ConnectionMode _extractMode(ExecutionMonitorState? s) {
  if (s is ExecutionMonitorConnected) return s.connectionMode;
  if (s is ExecutionMonitorPolling) return s.connectionMode;
  if (s is ExecutionMonitorDisconnected) return ConnectionMode.disconnected;
  return ConnectionMode.websocket;
}

typedef _GraphNodeMeta = ({String? nodeName, String? nodeType});

Map<String, _GraphNodeMeta> _extractGraphNodeMeta(
  Map<String, dynamic>? definitionSnapshot,
) {
  final rawNodes = definitionSnapshot?['nodes'];
  if (rawNodes is! List) {
    return const {};
  }

  final graphNodeMeta = <String, _GraphNodeMeta>{};
  for (final rawNode in rawNodes) {
    if (rawNode is! Map<String, dynamic>) {
      continue;
    }

    final id = rawNode['id'];
    if (id is! String || id.isEmpty) {
      continue;
    }

    final rawData = rawNode['data'];
    final data = rawData is Map<String, dynamic> ? rawData : null;
    final nodeName = switch (data?['label']) {
      final String value when value.isNotEmpty => value,
      String _ => null,
      _ => null,
    };
    final nodeType = switch (data?['nodeType']) {
      final String value when value.isNotEmpty => value,
      String _ => null,
      _ => switch (rawNode['type']) {
        final String value when value.isNotEmpty => value,
        _ => null,
      },
    };

    graphNodeMeta[id] = (nodeName: nodeName, nodeType: nodeType);
  }

  return graphNodeMeta;
}

StepSnapshot _mapExecutionStep(
  ExecutionStepDto step, {
  _GraphNodeMeta? graphNodeMeta,
  StepSnapshot? previous,
}) {
  final nodeName =
      graphNodeMeta?.nodeName ??
      step.resolvedNodeLabel ??
      previous?.nodeName ??
      step.nodeId;
  final nodeType =
      graphNodeMeta?.nodeType ?? step.resolvedNodeType ?? previous?.nodeType;

  return StepSnapshot(
    stepId: step.id,
    nodeId: step.nodeId,
    nodeName: nodeName,
    nodeType: nodeType,
    status: step.status,
    startedAt: step.startedAt ?? previous?.startedAt,
    completedAt: step.completedAt ?? previous?.completedAt,
    errorMessage: step.resolvedErrorMessage ?? previous?.errorMessage,
    errorDetail: step.errorDetailMap ?? previous?.errorDetail,
    checkpointData: step.checkpointData ?? previous?.checkpointData,
    result: step.result ?? previous?.result,
  );
}

ExecutionStateSnapshot _buildSnapshotFromExecutionDetail(
  ExecutionSummaryDto execution, {
  ExecutionStateSnapshot? previous,
}) {
  final previousStepsById = {
    for (final step in previous?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };
  final graphNodeMeta = _extractGraphNodeMeta(execution.definitionSnapshot);
  final mappedSteps = execution.steps
      ?.map(
        (step) => _mapExecutionStep(
          step,
          graphNodeMeta: graphNodeMeta[step.nodeId],
          previous: previousStepsById[step.id],
        ),
      )
      .toList();

  return ExecutionStateSnapshot(
    executionId: execution.id,
    status: execution.status,
    completedSteps: execution.completedSteps,
    totalSteps: execution.totalSteps,
    steps: mappedSteps ?? previous?.steps ?? const [],
    snapshotAt: execution.updatedAt,
    lastEventId: previous?.lastEventId,
  );
}

ExecutionStateSnapshot _mergeSnapshotMetadata(
  ExecutionStateSnapshot incoming, {
  ExecutionStateSnapshot? previous,
}) {
  final previousStepsById = {
    for (final step in previous?.steps ?? const <StepSnapshot>[])
      step.stepId: step,
  };

  if (incoming.steps.isEmpty && previous != null && previous.steps.isNotEmpty) {
    return incoming.copyWith(steps: previous.steps);
  }

  final mergedSteps = incoming.steps
      .map((step) {
        final previousStep = previousStepsById[step.stepId];
        return step.copyWith(
          nodeName: step.nodeName ?? previousStep?.nodeName,
          nodeType: step.nodeType ?? previousStep?.nodeType,
          startedAt: step.startedAt ?? previousStep?.startedAt,
          completedAt: step.completedAt ?? previousStep?.completedAt,
          errorMessage: step.errorMessage ?? previousStep?.errorMessage,
          errorDetail: step.errorDetail ?? previousStep?.errorDetail,
          checkpointData: step.checkpointData ?? previousStep?.checkpointData,
          result: step.result ?? previousStep?.result,
        );
      })
      .toList(growable: false);

  return incoming.copyWith(steps: mergedSteps);
}

// ---------------------------------------------------------------------------
// Notifier — AutoDispose Family
// ---------------------------------------------------------------------------

/// 执行监控 Notifier (Riverpod 3.x AutoDispose Family)
///
/// 生命周期：
/// 1. build() → REST 获取初始快照
/// 2. 连接 WebSocket → subscribe → 实时事件驱动更新
/// 3. 断连 → 自动降级 5s REST 轮询
/// 4. 重连 → 停止轮询 + re-subscribe(lastEventId)
/// 5. 终态 → 断开 WS + 停止轮询 → disconnected
class ExecutionMonitorNotifier extends AsyncNotifier<ExecutionMonitorState> {
  /// executionId 通过构造函数注入 (Riverpod 3.x family pattern)
  ExecutionMonitorNotifier(this.executionId);
  final String executionId;

  ExecutionSocketService? _socketService;
  Timer? _pollingTimer;
  int? _lastEventId;

  final List<StreamSubscription<dynamic>> _subscriptions = [];

  @override
  Future<ExecutionMonitorState> build() async {
    ref.onDispose(_cleanup);
    return _startMonitoring();
  }

  // -----------------------------------------------------------------------
  // 启动监控
  // -----------------------------------------------------------------------

  Future<ExecutionMonitorState> _startMonitoring() async {
    // 1. REST 获取初始状态
    ExecutionStateSnapshot initialSnapshot;
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      initialSnapshot = _buildSnapshotFromExecutionDetail(execution);
    } catch (e) {
      return ExecutionMonitorError(
        message: 'Failed to load execution: $e',
        executionId: executionId,
      );
    }

    // 终态无需 WS
    final status = ExecutionStatus.fromJson(initialSnapshot.status);
    if (status.isTerminal) {
      return ExecutionMonitorDisconnected(lastSnapshot: initialSnapshot);
    }

    // 2. 尝试 WebSocket
    try {
      final wsSnapshot = await _connectWebSocket(initialSnapshot);
      return ExecutionMonitorConnected(snapshot: wsSnapshot);
    } catch (_) {
      // WS 连接失败 → 直接降级到轮询
      _startPolling();
      return ExecutionMonitorPolling(snapshot: initialSnapshot);
    }
  }

  // -----------------------------------------------------------------------
  // WebSocket 连接
  // -----------------------------------------------------------------------

  Future<ExecutionStateSnapshot> _connectWebSocket(
    ExecutionStateSnapshot currentSnapshot,
  ) async {
    final env = ref.read(envProvider);
    final authState = ref.read(authProvider).value;

    String? token;
    if (authState is AuthStateAuthenticated) {
      token = authState.tokens.accessToken;
    }
    if (token == null) {
      throw StateError('Not authenticated');
    }

    final factory = ref.read(socketServiceFactoryProvider);
    _socketService = factory(baseUrl: env.apiBaseUrl, authToken: token);

    // 注册事件监听（在 connect 之前）
    _setupEventListeners();

    _socketService!.connect();

    // 等待连接成功（最多 10 秒）
    await _socketService!.onConnected.first.timeout(
      const Duration(seconds: 10),
      onTimeout: () => throw TimeoutException('WebSocket connection timeout'),
    );

    // 订阅执行事件
    final ack = await _socketService!.subscribe(
      executionId: executionId,
      lastEventId: _lastEventId,
    );

    if (ack.status == 'error') {
      throw StateError('Subscribe failed: ${ack.error}');
    }

    // 如果 ACK 返回了 snapshot，用它作为最新状态
    if (ack.currentState != null) {
      final mergedSnapshot = _mergeSnapshotMetadata(
        ack.currentState!,
        previous: currentSnapshot,
      );
      _lastEventId = mergedSnapshot.lastEventId;
      return mergedSnapshot;
    }

    return currentSnapshot;
  }

  // -----------------------------------------------------------------------
  // 事件监听
  // -----------------------------------------------------------------------

  void _setupEventListeners() {
    final socket = _socketService!;

    _subscriptions.add(
      socket.executionStatusChanged.listen(_handleStatusChanged),
    );
    _subscriptions.add(
      socket.nodeStatusChanged.listen(_handleNodeStatusChanged),
    );
    _subscriptions.add(socket.stateSnapshot.listen(_handleSnapshot));
    _subscriptions.add(socket.onDisconnected.listen(_handleDisconnected));
    _subscriptions.add(socket.onReconnected.listen(_handleReconnected));
  }

  /// 处理执行状态变更事件
  void _handleStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final data = ExecutionStatusChangedData.fromJson(
      envelope.data.cast<String, dynamic>(),
    );

    final currentSnapshot = _extractSnapshot(state.value);
    if (currentSnapshot == null) return;

    final updatedSnapshot = currentSnapshot.copyWith(
      status: data.status,
      completedSteps: data.completedSteps ?? currentSnapshot.completedSteps,
      totalSteps: data.totalSteps ?? currentSnapshot.totalSteps,
    );

    final newStatus = ExecutionStatus.fromJson(data.status);
    if (newStatus.isTerminal) {
      _onTerminalState(updatedSnapshot);
      return;
    }

    state = AsyncValue.data(
      ExecutionMonitorConnected(snapshot: updatedSnapshot),
    );
  }

  /// 处理节点状态变更事件
  void _handleNodeStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final data = NodeStatusChangedData.fromJson(
      envelope.data.cast<String, dynamic>(),
    );

    final currentSnapshot = _extractSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = _extractMode(state.value);

    // 更新对应 step 的状态
    var hasMatchedStep = false;
    final updatedSteps = currentSnapshot.steps
        .map((step) {
          if (step.stepId == data.stepId) {
            hasMatchedStep = true;
            return step.copyWith(
              nodeName: data.nodeName ?? step.nodeName,
              nodeType: data.nodeType ?? step.nodeType,
              status: data.to,
              startedAt: data.startedAt ?? step.startedAt,
              completedAt: data.completedAt ?? step.completedAt,
              errorMessage: data.errorMessage,
              errorDetail: data.errorDetail,
            );
          }
          return step;
        })
        .toList(growable: true);

    if (!hasMatchedStep) {
      updatedSteps.add(
        StepSnapshot(
          stepId: data.stepId,
          nodeId: data.nodeId,
          nodeName: data.nodeName ?? data.nodeId,
          nodeType: data.nodeType,
          status: data.to,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          errorMessage: data.errorMessage,
          errorDetail: data.errorDetail,
        ),
      );
    }

    final updatedSnapshot = currentSnapshot.copyWith(steps: updatedSteps);

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: updatedSnapshot,
          connectionMode: mode,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: updatedSnapshot,
          connectionMode: mode,
        ),
      );
    }
  }

  /// 处理全量快照事件（gap recovery）
  void _handleSnapshot(ExecutionStateSnapshot snapshot) {
    final mergedSnapshot = _mergeSnapshotMetadata(
      snapshot,
      previous: _extractSnapshot(state.value),
    );
    _lastEventId = mergedSnapshot.lastEventId;

    final status = ExecutionStatus.fromJson(mergedSnapshot.status);
    if (status.isTerminal) {
      _onTerminalState(mergedSnapshot);
      return;
    }

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(snapshot: mergedSnapshot),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(snapshot: mergedSnapshot),
      );
    }
  }

  // -----------------------------------------------------------------------
  // 断连 / 重连
  // -----------------------------------------------------------------------

  void _handleDisconnected(String reason) {
    final snapshot = _extractSnapshot(state.value);
    if (snapshot == null) return;

    final status = ExecutionStatus.fromJson(snapshot.status);
    if (status.isTerminal) return;

    // 服务端主动断连（认证失败）不重连
    if (reason == 'io server disconnect') {
      state = AsyncValue.data(
        ExecutionMonitorError(
          message: 'Server disconnected: authentication failed',
          executionId: executionId,
        ),
      );
      return;
    }

    // 降级到轮询
    _startPolling();
    state = AsyncValue.data(
      ExecutionMonitorPolling(
        snapshot: snapshot,
        connectionMode: ConnectionMode.reconnecting,
      ),
    );
  }

  void _handleReconnected(void _) async {
    _stopPolling();

    // re-subscribe with lastEventId
    if (_socketService != null) {
      try {
        final previousSnapshot = _extractSnapshot(state.value);
        final ack = await _socketService!.subscribe(
          executionId: executionId,
          lastEventId: _lastEventId,
        );

        if (ack.status == 'subscribed' && ack.currentState != null) {
          final mergedSnapshot = _mergeSnapshotMetadata(
            ack.currentState!,
            previous: previousSnapshot,
          );
          _lastEventId = mergedSnapshot.lastEventId;
          state = AsyncValue.data(
            ExecutionMonitorConnected(snapshot: mergedSnapshot),
          );
          return;
        }
      } catch (_) {
        // subscribe 失败则保持当前快照
      }
    }

    final snapshot = _extractSnapshot(state.value);
    if (snapshot != null) {
      state = AsyncValue.data(ExecutionMonitorConnected(snapshot: snapshot));
    }
  }

  // -----------------------------------------------------------------------
  // REST 轮询降级
  // -----------------------------------------------------------------------

  void _startPolling() {
    _stopPolling();
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _pollExecution();
    });
  }

  Future<void> _pollExecution() async {
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      final polledSnapshot = _buildSnapshotFromExecutionDetail(
        execution,
        previous: _extractSnapshot(state.value),
      );

      final status = ExecutionStatus.fromJson(execution.status);
      if (status.isTerminal) {
        _onTerminalState(polledSnapshot);
        return;
      }

      final mode = _extractMode(state.value);
      state = AsyncValue.data(
        ExecutionMonitorPolling(snapshot: polledSnapshot, connectionMode: mode),
      );
    } catch (_) {
      // 轮询失败不更新状态，等下一次重试
    }
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  // -----------------------------------------------------------------------
  // 终态处理
  // -----------------------------------------------------------------------

  void _onTerminalState(ExecutionStateSnapshot snapshot) {
    _stopPolling();
    _disposeSocket();
    state = AsyncValue.data(
      ExecutionMonitorDisconnected(lastSnapshot: snapshot),
    );
  }

  void _disposeSocket() {
    for (final sub in _subscriptions) {
      sub.cancel();
    }
    _subscriptions.clear();
    _socketService?.dispose();
    _socketService = null;
  }

  void _cleanup() {
    _stopPolling();
    _disposeSocket();
  }
}

/// 执行监控 Provider（AutoDispose + Family）
///
/// Riverpod 3.x 模式：构造函数接收 executionId 参数
final executionMonitorProvider = AsyncNotifierProvider.autoDispose
    .family<ExecutionMonitorNotifier, ExecutionMonitorState, String>(
      ExecutionMonitorNotifier.new,
    );

/// SocketService 工厂 Provider（可在测试中覆盖）
typedef SocketServiceFactory =
    ExecutionSocketService Function({
      required String baseUrl,
      required String authToken,
    });

final socketServiceFactoryProvider = Provider<SocketServiceFactory>(
  (ref) =>
      ({required baseUrl, required authToken}) =>
          ExecutionSocketService(baseUrl: baseUrl, authToken: authToken),
);
