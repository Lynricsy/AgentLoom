import 'package:flutter/material.dart';

import '../models/execution_summary_dto.dart';

/// 执行摘要条目（工作流详情页用）
class ExecutionSummaryTile extends StatelessWidget {
  final ExecutionSummaryDto execution;
  final VoidCallback? onTap;

  const ExecutionSummaryTile({super.key, required this.execution, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _statusIcon(execution.status);

    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.12),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(
        '运行 #${execution.id.length >= 8 ? execution.id.substring(0, 8) : execution.id}',
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        _formatTimestamp(execution.createdAt),
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
      trailing: _buildProgress(context),
    );
  }

  Widget? _buildProgress(BuildContext context) {
    final total = execution.totalSteps;
    final completed = execution.completedSteps;
    if (total == null || total == 0) return null;

    final theme = Theme.of(context);
    return Text(
      '${completed ?? 0}/$total',
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }

  (IconData, Color) _statusIcon(String status) {
    return switch (status) {
      'completed' => (Icons.check_circle, Colors.green),
      'failed' => (Icons.error, Colors.red),
      'running' => (Icons.play_circle, Colors.blue),
      'pending' => (Icons.schedule, Colors.orange),
      'cancelled' => (Icons.cancel, Colors.grey),
      _ => (Icons.help, Colors.grey),
    };
  }

  String _formatTimestamp(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return '刚刚';
      if (diff.inMinutes < 60) return '${diff.inMinutes}分钟前';
      if (diff.inHours < 24) return '${diff.inHours}小时前';
      if (diff.inDays < 7) return '${diff.inDays}天前';
      return '${date.month}/${date.day}/${date.year}';
    } catch (_) {
      return isoDate;
    }
  }
}
