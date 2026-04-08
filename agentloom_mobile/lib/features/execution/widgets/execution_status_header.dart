import 'package:flutter/material.dart';

import '../models/execution_state.dart';
import '../models/execution_status.dart';
import '../providers/execution_monitor_provider.dart';
import 'connection_mode_indicator.dart';

/// 执行状态头部
///
/// 展示执行状态徽章、连接模式、进度条和步骤完成统计。
class ExecutionStatusHeader extends StatelessWidget {
  const ExecutionStatusHeader({
    super.key,
    required this.snapshot,
    required this.connectionMode,
  });

  final ExecutionStateSnapshot snapshot;
  final ConnectionMode connectionMode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final executionStatus = snapshot.executionStatus;
    final completedSteps = snapshot.completedSteps ?? 0;
    final totalSteps = snapshot.totalSteps ?? 0;
    final progress = totalSteps > 0 ? completedSteps / totalSteps : 0.0;

    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 状态徽章 + 连接模式
            Row(
              children: [
                _StatusBadge(status: executionStatus),
                const Spacer(),
                ConnectionModeIndicator(mode: connectionMode),
              ],
            ),
            const SizedBox(height: 16),
            // 进度条
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                backgroundColor: theme.colorScheme.surfaceContainerHighest,
                color: executionStatus.color,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 8),
            // 步骤统计
            Text(
              '$completedSteps / $totalSteps 步',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            // 开始时间
            Text(
              _startTimeText(),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 从第一个有 startedAt 的步骤提取开始时间
  String _startTimeText() {
    for (final step in snapshot.steps) {
      if (step.startedAt != null) {
        final dt = DateTime.tryParse(step.startedAt!);
        if (dt != null) {
          final hour = dt.hour.toString().padLeft(2, '0');
          final minute = dt.minute.toString().padLeft(2, '0');
          final second = dt.second.toString().padLeft(2, '0');
          return '开始于 $hour:$minute:$second';
        }
        return '开始于 ${step.startedAt}';
      }
    }
    return '未开始';
  }
}

/// 执行状态徽章
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final ExecutionStatus status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(status.icon, color: status.color, size: 16),
          const SizedBox(width: 6),
          Text(
            status.label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: status.color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
