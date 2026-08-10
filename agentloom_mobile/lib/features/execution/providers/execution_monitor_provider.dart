import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../workflows/api/workflow_api.dart';
import '../models/execution_event.dart';
import '../models/execution_runtime.dart';
import '../models/execution_state.dart';
import '../models/execution_status.dart';
import '../services/execution_socket_service.dart';
import '../../../shared/providers/env_provider.dart';
import 'execution_monitor_mappers.dart';
import 'execution_monitor_state.dart';

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
    ExecutionMonitorRuntimeData initialRuntime;
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      initialSnapshot = buildSnapshotFromExecutionDetail(execution);
      initialRuntime = buildRuntimeFromExecutionDetail(
        execution,
        snapshot: initialSnapshot,
      );
    } catch (e) {
      return ExecutionMonitorError(
        message: 'Failed to load execution: $e',
        executionId: executionId,
      );
    }

    // 终态无需 WS
    final status = ExecutionStatus.fromJson(initialSnapshot.status);
    if (status.isTerminal) {
      return ExecutionMonitorDisconnected(
        lastSnapshot: initialSnapshot,
        runtime: initialRuntime,
      );
    }

    // 2. 尝试 WebSocket
    try {
      final wsSnapshot = await _connectWebSocket(initialSnapshot);
      final mergedRuntime = mergeRuntimeFromSnapshot(
        initialRuntime,
        wsSnapshot,
      );
      _startPolling();
      return ExecutionMonitorConnected(
        snapshot: wsSnapshot,
        runtime: mergedRuntime,
      );
    } catch (_) {
      // WS 连接失败 → 直接降级到轮询
      _startPolling();
      return ExecutionMonitorPolling(
        snapshot: initialSnapshot,
        runtime: initialRuntime,
      );
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
      final mergedSnapshot = mergeSnapshotMetadata(
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
    _subscriptions.add(socket.stepAgentEvent.listen(_handleStepAgentEvent));
    _subscriptions.add(socket.stepRetrying.listen(_handleStepRetrying));
    _subscriptions.add(socket.outputChunk.listen(_handleOutputChunk));
    _subscriptions.add(
      socket.interventionRequired.listen(_handleInterventionRequired),
    );
    _subscriptions.add(
      socket.interventionResolved.listen(_handleInterventionResolved),
    );
    _subscriptions.add(
      socket.toolCallStatusChanged.listen(_handleToolCallStatusChanged),
    );
    _subscriptions.add(
      socket.toolPermissionRequired.listen(_handleToolPermissionRequired),
    );
    _subscriptions.add(
      socket.toolPermissionResolved.listen(_handleToolPermissionResolved),
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

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final currentRuntime = extractMonitorRuntime(state.value);
    final mode = extractMonitorConnectionMode(state.value);

    final updatedSnapshot = currentSnapshot.copyWith(
      status: data.status,
      completedSteps: data.completedSteps ?? currentSnapshot.completedSteps,
      totalSteps: data.totalSteps ?? currentSnapshot.totalSteps,
    );

    final newStatus = ExecutionStatus.fromJson(data.status);
    if (newStatus.isTerminal) {
      unawaited(
        _finalizeTerminalState(
          fallbackSnapshot: updatedSnapshot,
          fallbackRuntime: currentRuntime,
        ),
      );
      return;
    }

    state = AsyncValue.data(
      ExecutionMonitorConnected(
        snapshot: updatedSnapshot,
        connectionMode: mode,
        runtime: currentRuntime,
      ),
    );
  }

  Future<void> _finalizeTerminalState({
    required ExecutionStateSnapshot fallbackSnapshot,
    required ExecutionMonitorRuntimeData fallbackRuntime,
  }) async {
    try {
      final api = ref.read(workflowApiProvider);
      final execution = await api.getExecution(executionId);
      if (!ref.mounted) {
        return;
      }

      final latestSnapshot = buildSnapshotFromExecutionDetail(
        execution,
        previous: fallbackSnapshot,
      );
      final terminalSnapshot = latestSnapshot.copyWith(
        status: fallbackSnapshot.status,
        completedSteps: fallbackSnapshot.completedSteps,
        totalSteps: fallbackSnapshot.totalSteps,
      );
      final latestRuntime = buildRuntimeFromExecutionDetail(
        execution,
        previous: fallbackRuntime,
        snapshot: terminalSnapshot,
      );
      _onTerminalState(terminalSnapshot, runtime: latestRuntime);
    } catch (_) {
      if (!ref.mounted) {
        return;
      }

      final mergedRuntime = mergeRuntimeFromSnapshot(
        fallbackRuntime,
        fallbackSnapshot,
      );
      _onTerminalState(fallbackSnapshot, runtime: mergedRuntime);
    }
  }

  /// 处理节点状态变更事件
  void _handleNodeStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final data = NodeStatusChangedData.fromJson(
      envelope.data.cast<String, dynamic>(),
    );

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final currentRuntime = extractMonitorRuntime(state.value);

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
    final updatedRuntime = updateRuntimeWithNodeStatus(currentRuntime, data);

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: updatedSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: updatedSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleStepAgentEvent(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithAgentEvent(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleStepRetrying(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithStepRetrying(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleOutputChunk(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithOutputChunk(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleInterventionRequired(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithInterventionRequired(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleInterventionResolved(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithInterventionResolved(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolCallStatusChanged(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithToolCallStatus(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolPermissionRequired(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithToolPermissionRequired(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  void _handleToolPermissionResolved(ExecutionEventEnvelope envelope) {
    _lastEventId = envelope.eventId;

    final currentSnapshot = extractMonitorSnapshot(state.value);
    if (currentSnapshot == null) return;
    final mode = extractMonitorConnectionMode(state.value);
    final updatedRuntime = updateRuntimeWithToolPermissionResolved(
      extractMonitorRuntime(state.value),
      envelope.data.cast<String, dynamic>(),
    );

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: currentSnapshot,
          connectionMode: mode,
          runtime: updatedRuntime,
        ),
      );
    }
  }

  /// 处理全量快照事件（gap recovery）
  void _handleSnapshot(ExecutionStateSnapshot snapshot) {
    final mergedSnapshot = mergeSnapshotMetadata(
      snapshot,
      previous: extractMonitorSnapshot(state.value),
    );
    final mergedRuntime = mergeRuntimeFromSnapshot(
      extractMonitorRuntime(state.value),
      mergedSnapshot,
    );
    _lastEventId = mergedSnapshot.lastEventId;

    final status = ExecutionStatus.fromJson(mergedSnapshot.status);
    if (status.isTerminal) {
      _onTerminalState(mergedSnapshot, runtime: mergedRuntime);
      return;
    }

    if (state.value is ExecutionMonitorPolling) {
      state = AsyncValue.data(
        ExecutionMonitorPolling(
          snapshot: mergedSnapshot,
          runtime: mergedRuntime,
        ),
      );
    } else {
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: mergedSnapshot,
          runtime: mergedRuntime,
        ),
      );
    }
  }

  // -----------------------------------------------------------------------
  // 断连 / 重连
  // -----------------------------------------------------------------------

  void _handleDisconnected(String reason) {
    final snapshot = extractMonitorSnapshot(state.value);
    if (snapshot == null) return;
    final runtime = extractMonitorRuntime(state.value);

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
        runtime: runtime,
      ),
    );
  }

  void _handleReconnected(void _) async {
    _stopPolling();

    // re-subscribe with lastEventId
    if (_socketService != null) {
      try {
        final previousSnapshot = extractMonitorSnapshot(state.value);
        final previousRuntime = extractMonitorRuntime(state.value);
        final ack = await _socketService!.subscribe(
          executionId: executionId,
          lastEventId: _lastEventId,
        );

        if (ack.status == 'subscribed' && ack.currentState != null) {
          final mergedSnapshot = mergeSnapshotMetadata(
            ack.currentState!,
            previous: previousSnapshot,
          );
          final mergedRuntime = mergeRuntimeFromSnapshot(
            previousRuntime,
            mergedSnapshot,
          );
          _lastEventId = mergedSnapshot.lastEventId;
          _startPolling();
          state = AsyncValue.data(
            ExecutionMonitorConnected(
              snapshot: mergedSnapshot,
              runtime: mergedRuntime,
            ),
          );
          return;
        }
      } catch (_) {
        // subscribe 失败则保持当前快照
      }
    }

    final snapshot = extractMonitorSnapshot(state.value);
    if (snapshot != null) {
      _startPolling();
      state = AsyncValue.data(
        ExecutionMonitorConnected(
          snapshot: snapshot,
          runtime: extractMonitorRuntime(state.value),
        ),
      );
    }
  }

  // -----------------------------------------------------------------------
  // REST 对账 / 断线降级
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
      final polledSnapshot = buildSnapshotFromExecutionDetail(
        execution,
        previous: extractMonitorSnapshot(state.value),
      );
      final polledRuntime = buildRuntimeFromExecutionDetail(
        execution,
        previous: extractMonitorRuntime(state.value),
        snapshot: polledSnapshot,
      );

      final status = ExecutionStatus.fromJson(execution.status);
      if (status.isTerminal) {
        _onTerminalState(polledSnapshot, runtime: polledRuntime);
        return;
      }

      final mode = extractMonitorConnectionMode(state.value);
      if (state.value is ExecutionMonitorConnected) {
        state = AsyncValue.data(
          ExecutionMonitorConnected(
            snapshot: polledSnapshot,
            connectionMode: mode,
            runtime: polledRuntime,
          ),
        );
      } else {
        state = AsyncValue.data(
          ExecutionMonitorPolling(
            snapshot: polledSnapshot,
            connectionMode: mode,
            runtime: polledRuntime,
          ),
        );
      }
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

  void _onTerminalState(
    ExecutionStateSnapshot snapshot, {
    ExecutionMonitorRuntimeData? runtime,
  }) {
    _stopPolling();
    _disposeSocket();
    state = AsyncValue.data(
      ExecutionMonitorDisconnected(
        lastSnapshot: snapshot,
        runtime: runtime ?? extractMonitorRuntime(state.value),
      ),
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
