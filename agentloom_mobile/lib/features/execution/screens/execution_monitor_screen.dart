import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/execution_state.dart';
import '../models/execution_status.dart';
import '../models/execution_runtime.dart';
import '../providers/execution_monitor_provider.dart';
import '../widgets/execution_alert_banner.dart';
import '../widgets/execution_status_header.dart';
import '../widgets/execution_waterfall.dart';
import '../../../routes/route_names.dart';

/// 执行监控主屏幕
///
/// 通过 [executionMonitorProvider] 实时监控执行状态，
/// 支持 WebSocket 连接、轮询回退和断连恢复。
class ExecutionMonitorScreen extends ConsumerStatefulWidget {
  const ExecutionMonitorScreen({super.key, required this.executionId});

  final String executionId;

  @override
  ConsumerState<ExecutionMonitorScreen> createState() =>
      _ExecutionMonitorScreenState();
}

class _ExecutionMonitorScreenState
    extends ConsumerState<ExecutionMonitorScreen> {
  @override
  Widget build(BuildContext context) {
    final monitorAsync = ref.watch(
      executionMonitorProvider(widget.executionId),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('执行监控')),
      body: _buildBody(context, monitorAsync),
    );
  }

  Widget _buildBody(
    BuildContext context,
    AsyncValue<ExecutionMonitorState> monitorAsync,
  ) {
    // Riverpod 3.x error guard: AsyncLoading 可能携带 error
    if (monitorAsync.hasError && !monitorAsync.hasValue) {
      return _buildErrorView(monitorAsync.error.toString());
    }

    return monitorAsync.when(
      loading: _buildLoadingView,
      error: (error, _) => _buildErrorView(error.toString()),
      data: (state) => switch (state) {
        ExecutionMonitorLoading() => _buildLoadingView(),
        ExecutionMonitorError(:final message) => _buildErrorView(message),
        ExecutionMonitorDisconnected(:final lastSnapshot, :final runtime) =>
          _buildDisconnectedView(context, lastSnapshot, runtime),
        ExecutionMonitorConnected(
          :final snapshot,
          :final connectionMode,
          :final runtime,
        ) =>
          _buildConnectedView(context, snapshot, connectionMode, runtime),
        ExecutionMonitorPolling(
          :final snapshot,
          :final connectionMode,
          :final runtime,
        ) =>
          _buildConnectedView(context, snapshot, connectionMode, runtime),
      },
    );
  }

  Widget _buildLoadingView() {
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildErrorView(String message) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () =>
                  ref.invalidate(executionMonitorProvider(widget.executionId)),
              icon: const Icon(Icons.refresh),
              label: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisconnectedView(
    BuildContext context,
    ExecutionStateSnapshot? lastSnapshot,
    ExecutionMonitorRuntimeData runtime,
  ) {
    if (lastSnapshot == null) {
      return _buildErrorView('执行已结束');
    }

    final executionStatus = lastSnapshot.executionStatus;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (executionStatus == ExecutionStatus.completed)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Execution completed',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ExecutionStatusHeader(
            snapshot: lastSnapshot,
            connectionMode: ConnectionMode.disconnected,
          ),
          ExecutionAlertBanner(snapshot: lastSnapshot),
          ExecutionWaterfall(
            snapshot: lastSnapshot,
            runtime: runtime,
            onOpenAgentStep: (step) {
              context.pushNamed(
                RouteNames.workflowAgentViewer,
                pathParameters: {
                  'executionId': widget.executionId,
                  'stepId': step.stepId,
                },
              );
            },
            onOpenOutputStep: (step) {
              context.pushNamed(
                RouteNames.workflowOutputViewer,
                pathParameters: {
                  'executionId': widget.executionId,
                  'stepId': step.stepId,
                },
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildConnectedView(
    BuildContext context,
    ExecutionStateSnapshot snapshot,
    ConnectionMode connectionMode,
    ExecutionMonitorRuntimeData runtime,
  ) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ExecutionStatusHeader(
            snapshot: snapshot,
            connectionMode: connectionMode,
          ),
          ExecutionAlertBanner(snapshot: snapshot),
          ExecutionWaterfall(
            snapshot: snapshot,
            runtime: runtime,
            onOpenAgentStep: (step) {
              context.pushNamed(
                RouteNames.workflowAgentViewer,
                pathParameters: {
                  'executionId': widget.executionId,
                  'stepId': step.stepId,
                },
              );
            },
            onOpenOutputStep: (step) {
              context.pushNamed(
                RouteNames.workflowOutputViewer,
                pathParameters: {
                  'executionId': widget.executionId,
                  'stepId': step.stepId,
                },
              );
            },
          ),
        ],
      ),
    );
  }
}
